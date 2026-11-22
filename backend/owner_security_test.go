package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const testOwnerPassword = "synthetic-owner-password"

func testOwnerStore(t *testing.T) (*ownerStore, string, string) {
	t.Helper()
	root := t.TempDir()
	data, keyDir := filepath.Join(root, "data"), filepath.Join(root, "keys")
	if err := makePrivateDirectory(keyDir); err != nil {
		t.Fatal(err)
	}
	key := filepath.Join(keyDir, "key")
	if err := createOwnerStore(data, key, []byte(testOwnerPassword)); err != nil {
		t.Fatal(err)
	}
	s, err := openOwnerStore(data, key)
	if err != nil {
		t.Fatal(err)
	}
	return s, data, key
}

func TestOwnerStoreRoundTrip(t *testing.T) {
	s, data, key := testOwnerStore(t)
	if len(s.data.Owner.Hash) != 32 || bytes.Contains(s.data.Owner.Hash, []byte(testOwnerPassword)) {
		t.Fatal("неверный хеш")
	}
	sealed, err := os.ReadFile(filepath.Join(data, "owner.enc"))
	if err != nil || bytes.Contains(sealed, []byte("owner")) || bytes.Contains(sealed, []byte(testOwnerPassword)) {
		t.Fatal("утечка открытых данных")
	}
	before := append([]byte(nil), sealed...)
	if createOwnerStore(data, key, []byte("other-synthetic-password")) == nil {
		t.Fatal("повторная регистрация разрешена")
	}
	after, _ := os.ReadFile(filepath.Join(data, "owner.enc"))
	if !bytes.Equal(before, after) {
		t.Fatal("данные изменены")
	}
	if _, err = openOwnerStore(data, key); err != nil {
		t.Fatal(err)
	}
}

func TestOwnerStoreTamperAndMissingKey(t *testing.T) {
	for _, mode := range []string{"tamper", "key", "missing"} {
		t.Run(mode, func(t *testing.T) {
			_, data, key := testOwnerStore(t)
			switch mode {
			case "tamper":
				p := filepath.Join(data, "owner.enc")
				b, _ := os.ReadFile(p)
				b[len(b)-1] ^= 1
				if err := os.WriteFile(p, b, 0600); err != nil {
					t.Fatal(err)
				}
			case "key":
				if err := os.WriteFile(key, make([]byte, 32), 0600); err != nil {
					t.Fatal(err)
				}
			case "missing":
				key = filepath.Join(filepath.Dir(key), "absent")
			}
			if _, err := openOwnerStore(data, key); err == nil {
				t.Fatal("небезопасное восстановление")
			}
		})
	}
}

func TestOwnerStoreKeySeparation(t *testing.T) {
	root := t.TempDir()
	for _, p := range []string{filepath.Join(root, "key"), filepath.Join(root, "nested", "key")} {
		if _, _, err := ownerStorePaths(root, p); err == nil {
			t.Fatal("ключ внутри данных")
		}
	}
}

func TestOwnerStoreConcurrentInit(t *testing.T) {
	root := t.TempDir()
	keys := filepath.Join(root, "keys")
	if err := makePrivateDirectory(keys); err != nil {
		t.Fatal(err)
	}
	data, key := filepath.Join(root, "data"), filepath.Join(keys, "key")
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- createOwnerStore(data, key, []byte(testOwnerPassword)) }()
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatalf("успешных регистраций: %d", success)
	}
	if _, err := openOwnerStore(data, key); err != nil {
		t.Fatal(err)
	}
}

