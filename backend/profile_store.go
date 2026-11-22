package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type storedKafkaProfile struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Revision     uint64          `json:"revision"`
	MigrationKey string          `json:"migrationKey,omitempty"`
	Config       kafkaAuthConfig `json:"config"`
}

// Ответы HTTP содержат только метаданные, никогда не сериализуют Config целиком.
type kafkaProfileMetadata struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Revision      uint64 `json:"revision"`
	Brokers       string `json:"brokers"`
	AuthType      string `json:"authType"`
	SASLMechanism string `json:"saslMechanism"`
}

func (p storedKafkaProfile) metadata() kafkaProfileMetadata {
	return kafkaProfileMetadata{p.ID, p.Name, p.Revision, p.Config.Bootstrap, p.Config.AuthType, p.Config.SASLMechanism}
}

func (s *ownerStore) saveLocked(next ownerData) error {
	sealed, err := sealOwnerData(s.aead, next)
	if err != nil || len(sealed) > 4<<20 {
		return errOwnerStore
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".owner-*")
	if err != nil {
		return errOwnerStore
	}
	name := f.Name()
	defer os.Remove(name)
	if privatePath(name, false) != nil {
		f.Close()
		return errOwnerStore
	}
	if _, err = f.Write(sealed); err != nil {
		f.Close()
		return errOwnerStore
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return errOwnerStore
	}
	if err = f.Close(); err != nil {
		return errOwnerStore
	}
	if err = os.Rename(name, s.path); err != nil {
		return errOwnerStore
	}
	s.data = next
	return nil
}

func (s *ownerStore) profiles() []kafkaProfileMetadata {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]kafkaProfileMetadata, 0, len(s.data.Profiles))
	for _, p := range s.data.Profiles {
		result = append(result, p.metadata())
	}
	return result
}

func (s *ownerStore) profile(id string) (storedKafkaProfile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.data.Profiles[id]
	return p, ok
}

func (s *ownerStore) putProfile(p storedKafkaProfile, create bool) (storedKafkaProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	profiles := make(map[string]storedKafkaProfile, len(s.data.Profiles)+1)
	for id, old := range s.data.Profiles {
		profiles[id] = old
	}
	if create {
		if p.MigrationKey != "" {
			for _, old := range profiles {
				if old.MigrationKey == p.MigrationKey {
					if old.Config != p.Config || old.Name != p.Name {
						return p, errors.New("конфликт переноса")
					}
					return old, nil
				}
			}
		}
		if len(profiles) >= 32 {
			return p, errors.New("достигнут предел профилей")
		}
		id, err := randomOwnerToken()
		if err != nil {
			return p, err
		}
		p.ID = id
		p.Revision = 1
		if _, exists := profiles[id]; exists {
			return p, errors.New("конфликт идентификатора")
		}
	} else {
		old, ok := profiles[p.ID]
		if !ok || old.Revision != p.Revision {
			return p, errors.New("профиль изменён или не найден")
		}
		p.Revision++
		p.MigrationKey = old.MigrationKey
	}
	profiles[p.ID] = p
	next := s.data
	next.Profiles = profiles
	return p, s.saveLocked(next)
}

func (s *ownerStore) removeProfile(id string, revision uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.data.Profiles[id]
	if !ok || p.Revision != revision {
		return errors.New("профиль изменён или не найден")
	}
	next := s.data
	next.Profiles = make(map[string]storedKafkaProfile, len(s.data.Profiles)-1)
	for key, p := range s.data.Profiles {
		if key != id {
			next.Profiles[key] = p
		}
	}
	return s.saveLocked(next)
}

type profileAPI struct {
	store  *ownerStore
	auth   *ownerAuth
	policy *kafkaAddressPolicy
}

func (api *profileAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if !api.auth.allowed(r, r.Method != http.MethodGet) {
		ownerError(w, 401)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/kafka-profiles")
	id = strings.TrimPrefix(id, "/")
	if strings.Contains(id, "/") {
		ownerError(w, 404)
		return
	}
	if r.Method == http.MethodGet && id == "" {
		_ = json.NewEncoder(w).Encode(api.store.profiles())
		return
	}
	if r.Method == http.MethodDelete && id != "" {
		rev, err := strconv.ParseUint(r.Header.Get("If-Match"), 10, 64)
		if err != nil || api.store.removeProfile(id, rev) != nil {
			ownerError(w, 409)
			return
		}
		stopOldProfileCollectors(api.store, id)
		w.WriteHeader(204)
		return
	}
	create := r.Method == http.MethodPost && id == ""
	update := r.Method == http.MethodPut && id != ""
	if !create && !update {
		ownerError(w, 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	var req struct {
		Name            string          `json:"name"`
		Revision        uint64          `json:"revision"`
		MigrationKey    string          `json:"migrationKey"`
		Config          kafkaAuthConfig `json:"config"`
		PreserveSecrets bool            `json:"preserveSecrets"`
	}
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(&req) != nil || d.Decode(&struct{}{}) != io.EOF || len(req.Name) > 128 || len(req.MigrationKey) > 128 {
		ownerError(w, 400)
		return
	}
	if update && req.PreserveSecrets {
		old, ok := api.store.profile(id)
		if !ok {
			ownerError(w, 404)
			return
		}
		preserveKafkaSecrets(&req.Config, old.Config)
	}
	if isGSSAPIProfile(req.Config) || req.Config.KerberosConfigPath != "" || req.Config.KerberosKeytabPath != "" {
		sendJSONError(w, "GSSAPI временно недоступен; пути к серверным конфигурациям через HTTP запрещены", 403)
		return
	}
	if api.policy.validateBootstrap(req.Config.Bootstrap) != nil {
		sendJSONError(w, "Адреса Kafka не разрешены серверной политикой", 403)
		return
	}
	if _, err := buildKafkaConfig(req.Config); err != nil {
		sendJSONError(w, "Некорректная конфигурация Kafka", 400)
		return
	}
	p, err := api.store.putProfile(storedKafkaProfile{ID: id, Name: req.Name, Revision: req.Revision, MigrationKey: req.MigrationKey, Config: req.Config}, create)
	if err != nil {
		sendJSONError(w, "Не удалось сохранить профиль; прежние данные сохранены", 409)
		return
	}
	stopOldProfileCollectors(api.store, p.ID)
	if create {
		w.WriteHeader(201)
	}
	_ = json.NewEncoder(w).Encode(p.metadata())
}

func preserveKafkaSecrets(next *kafkaAuthConfig, old kafkaAuthConfig) {
	if next.Password == "" {
		next.Password = old.Password
	}
	if next.Username == "" {
		next.Username = old.Username
	}
	if next.Key == "" {
		next.Key = old.Key
	}
	if next.Cert == "" {
		next.Cert = old.Cert
	}
	if next.CA == "" {
		next.CA = old.CA
	}
	if next.KerberosPassword == "" {
		next.KerberosPassword = old.KerberosPassword
	}
}
