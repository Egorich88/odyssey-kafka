package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

const ownerCookie = "odyssey_owner"

func validOwnerPassword(password []byte) bool { return len(password) >= 12 && len(password) <= 1024 }

func hashOwnerPassword(password []byte) (ownerPassword, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return ownerPassword{}, err
	}
	return ownerPassword{Salt: salt, Hash: argon2.IDKey(password, salt, 2, 19456, 1, 32)}, nil
}

type ownerSession struct {
	csrf              string
	expires, timeLast time.Time
}
type ownerAuth struct {
	store      *ownerStore
	origin     string
	secure     bool
	mu         sync.Mutex
	sessions   map[[32]byte]ownerSession
	loginTimes []time.Time
	loginSlot  chan struct{}
	now        func() time.Time
}

func newOwnerAuth(store *ownerStore, origin string) (*ownerAuth, error) {
	u, err := url.Parse(origin)
	if err != nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.Host == "" {
		return nil, errOwnerStore
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || net.ParseIP(u.Hostname()).IsLoopback())) {
		return nil, errOwnerStore
	}
	return &ownerAuth{store: store, origin: origin, secure: u.Scheme == "https", sessions: make(map[[32]byte]ownerSession), loginSlot: make(chan struct{}, 1), now: time.Now}, nil
}

func randomOwnerToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (a *ownerAuth) transportOK(r *http.Request) bool {
	// Заголовкам Forwarded/X-Forwarded-* не доверяем. TLS завершается здесь;
	// поддержка доверенного proxy потребует отдельной явной конфигурации.
	if a.secure {
		return r.TLS != nil
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	return err == nil && net.ParseIP(host).IsLoopback()
}

func (a *ownerAuth) sameOrigin(r *http.Request) bool {
	return r.Header.Get("Origin") == a.origin
}

func ownerError(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	sendJSONError(w, "Доступ запрещён или сеанс завершён", status)
}

func (a *ownerAuth) session(r *http.Request) ([32]byte, ownerSession, bool) {
	c, err := r.Cookie(ownerCookie)
	if err != nil || len(c.Value) != 43 {
		return [32]byte{}, ownerSession{}, false
	}
	key := sha256.Sum256([]byte(c.Value))
	a.mu.Lock()
	defer a.mu.Unlock()
	s, ok := a.sessions[key]
	now := a.now()
	if !ok {
		return key, s, false
	}
	if !now.Before(s.expires) || now.Sub(s.timeLast) >= 30*time.Minute {
		delete(a.sessions, key)
		return key, s, false
	}
	s.timeLast = now
	a.sessions[key] = s
	return key, s, true
}

func (a *ownerAuth) allowed(r *http.Request, mutating bool) bool {
	if !a.transportOK(r) {
		return false
	}
	_, s, ok := a.session(r)
	if !ok {
		return false
	}
	return !mutating || (a.sameOrigin(r) && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.csrf)) == 1)
}

func (a *ownerAuth) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		ownerError(w, 405)
		return
	}
	if !a.transportOK(r) || !a.sameOrigin(r) || r.Header.Get("Content-Type") != "application/json" {
		ownerError(w, 403)
		return
	}
	a.mu.Lock()
	now := a.now()
	times := a.loginTimes[:0]
	for _, t := range a.loginTimes {
		if now.Sub(t) < time.Minute {
			times = append(times, t)
		}
	}
	a.loginTimes = times
	if len(times) >= 5 {
		a.mu.Unlock()
		w.Header().Set("Retry-After", "60")
		ownerError(w, 429)
		return
	}
	a.loginTimes = append(a.loginTimes, now)
	a.mu.Unlock()
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req struct {
		Password string `json:"password"`
	}
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(&req) != nil || d.Decode(&struct{}{}) != io.EOF || !validOwnerPassword([]byte(req.Password)) {
		ownerError(w, 401)
		return
	}
	// Медленное тело запроса не должно занимать единственный слот Argon2id.
	if r.Context().Err() != nil {
		ownerError(w, 408)
		return
	}
	select {
	case a.loginSlot <- struct{}{}:
		defer func() { <-a.loginSlot }()
	default:
		ownerError(w, 429)
		return
	}
	a.store.mu.Lock()
	p := a.store.data.Owner
	a.store.mu.Unlock()
	hash := argon2.IDKey([]byte(req.Password), p.Salt, 2, 19456, 1, 32)
	defer clear(hash)
	if subtle.ConstantTimeCompare(hash, p.Hash) != 1 {
		ownerError(w, 401)
		return
	}
	token, err := randomOwnerToken()
	if err != nil {
		ownerError(w, 503)
		return
	}
	csrf, err := randomOwnerToken()
	if err != nil {
		ownerError(w, 503)
		return
	}
	a.mu.Lock()
	for k, s := range a.sessions {
		if !now.Before(s.expires) || now.Sub(s.timeLast) >= 30*time.Minute {
			delete(a.sessions, k)
		}
	}
	if len(a.sessions) >= 16 {
		a.mu.Unlock()
		ownerError(w, 429)
		return
	}
	// Не принимаем присланный идентификатор сессии, каждый вход создаёт новый.
	if c, err := r.Cookie(ownerCookie); err == nil {
		delete(a.sessions, sha256.Sum256([]byte(c.Value)))
	}
	a.sessions[sha256.Sum256([]byte(token))] = ownerSession{csrf: csrf, expires: now.Add(8 * time.Hour), timeLast: now}
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: ownerCookie, Value: token, Path: "/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteStrictMode, MaxAge: 8 * 3600})
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]string{"csrfToken": csrf})
}

func (a *ownerAuth) handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/api/auth/login" {
			a.login(w, r)
			return
		}
		if r.URL.Path == "/api/health" || (r.URL.Path == "/api/version/check" && r.Method == http.MethodGet) {
			next.ServeHTTP(w, r)
			return
		}
		mutating := r.Method != http.MethodGet && r.Method != http.MethodHead
		if !a.allowed(r, mutating) {
			ownerError(w, 401)
			return
		}
		if r.URL.Path == "/api/auth/session" {
			if r.Method != http.MethodGet {
				ownerError(w, 405)
				return
			}
			_, s, _ := a.session(r)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			_ = json.NewEncoder(w).Encode(map[string]string{"csrfToken": s.csrf})
			return
		}
		if r.URL.Path == "/api/auth/logout" {
			if r.Method != http.MethodPost {
				ownerError(w, 405)
				return
			}
			key, _, _ := a.session(r)
			a.mu.Lock()
			delete(a.sessions, key)
			a.mu.Unlock()
			http.SetCookie(w, &http.Cookie{Name: ownerCookie, Path: "/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteStrictMode, MaxAge: -1})
			w.WriteHeader(204)
			return
		}
		selected, ok := a.selectProfile(w, r)
		if !ok {
			return
		}
		next.ServeHTTP(w, selected)
	})
}
