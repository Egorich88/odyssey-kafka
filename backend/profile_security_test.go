package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

func TestProfileStoreDistinctIDsAndPersistence(t *testing.T) {
	s, data, key := testOwnerStore(t)
	p := storedKafkaProfile{Name: "test", Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092,192.0.2.2:9092", AuthType: "PLAINTEXT", Password: "synthetic-secret"}}
	a, err := s.putProfile(p, true)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.putProfile(p, true)
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == b.ID || len(a.ID) != 43 {
		t.Fatal("ID совпали")
	}
	reopened, err := openOwnerStore(data, key)
	if err != nil {
		t.Fatal(err)
	}
	loaded, ok := reopened.profile(a.ID)
	if !ok || loaded.Config != a.Config {
		t.Fatal("профиль потерян")
	}
	metadata, _ := json.Marshal(reopened.profiles())
	if strings.Contains(string(metadata), "synthetic-secret") {
		t.Fatal("секрет в ответе")
	}
	oldStore := activeProfileStore
	activeProfileStore = reopened
	t.Cleanup(func() { activeProfileStore = oldStore })
	if len(kafkaProfileBrokers(a.Config.Bootstrap)) != 0 {
		t.Fatal("доступ по bootstrap")
	}
	if len(kafkaProfileBrokers(profileKey(a))) != 2 {
		t.Fatal("несколько bootstrap потеряны")
	}
}

func TestProfileStoreMigrationRetryAndRevision(t *testing.T) {
	s, _, _ := testOwnerStore(t)
	p := storedKafkaProfile{MigrationKey: "local-test-id", Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092", AuthType: "PLAINTEXT"}}
	a, err := s.putProfile(p, true)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.putProfile(p, true)
	if err != nil || b.ID != a.ID {
		t.Fatal("неидемпотентная миграция")
	}
	p.Config.Bootstrap = "192.0.2.2:9092"
	if _, err = s.putProfile(p, true); err == nil {
		t.Fatal("конфликт переноса не обнаружен")
	}
	a.Config = p.Config
	updated, err := s.putProfile(a, false)
	if err != nil || updated.Revision != 2 {
		t.Fatal(err)
	}
	if _, err = s.putProfile(a, false); err == nil {
		t.Fatal("устаревшая запись принята")
	}
	if s.removeProfile(a.ID, 1) == nil {
		t.Fatal("устаревшее удаление принято")
	}
}

func TestProfileAPIDeniesAndPreservesInvalidUpdate(t *testing.T) {
	a := testOwnerAuth(t, false)
	policy, _ := newKafkaAddressPolicy("192.0.2.0/24", "9092")
	api := &profileAPI{store: a.store, auth: a, policy: policy}
	c, csrf := testOwnerLogin(t, a)
	body := `{"name":"test","config":{"brokers":"192.0.2.1:9092","authType":"PLAINTEXT"}}`
	request := func(method, path, body string, authorized bool) *httptest.ResponseRecorder {
		r := ownerRequest(a, method, path, body)
		if authorized {
			r.AddCookie(c)
			r.Header.Set("X-CSRF-Token", csrf)
		}
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		return w
	}
	if w := request("POST", "/api/kafka-profiles", body, false); w.Code != 401 || len(a.store.profiles()) != 0 {
		t.Fatal("анонимная регистрация")
	}
	w := request("POST", "/api/kafka-profiles", body, true)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var p kafkaProfileMetadata
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if request("DELETE", "/api/kafka-profiles/"+p.ID, "", false).Code != 401 {
		t.Fatal("анонимное удаление")
	}
	invalid := `{"revision":1,"config":{"brokers":"192.0.2.1:9092","authType":"MTLS"}}`
	if request("PUT", "/api/kafka-profiles/"+p.ID, invalid, true).Code != 400 {
		t.Fatal("невалидная конфигурация принята")
	}
	if saved, ok := a.store.profile(p.ID); !ok || saved.Revision != 1 || saved.Config.AuthType != "PLAINTEXT" {
		t.Fatal("прежний профиль потерян")
	}
}

func TestProfileSelectionRequiresSessionAndServerID(t *testing.T) {
	a := testOwnerAuth(t, false)
	p, err := a.store.putProfile(storedKafkaProfile{Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	old := activeProfileStore
	activeProfileStore = a.store
	t.Cleanup(func() { activeProfileStore = old })
	c, _ := testOwnerLogin(t, a)
	for _, mode := range []string{"anonymous", "bootstrap", "unknown", "valid"} {
		r := ownerRequest(a, "GET", "/api/overview", "")
		r.Header.Set("X-Kafka-Profile-ID", p.ID)
		if mode != "anonymous" {
			r.AddCookie(c)
		}
		if mode == "bootstrap" {
			r.Header.Del("X-Kafka-Profile-ID")
			r.Header.Set("X-Kafka-Bootstrap", p.Config.Bootstrap)
		}
		if mode == "unknown" {
			r.Header.Set("X-Kafka-Profile-ID", "unknown")
		}
		called := false
		w := httptest.NewRecorder()
		a.handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			if getProfileKeyFromRequest(r) != profileKey(p) {
				t.Error("неверный профиль")
			}
		})).ServeHTTP(w, r)
		if called != (mode == "valid") {
			t.Fatal(mode, w.Code)
		}
	}
}

func TestKafkaAddressPolicyNoOutboundBypass(t *testing.T) {
	p, err := newKafkaAddressPolicy("192.0.2.0/24", "9092,9094")
	if err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"127.0.0.1:9092", "169.254.169.254:9092", "192.0.2.1:80", "192.0.2.1:9092,,"} {
		if p.validateBootstrap(address) == nil {
			t.Fatal(address)
		}
	}
	calls := 0
	p.dial = func(context.Context, string, string) (net.Conn, error) { calls++; return nil, errKafkaAddress }
	p.lookup = func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("192.0.2.1")}, {IP: net.ParseIP("127.0.0.1")}}, nil
	}
	if _, err = p.Dial("tcp", "advertised.test:9092"); err == nil || calls != 0 {
		t.Fatal("DNS rebinding/advertised endpoint")
	}
	p.lookup = func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("192.0.2.1")}}, nil
	}
	p.dial = func(_ context.Context, _ string, address string) (net.Conn, error) {
		calls++
		if address != "192.0.2.1:9092" {
			t.Error("повторный DNS")
		}
		return nil, errKafkaAddress
	}
	_, _ = p.Dial("tcp", "allowed.test:9092")
	if calls != 1 {
		t.Fatal(calls)
	}
}

