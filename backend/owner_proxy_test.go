package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"strings"
	"testing"
)

// Проверяем реальный TLS на обоих участках без Kafka и без постоянных портов.
func TestOwnerVerifiedTLSProxyAndRestart(t *testing.T) {
	store, data, key := testOwnerStore(t)
	auth, err := newOwnerAuth(store, "https://localhost")
	if err != nil {
		t.Fatal(err)
	}
	policy, err := newKafkaAddressPolicy("192.0.2.0/24", "9092")
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/kafka-profiles", &profileAPI{store: store, auth: auth, policy: policy})
	backend := httptest.NewTLSServer(auth.handler(mux))
	defer backend.Close()
	target, _ := url.Parse(backend.URL)
	proxy := httputil.NewSingleHostReverseProxy(target)
	roots := x509.NewCertPool()
	roots.AddCert(backend.Certificate())
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}
	defer transport.CloseIdleConnections()
	proxy.Transport = transport
	frontend := httptest.NewTLSServer(proxy)
	defer frontend.Close()
	auth.origin = frontend.URL
	client := frontend.Client()
	client.Jar, _ = cookiejar.New(nil)
	request := func(method, path, body, csrf, origin string) (int, []byte, []*http.Cookie) {
		t.Helper()
		r, err := http.NewRequest(method, frontend.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		response, err := client.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		b, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
		if err != nil {
			t.Fatal(err)
		}
		return response.StatusCode, b, response.Cookies()
	}
	code, body, cookies := request("POST", "/api/auth/login", `{"password":"`+testOwnerPassword+`"}`, "", frontend.URL)
	if code != 200 || len(cookies) != 1 || !cookies[0].Secure || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatal("небезопасная сессия за TLS proxy")
	}
	var login struct {
		CSRF string `json:"csrfToken"`
	}
	if json.Unmarshal(body, &login) != nil || login.CSRF == "" {
		t.Fatal("нет CSRF")
	}
	profile := `{"name":"synthetic","config":{"brokers":"192.0.2.1:9092,192.0.2.2:9092","authType":"SASL","saslMechanism":"SCRAM-SHA-512","username":"synthetic-user","password":"synthetic-kafka-secret"}}`
	for _, denied := range []struct{ csrf, origin string }{{"", frontend.URL}, {login.CSRF, "https://other.invalid"}} {
		code, _, _ = request("POST", "/api/kafka-profiles", profile, denied.csrf, denied.origin)
		if code != 401 || len(store.profiles()) != 0 {
			t.Fatal("CSRF не остановил изменение")
		}
	}
	code, body, _ = request("POST", "/api/kafka-profiles", profile, login.CSRF, frontend.URL)
	if code != 201 || strings.Contains(string(body), "synthetic-kafka-secret") {
		t.Fatal("профиль не сохранён безопасно")
	}
	code, body, _ = request("GET", "/api/kafka-profiles", "", "", frontend.URL)
	if code != 200 || strings.Contains(string(body), "synthetic-kafka-secret") {
		t.Fatal("утечка секрета")
	}
	reopened, err := openOwnerStore(data, key)
	if err != nil || len(reopened.profiles()) != 1 {
		t.Fatal("профиль потерян после перезапуска")
	}
	p, ok := reopened.profile(store.profiles()[0].ID)
	if !ok || p.Config.Password != "synthetic-kafka-secret" || p.Config.Bootstrap != "192.0.2.1:9092,192.0.2.2:9092" {
		t.Fatal("конфигурация изменилась")
	}
	restarted, err := newOwnerAuth(reopened, frontend.URL)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/api/auth/session", nil)
	r.TLS = &tls.ConnectionState{}
	r.AddCookie(cookies[0])
	if restarted.allowed(r, false) {
		t.Fatal("сессия пережила перезапуск")
	}
}

func TestOwnerProxyRejectsUntrustedBackendCertificate(t *testing.T) {
	calls := 0
	backend := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(200) }))
	defer backend.Close()
	target, _ := url.Parse(backend.URL)
	proxy := httputil.NewSingleHostReverseProxy(target)
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: x509.NewCertPool(), MinVersion: tls.VersionTLS12}}
	defer transport.CloseIdleConnections()
	proxy.Transport = transport
	proxy.ErrorLog = nil
	w := httptest.NewRecorder()
	proxy.ServeHTTP(w, httptest.NewRequest("GET", "https://odyssey.test/api/health", nil))
	if w.Code != 502 || calls != 0 {
		t.Fatal("недоверенный backend получил HTTP-запрос")
	}
}
