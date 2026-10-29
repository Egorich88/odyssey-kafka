/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 * Licensed under the Apache License, Version 2.0.
 *
 * Kafka authentication configuration shared by all Odyssey Sarama clients.
 */
package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/IBM/sarama"
	"github.com/xdg-go/scram"
)

type kafkaAuthConfig struct {
	Bootstrap           string `json:"brokers"`
	AuthType            string `json:"authType"`
	Username            string `json:"username"`
	Password            string `json:"password"`
	Cert                string `json:"cert"`
	Key                 string `json:"key"`
	CA                  string `json:"ca"`
	SASLMechanism       string `json:"saslMechanism"`
	KerberosUsername    string `json:"kerberosUsername"`
	KerberosPassword    string `json:"kerberosPassword"`
	KerberosRealm       string `json:"kerberosRealm"`
	KerberosServiceName string `json:"kerberosServiceName"`
	KerberosConfigPath  string `json:"kerberosConfigPath"`
	KerberosKeytabPath  string `json:"kerberosKeytabPath"`
}

var kafkaAuthRegistry = struct {
	sync.RWMutex
	byBootstrap map[string]kafkaAuthConfig
}{byBootstrap: make(map[string]kafkaAuthConfig)}

// registerKafkaConfigHandler validates and registers the connection profile.
// Credentials are held in backend memory only; after backend restart the UI
// re-registers the profile during its first health check.
func registerKafkaConfigHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var cfg kafkaAuthConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		sendJSONError(w, "Некорректная конфигурация подключения", http.StatusBadRequest)
		return
	}
	cfg.Bootstrap = strings.TrimSpace(cfg.Bootstrap)
	if cfg.Bootstrap == "" {
		sendJSONError(w, "Не указан адрес Kafka", http.StatusBadRequest)
		return
	}
	if _, err := buildKafkaConfig(cfg); err != nil {
		kafkaAuthRegistry.Lock()
		delete(kafkaAuthRegistry.byBootstrap, cfg.Bootstrap)
		kafkaAuthRegistry.Unlock()
		sendJSONError(w, "Ошибка конфигурации Kafka: "+err.Error(), http.StatusBadRequest)
		return
	}
	kafkaAuthRegistry.Lock()
	kafkaAuthRegistry.byBootstrap[cfg.Bootstrap] = cfg
	kafkaAuthRegistry.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func unregisterKafkaConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	bootstrap := strings.TrimSpace(r.Header.Get("X-Kafka-Bootstrap"))
	if bootstrap == "" {
		bootstrap = strings.TrimSpace(r.URL.Query().Get("bootstrap"))
	}
	if bootstrap == "" {
		sendJSONError(w, "Не указан адрес Kafka", http.StatusBadRequest)
		return
	}
	kafkaAuthRegistry.Lock()
	delete(kafkaAuthRegistry.byBootstrap, bootstrap)
	kafkaAuthRegistry.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func kafkaConfigForBootstrap(bootstrap string) *sarama.Config {
	kafkaAuthRegistry.RLock()
	cfg, ok := kafkaAuthRegistry.byBootstrap[strings.TrimSpace(bootstrap)]
	kafkaAuthRegistry.RUnlock()
	if !ok {
		cfg = kafkaAuthConfig{Bootstrap: bootstrap, AuthType: "PLAINTEXT"}
	}
	config, err := buildKafkaConfig(cfg)
	if err != nil {
		// Profiles are validated before entering the registry. Fail closed if
		// a corrupt/inconsistent entry is ever observed.
		config = sarama.NewConfig()
		config.Net.DialTimeout = 3_000_000_000
		config.Net.TLS.Enable = true
		config.Net.TLS.Config = &tls.Config{MinVersion: tls.VersionTLS13}
		config.Net.SASL.Enable = true
		config.Net.SASL.Mechanism = sarama.SASLTypePlaintext
	}
	return config
}