func testOwnerAuth(t *testing.T, secure bool) *ownerAuth {
	t.Helper()
	s, _, _ := testOwnerStore(t)
	origin := "http://localhost:5173"
	if secure {
		origin = "https://odyssey.test"
	}
	a, err := newOwnerAuth(s, origin)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func ownerRequest(a *ownerAuth, method, path, body string) *http.Request {
	r := httptest.NewRequest(method, a.origin+path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:12345"
	r.Header.Set("Origin", a.origin)
	r.Header.Set("Content-Type", "application/json")
	return r
}

func testOwnerLogin(t *testing.T, a *ownerAuth) (*http.Cookie, string) {
	t.Helper()
	r := ownerRequest(a, "POST", "/api/auth/login", `{"password":"`+testOwnerPassword+`"}`)
	w := httptest.NewRecorder()
	a.handler(http.NotFoundHandler()).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("вход: %d", w.Code)
	}
	var res map[string]string
	if json.Unmarshal(w.Body.Bytes(), &res) != nil {
		t.Fatal("JSON")
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("cookie")
	}
	return cookies[0], res["csrfToken"]
}

func TestOwnerSessionCookies(t *testing.T) {
	for _, secure := range []bool{false, true} {
		t.Run(map[bool]string{false: "loopback", true: "https"}[secure], func(t *testing.T) {
			a := testOwnerAuth(t, secure)
			c, csrf := testOwnerLogin(t, a)
			if !c.HttpOnly || c.Secure != secure || c.SameSite != http.SameSiteStrictMode || c.Domain != "" || c.Path != "/" || len(csrf) != 43 {
				t.Fatal("небезопасная cookie")
			}
			r := ownerRequest(a, "POST", "/api/protected", "")
			r.AddCookie(c)
			r.Header.Set("X-CSRF-Token", csrf)
			called := false
			w := httptest.NewRecorder()
			a.handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) })).ServeHTTP(w, r)
			if !called || w.Code != 204 {
				t.Fatal("сеанс не принят")
			}
		})
	}
}

func TestOwnerUnauthorizedNeverCallsHandler(t *testing.T) {
	a := testOwnerAuth(t, false)
	c, csrf := testOwnerLogin(t, a)
	for _, mode := range []string{"anonymous", "csrf", "origin", "remote", "forged", "forwarded"} {
		t.Run(mode, func(t *testing.T) {
			r := ownerRequest(a, "POST", "/api/clusters/config", "")
			r.AddCookie(c)
			r.Header.Set("X-CSRF-Token", csrf)
			switch mode {
			case "anonymous":
				r.Header.Del("Cookie")
			case "csrf":
				r.Header.Del("X-CSRF-Token")
			case "origin":
				r.Header.Set("Origin", "https://foreign.test")
			case "remote":
				r.RemoteAddr = "192.0.2.1:1"
			case "forged":
				r.Header.Set("Cookie", ownerCookie+"="+strings.Repeat("x", 43))
			case "forwarded":
				r.RemoteAddr = "192.0.2.1:1"
				r.Header.Set("X-Forwarded-For", "127.0.0.1")
				r.Header.Set("X-Forwarded-Proto", "https")
			}
			called := false
			w := httptest.NewRecorder()
			a.handler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true })).ServeHTTP(w, r)
			if called || w.Code != 401 {
				t.Fatalf("обход авторизации: %d", w.Code)
			}
		})
	}
}

func TestOwnerExpiryLogoutAndRestart(t *testing.T) {
	for _, mode := range []string{"idle", "absolute", "logout", "restart"} {
		t.Run(mode, func(t *testing.T) {
			a := testOwnerAuth(t, false)
			now := time.Now()
			a.now = func() time.Time { return now }
			c, csrf := testOwnerLogin(t, a)
			switch mode {
			case "idle":
				now = now.Add(31 * time.Minute)
			case "absolute":
				now = now.Add(9 * time.Hour)
			case "logout":
				r := ownerRequest(a, "POST", "/api/auth/logout", "")
				r.AddCookie(c)
				r.Header.Set("X-CSRF-Token", csrf)
				w := httptest.NewRecorder()
				a.handler(http.NotFoundHandler()).ServeHTTP(w, r)
				if w.Code != 204 {
					t.Fatal(w.Code)
				}
			case "restart":
				var err error
				a, err = newOwnerAuth(a.store, a.origin)
				if err != nil {
					t.Fatal(err)
				}
			}
			r := ownerRequest(a, "GET", "/api/protected", "")
			r.AddCookie(c)
			if a.allowed(r, false) {
				t.Fatal("недействующий сеанс принят")
			}
		})
	}
}

