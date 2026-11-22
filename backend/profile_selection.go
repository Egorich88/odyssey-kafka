package main

import (
	"context"
	"crypto/tls"
	"net/http"
	"strconv"
	"strings"

	"github.com/IBM/sarama"
)

type selectedKafkaProfile struct{}

// Инициализируются один раз до запуска HTTP-сервера.
var activeProfileStore *ownerStore
var activeKafkaPolicy *kafkaAddressPolicy

func profileKey(p storedKafkaProfile) string { return p.ID + ":" + strconv.FormatUint(p.Revision, 10) }

func kafkaAuthProfileSnapshot(key string) (kafkaAuthConfig, uint64) {
	id, rev, ok := strings.Cut(key, ":")
	if !ok || activeProfileStore == nil {
		return kafkaAuthConfig{}, 0
	}
	p, found := activeProfileStore.profile(id)
	if !found || rev != strconv.FormatUint(p.Revision, 10) || isGSSAPIProfile(p.Config) {
		return kafkaAuthConfig{}, 0
	}
	return p.Config, p.Revision
}

func kafkaProfileBrokers(key string) []string {
	cfg, revision := kafkaAuthProfileSnapshot(key)
	if revision == 0 {
		return nil
	}
	return parseBootstrapServers(cfg.Bootstrap)
}

func kafkaConfigForProfile(key string) *sarama.Config {
	cfg, _ := kafkaConfigAndRevision(key)
	return cfg
}

func kafkaConfigAndRevision(key string) (*sarama.Config, uint64) {
	cfg, revision := kafkaAuthProfileSnapshot(key)
	var config *sarama.Config
	if revision != 0 {
		config, _ = buildKafkaConfig(cfg)
	}
	if config == nil {
		revision = 0
		config = sarama.NewConfig()
		config.Net.TLS.Enable = true
		config.Net.TLS.Config = &tls.Config{MinVersion: tls.VersionTLS12}
		config.Net.SASL.Enable = true
	}
	config.Net.Proxy.Enable = true
	if revision == 0 {
		config.Net.Proxy.Dialer = (*kafkaAddressPolicy)(nil)
	} else {
		config.Net.Proxy.Dialer = activeKafkaPolicy
	}
	return config, revision
}

func requiresKafkaProfile(path string) bool {
	return path == "/api/capabilities" || strings.HasPrefix(path, "/api/overview") || strings.HasPrefix(path, "/api/topics") || strings.HasPrefix(path, "/api/search") || strings.HasPrefix(path, "/api/consumer-groups") || path == "/api/clusters/health"
}

func (a *ownerAuth) selectProfile(w http.ResponseWriter, r *http.Request) (*http.Request, bool) {
	if !requiresKafkaProfile(r.URL.Path) {
		return r, true
	}
	if activeProfileStore == nil {
		ownerError(w, 503)
		return r, false
	}
	p, ok := activeProfileStore.profile(r.Header.Get("X-Kafka-Profile-ID"))
	if !ok {
		ownerError(w, 404)
		return r, false
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		expected, err := strconv.ParseUint(r.Header.Get("X-Kafka-Profile-Revision"), 10, 64)
		if err != nil || expected != p.Revision {
			sendJSONError(w, "Профиль подключения изменён. Обновите настройки перед повторной операцией.", http.StatusConflict)
			return r, false
		}
	}
	return r.WithContext(context.WithValue(r.Context(), selectedKafkaProfile{}, profileKey(p))), true
}