func buildKafkaConfig(cfg kafkaAuthConfig) (*sarama.Config, error) {
	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0
	config.Net.DialTimeout = 5_000_000_000
	config.Net.ReadTimeout = 5_000_000_000
	config.Net.WriteTimeout = 5_000_000_000

	authType := strings.ToUpper(strings.TrimSpace(cfg.AuthType))
	if authType == "SASL" {
		if strings.HasPrefix(strings.ToUpper(cfg.SASLMechanism), "SCRAM") {
			authType = "SASL_SCRAM"
		} else {
			authType = "SASL_PLAIN"
		}
	}
	switch authType {
	case "", "PLAINTEXT":
		return config, nil
	case "MTLS":
		if strings.TrimSpace(cfg.Cert) == "" || strings.TrimSpace(cfg.Key) == "" || strings.TrimSpace(cfg.CA) == "" {
			return nil, fmt.Errorf("для mTLS требуются CA, клиентский сертификат и приватный ключ")
		}
		cert, err := tls.X509KeyPair([]byte(cfg.Cert), []byte(cfg.Key))
		if err != nil {
			return nil, fmt.Errorf("клиентский сертификат/ключ невалидны: %w", err)
		}
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM([]byte(cfg.CA)) {
			return nil, fmt.Errorf("CA-сертификат не содержит корректный PEM")
		}
		config.Net.TLS.Enable = true
		config.Net.TLS.Config = &tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{cert},
			RootCAs:      roots,
		}
	case "SASL", "SASL_PLAIN", "SASL_SCRAM", "SASL_GSSAPI":
		config.Net.SASL.Enable = true
		config.Net.TLS.Enable = true // SASL credentials must be protected in transit.
		tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
		if strings.TrimSpace(cfg.CA) != "" {
			roots := x509.NewCertPool()
			if !roots.AppendCertsFromPEM([]byte(cfg.CA)) {
				return nil, fmt.Errorf("CA-сертификат не содержит корректный PEM")
			}
			tlsConfig.RootCAs = roots
		}
		config.Net.TLS.Config = tlsConfig
		switch authType {
		case "SASL_PLAIN":
			if cfg.Username == "" || cfg.Password == "" {
				return nil, fmt.Errorf("для SASL/PLAIN требуются логин и пароль")
			}
			config.Net.SASL.Mechanism = sarama.SASLTypePlaintext
			config.Net.SASL.User = cfg.Username
			config.Net.SASL.Password = cfg.Password
		case "SASL_SCRAM":
			if cfg.Username == "" || cfg.Password == "" {
				return nil, fmt.Errorf("для SASL/SCRAM требуются логин и пароль")
			}
			config.Net.SASL.User = cfg.Username
			config.Net.SASL.Password = cfg.Password
			switch strings.ToUpper(cfg.SASLMechanism) {
			case "", "SCRAM-SHA-512", "SCRAM_SHA_512":
				config.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA512
				config.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient {
					return &odysseySCRAMClient{hashGenerator: scram.SHA512}
				}
			case "SCRAM-SHA-256", "SCRAM_SHA_256":
				config.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA256
				config.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient {
					return &odysseySCRAMClient{hashGenerator: scram.SHA256}
				}
			default:
				return nil, fmt.Errorf("неподдерживаемый механизм SCRAM")
			}
		case "SASL_GSSAPI":
			if cfg.KerberosUsername == "" || cfg.KerberosRealm == "" || cfg.KerberosServiceName == "" || cfg.KerberosConfigPath == "" {
				return nil, fmt.Errorf("для Kerberos нужны principal/username, realm, service name и путь к krb5.conf")
			}
			config.Net.SASL.Mechanism = sarama.SASLTypeGSSAPI
			gssapi := sarama.GSSAPIConfig{
				AuthType:           sarama.KRB5_USER_AUTH,
				Username:           cfg.KerberosUsername,
				Password:           cfg.KerberosPassword,
				Realm:              cfg.KerberosRealm,
				ServiceName:        cfg.KerberosServiceName,
				KerberosConfigPath: cfg.KerberosConfigPath,
			}
			if strings.TrimSpace(cfg.KerberosKeytabPath) != "" {
				gssapi.AuthType = sarama.KRB5_KEYTAB_AUTH
				gssapi.KeyTabPath = cfg.KerberosKeytabPath
				gssapi.Password = ""
			}
			config.Net.SASL.GSSAPI = gssapi
		}
	default:
		return nil, fmt.Errorf("неподдерживаемый способ аутентификации %q", authType)
	}
	if err := config.Validate(); err != nil {
		return nil, err
	}
	return config, nil
}

type odysseySCRAMClient struct {
	client        *scram.Client
	conversation  *scram.ClientConversation
	hashGenerator scram.HashGeneratorFcn
}

func (c *odysseySCRAMClient) Begin(user, password, authzID string) error {
	client, err := c.hashGenerator.NewClient(user, password, authzID)
	if err != nil {
		return err
	}
	c.client = client
	c.conversation = client.NewConversation()
	return nil
}
func (c *odysseySCRAMClient) Step(challenge string) (string, error) {
	if c.conversation == nil {
		return "", fmt.Errorf("SCRAM conversation is not initialized")
	}
	return c.conversation.Step(challenge)
}
func (c *odysseySCRAMClient) Done() bool {
	return c.conversation != nil && c.conversation.Done()
}