func TestOwnerLoginRateAndErrors(t *testing.T) {
	a := testOwnerAuth(t, false)
	for i := 0; i < 6; i++ {
		w := httptest.NewRecorder()
		a.login(w, ownerRequest(a, "POST", "/api/auth/login", `{"password":"incorrect-synthetic-password"}`))
		expected := 401
		if i == 5 {
			expected = 429
		}
		if w.Code != expected {
			t.Fatal(w.Code)
		}
	}
}

func TestOwnerOriginAndTransport(t *testing.T) {
	for _, origin := range []string{"http://192.0.2.1", "https://user:pass@host", "https://host/", "https://host?x=y", ""} {
		if _, err := newOwnerAuth(nil, origin); err == nil {
			t.Fatal(origin)
		}
	}
	a := testOwnerAuth(t, true)
	r := ownerRequest(a, "POST", "/api/auth/login", "")
	r.TLS = nil
	if a.transportOK(r) {
		t.Fatal("HTTPS подменён")
	}
	r.TLS = &tls.ConnectionState{}
	if !a.transportOK(r) {
		t.Fatal("TLS")
	}
}

func TestOwnerPublicVersionCheck(t *testing.T) {
	a := testOwnerAuth(t, false)
	for _, path := range []string{"/api/version/check", "/api/health"} {
		called := false
		w := httptest.NewRecorder()
		a.handler(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true })).ServeHTTP(w, ownerRequest(a, "GET", path, ""))
		if !called {
			t.Fatal(path)
		}
	}
}

func TestOwnerSlowBodyDoesNotHoldHashSlot(t *testing.T) {
	a := testOwnerAuth(t, false)
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	r := ownerRequest(a, "POST", "/api/auth/login", "")
	r.Body = reader
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	r = r.WithContext(ctx)
	done := make(chan struct{})
	go func() { defer close(done); a.login(httptest.NewRecorder(), r) }()
	// Pipe.Write возвращается, когда обработчик начал читать неполное тело.
	if _, err := writer.Write([]byte(`{"password":"`)); err != nil {
		t.Fatal(err)
	}
	_, _ = testOwnerLogin(t, a)
	cancel()
	_ = writer.CloseWithError(context.Canceled)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("чтение не завершилось")
	}
	_, _ = testOwnerLogin(t, a)
}

func TestOwnerLoginRejectsMalformedBodies(t *testing.T) {
	for _, body := range []string{`{"password":"` + testOwnerPassword + `","extra":true}`, `{"password":"` + testOwnerPassword + `"} {}`, strings.Repeat("x", 5000)} {
		a := testOwnerAuth(t, false)
		w := httptest.NewRecorder()
		a.login(w, ownerRequest(a, "POST", "/api/auth/login", body))
		if w.Code != 401 || len(a.sessions) != 0 {
			t.Fatal("некорректное тело принято")
		}
	}
}

func TestOwnerLoginRotatesExistingSession(t *testing.T) {
	a := testOwnerAuth(t, false)
	old, _ := testOwnerLogin(t, a)
	r := ownerRequest(a, "POST", "/api/auth/login", `{"password":"`+testOwnerPassword+`"}`)
	r.AddCookie(old)
	w := httptest.NewRecorder()
	a.login(w, r)
	if w.Code != 200 || w.Result().Cookies()[0].Value == old.Value {
		t.Fatal("нет ротации")
	}
	check := ownerRequest(a, "GET", "/api/auth/session", "")
	check.AddCookie(old)
	if a.allowed(check, false) {
		t.Fatal("старый сеанс действует")
	}
}
