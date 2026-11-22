package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOwnerAdministrationRequiresSessionCSRFAuthorizedProfile(t *testing.T) {
	a := testOwnerAuth(t, false)
	p, err := a.store.putProfile(storedKafkaProfile{Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092", AuthType: "PLAINTEXT"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	oldStore, oldPolicy := activeProfileStore, kafkaAdminPolicy
	activeProfileStore = a.store
	kafkaAdminPolicy = ownerKafkaAdministration{auth: a, store: a.store}
	t.Cleanup(func() { activeProfileStore = oldStore; kafkaAdminPolicy = oldPolicy })
	admin, calls := setupPolicyTestAdmin(t)
	cookie, csrf := testOwnerLogin(t, a)
	for _, mode := range []string{"anonymous", "csrf", "unknown", "owner"} {
		r := ownerRequest(a, http.MethodPost, "/api/topics", `{"topic":"test-topic","partitions":1,"replicationFactor":1}`)
		r.Header.Set("X-Kafka-Profile-ID", p.ID)
		r.Header.Set("X-Kafka-Profile-Revision", "1")
		if mode != "anonymous" {
			r.AddCookie(cookie)
		}
		if mode != "csrf" {
			r.Header.Set("X-CSRF-Token", csrf)
		}
		if mode == "unknown" {
			r.Header.Set("X-Kafka-Profile-ID", "foreign-profile")
		}
		w := httptest.NewRecorder()
		before := admin.writes
		a.handler(policyTestMux()).ServeHTTP(w, r)
		if mode != "owner" && (admin.writes != before || *calls != 0) {
			t.Fatal("запрещённая операция достигла Kafka")
		}
		if mode == "owner" && (admin.writes != before+1 || *calls != 1) {
			t.Fatalf("операция владельца не разрешена: %d %s", w.Code, w.Body.String())
		}
	}
	r := ownerRequest(a, "GET", "/api/capabilities", "")
	r.AddCookie(cookie)
	r.Header.Set("X-Kafka-Profile-ID", p.ID)
	w := httptest.NewRecorder()
	a.handler(policyTestMux()).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	if kafkaAdminPolicy.Allowed(r, adminManageACL) {
		t.Fatal("несуществующий ACL API разрешён")
	}
}

func TestOwnerWriteRejectsProfileChangedInAnotherSession(t *testing.T) {
	a := testOwnerAuth(t, false)
	p, err := a.store.putProfile(storedKafkaProfile{Config: kafkaAuthConfig{Bootstrap: "192.0.2.1:9092", AuthType: "PLAINTEXT"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	oldStore, oldPolicy := activeProfileStore, kafkaAdminPolicy
	activeProfileStore = a.store
	kafkaAdminPolicy = ownerKafkaAdministration{auth: a, store: a.store}
	t.Cleanup(func() { activeProfileStore = oldStore; kafkaAdminPolicy = oldPolicy })
	admin, calls := setupPolicyTestAdmin(t)
	cookie, csrf := testOwnerLogin(t, a)
	p.Config.Bootstrap = "192.0.2.2:9092"
	if _, err = a.store.putProfile(p, false); err != nil {
		t.Fatal(err)
	}
	for _, revision := range []string{"", "1", "2"} {
		r := ownerRequest(a, "DELETE", "/api/topics/test-topic", "")
		r.AddCookie(cookie)
		r.Header.Set("X-CSRF-Token", csrf)
		r.Header.Set("X-Kafka-Profile-ID", p.ID)
		r.Header.Set("X-Kafka-Profile-Revision", revision)
		w := httptest.NewRecorder()
		a.handler(policyTestMux()).ServeHTTP(w, r)
		if revision != "2" && (w.Code != 409 || admin.writes != 0 || *calls != 0) {
			t.Fatal("устаревший профиль достиг Kafka", w.Code)
		}
		if revision == "2" && admin.writes != 1 {
			t.Fatal("актуальная ревизия не разрешена", w.Code)
		}
	}
}
