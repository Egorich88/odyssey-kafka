package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGSSAPIFailsBeforeFilesDNSOrTransport(t *testing.T) {
	for _, cfg := range []kafkaAuthConfig{
		{AuthType: "SASL_GSSAPI", KerberosConfigPath: "/must-not-be-read/krb5.conf", KerberosKeytabPath: "/must-not-be-read/keytab"},
		{AuthType: "SASL", SASLMechanism: "GSSAPI"},
		{AuthType: "PLAINTEXT", SASLMechanism: "KERBEROS"},
	} {
		if config, err := buildKafkaConfig(cfg); err == nil || config != nil {
			t.Fatal("GSSAPI не закрыт до инициализации клиента")
		}
	}
}

func TestPersistedGSSAPICannotUsePlaintextFallback(t *testing.T) {
	s, _, _ := testOwnerStore(t)
	p, err := s.putProfile(storedKafkaProfile{Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092", AuthType: "SASL_GSSAPI"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	old := activeProfileStore
	activeProfileStore = s
	t.Cleanup(func() { activeProfileStore = old })
	if len(kafkaProfileBrokers(profileKey(p))) != 0 {
		t.Fatal("сохранённый GSSAPI открыл endpoint")
	}
	cfg, revision := kafkaConfigAndRevision(profileKey(p))
	if revision != 0 || !cfg.Net.TLS.Enable || !cfg.Net.SASL.Enable {
		t.Fatal("небезопасный fallback")
	}
	if _, err = cfg.Net.Proxy.Dialer.Dial("tcp", "192.0.2.1:9092"); err == nil {
		t.Fatal("небезопасный транспорт")
	}
}

func TestHTTPRejectsKerberosPathsWithoutChangingProfile(t *testing.T) {
	a := testOwnerAuth(t, false)
	cookie, csrf := testOwnerLogin(t, a)
	policy, _ := newKafkaAddressPolicy("192.0.2.0/24", "9092")
	api := &profileAPI{store: a.store, auth: a, policy: policy}
	for _, extra := range []string{`"authType":"SASL_GSSAPI"`, `"kerberosConfigPath":"/arbitrary/krb5.conf"`, `"kerberosKeytabPath":"/arbitrary/keytab"`} {
		r := ownerRequest(a, "POST", "/api/kafka-profiles", `{"config":{"brokers":"192.0.2.1:9092",`+extra+`}}`)
		r.AddCookie(cookie)
		r.Header.Set("X-CSRF-Token", csrf)
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		if w.Code != 403 || len(a.store.profiles()) != 0 || strings.Contains(w.Body.String(), "/arbitrary") {
			t.Fatal("пути Kerberos приняты или раскрыты")
		}
	}
}