func TestKafkaAddressPolicyKeepsConfirmedRefusal(t *testing.T) {
	for _, mixed := range []bool{false, true} {
		p, _ := newKafkaAddressPolicy("192.0.2.0/24", "9092")
		p.lookup = func(context.Context, string) ([]net.IPAddr, error) {
			ips := []net.IPAddr{{IP: net.ParseIP("192.0.2.1")}}
			if mixed {
				ips = append(ips, net.IPAddr{IP: net.ParseIP("192.0.2.2")})
			}
			return ips, nil
		}
		p.dial = func(_ context.Context, _ string, address string) (net.Conn, error) {
			if strings.HasPrefix(address, "192.0.2.2:") {
				return nil, context.DeadlineExceeded
			}
			return nil, &net.OpError{Op: "dial", Err: syscall.ECONNREFUSED}
		}
		_, err := p.Dial("tcp", "broker.test:9092")
		expect := brokerOffline
		if mixed {
			expect = brokerUnknown
		}
		if observedBrokerStatus(nil, err) != expect {
			t.Fatalf("mixed=%v: потеряна семантика отказа", mixed)
		}
	}
}

func TestProfileWriteFailurePreservesPreviousData(t *testing.T) {
	s, data, key := testOwnerStore(t)
	p, err := s.putProfile(storedKafkaProfile{Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092", AuthType: "PLAINTEXT"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	originalPath := s.path
	// Искусственная ошибка записи/rename, только временные синтетические файлы.
	for _, failure := range []string{"write", "rename"} {
		if failure == "write" {
			s.path = filepath.Join(data, "absent", "owner.enc")
		} else {
			s.path = filepath.Join(data, "target-directory")
			if err = os.Mkdir(s.path, 0700); err != nil {
				t.Fatal(err)
			}
		}
		next := p
		next.Name = "changed"
		if _, err = s.putProfile(next, false); err == nil {
			t.Fatal("ожидалась ошибка сохранения")
		}
		if saved, _ := s.profile(p.ID); saved.Revision != p.Revision || saved.Name != p.Name {
			t.Fatal("память повреждена")
		}
	}
	s.path = originalPath
	reopened, err := openOwnerStore(data, key)
	if err != nil {
		t.Fatal(err)
	}
	if saved, _ := reopened.profile(p.ID); saved.Revision != p.Revision || saved.Name != p.Name {
		t.Fatal("файл повреждён")
	}
}

func TestRemovedProfileStopsCollectors(t *testing.T) {
	store, _, _ := testOwnerStore(t)
	const key = "synthetic-profile:1"
	tc := NewThroughputCollector(key, 2)
	collectorMu.Lock()
	collectorByBootstrap[key] = tc
	collectorMu.Unlock()
	stopOldProfileCollectors(store, "synthetic-profile")
	stopOldProfileCollectors(store, "synthetic-profile")
	select {
	case <-tc.stopChan:
	default:
		t.Fatal("сборщик не остановлен")
	}
	collectorMu.RLock()
	c := collectorByBootstrap[key]
	collectorMu.RUnlock()
	if c != nil {
		t.Fatal("сборщик не удалён")
	}
}

func TestLateCleanupKeepsCurrentCollector(t *testing.T) {
	s, _, _ := testOwnerStore(t)
	p, err := s.putProfile(storedKafkaProfile{Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	p, err = s.putProfile(p, false)
	if err != nil {
		t.Fatal(err)
	}
	oldKey := profileKey(p)
	p, err = s.putProfile(p, false)
	if err != nil {
		t.Fatal(err)
	}
	key := profileKey(p)
	c := NewThroughputCollector(key, 2)
	collectorMu.Lock()
	collectorByBootstrap[key] = c
	collectorMu.Unlock()
	consumerLagStateMu.Lock()
	consumerLagState[oldKey] = map[string]consumerLagSnapshot{}
	consumerLagStateMu.Unlock()
	// Сначала cleanup ревизии 3, затем запоздавший cleanup PUT ревизии 2.
	stopOldProfileCollectors(s, p.ID)
	stopOldProfileCollectors(s, p.ID)
	select {
	case <-c.stopChan:
		t.Fatal("остановлен актуальный сборщик")
	default:
	}
	consumerLagStateMu.Lock()
	_, exists := consumerLagState[oldKey]
	consumerLagStateMu.Unlock()
	if exists {
		t.Fatal("старый lag cache сохранён")
	}
	if err = s.removeProfile(p.ID, p.Revision); err != nil {
		t.Fatal(err)
	}
	stopOldProfileCollectors(s, p.ID)
}

func TestProfileMetadataEditKeepsCredentialsOnServer(t *testing.T) {
	a := testOwnerAuth(t, false)
	p, err := a.store.putProfile(storedKafkaProfile{Name: "old", Config: kafkaAuthConfig{
		Bootstrap: "192.0.2.1:9094", AuthType: "SASL_SCRAM", SASLMechanism: "SCRAM-SHA-512",
		Username: "synthetic-kept-user", Password: "synthetic-kept-password",
	}}, true)
	if err != nil {
		t.Fatal(err)
	}
	policy, _ := newKafkaAddressPolicy("192.0.2.0/24", "9094")
	api := &profileAPI{store: a.store, auth: a, policy: policy}
	cookie, csrf := testOwnerLogin(t, a)
	r := ownerRequest(a, "PUT", "/api/kafka-profiles/"+p.ID, `{"name":"new","revision":1,"preserveSecrets":true,"config":{"brokers":"192.0.2.1:9094","authType":"SASL_SCRAM","saslMechanism":"SCRAM-SHA-512","username":"","password":""}}`)
	r.AddCookie(cookie)
	r.Header.Set("X-CSRF-Token", csrf)
	w := httptest.NewRecorder()
	api.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	saved, ok := a.store.profile(p.ID)
	if !ok || saved.Revision != 2 || saved.Config.Username != p.Config.Username || saved.Config.Password != p.Config.Password {
		t.Fatal("учётные данные потеряны при редактировании метаданных")
	}
	if strings.Contains(w.Body.String(), "synthetic-kept") {
		t.Fatal("секрет возвращён в ответе API")
	}
}
