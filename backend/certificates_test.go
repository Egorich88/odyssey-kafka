package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCertificateDockerSelectionPortableAndIsolated(t *testing.T) {
	list := []byte("kafka|0.0.0.0:9092->9092/tcp, [::]:9092->9092/tcp\n" +
		"kafka-mtls|0.0.0.0:9094->9094/tcp, [::]:9094->9094/tcp\nother|0.0.0.0:9095->9095/tcp\n")
	for _, test := range []struct{ endpoint, expected string }{
		{"localhost:9092", "kafka"}, {"127.0.0.1:9094", "kafka-mtls"}, {"[::1]:9094", "kafka-mtls"},
		{"192.168.56.11:9094", ""}, {"external.test:9092", ""}, {"localhost:9095", ""},
		{"localhost:19092", ""}, {"localhost:9092,remote.test:9092", ""},
	} {
		if actual := kafkaContainerFromList(test.endpoint, list); actual != test.expected {
			t.Errorf("%s: %q", test.endpoint, actual)
		}
	}
	ambiguous := append(append([]byte(nil), list...), []byte("kafka-other|127.0.0.1:9094->9094/tcp\n")...)
	if kafkaContainerFromList("localhost:9094", ambiguous) != "" {
		t.Fatal("неоднозначное соответствие контейнера")
	}
	for _, test := range []struct{ endpoint, binding string }{
		{"localhost:9094", "192.168.56.1:9094->9094/tcp"},
		{"localhost:9094", "127.0.0.2:9094->9094/tcp"},
		{"[::1]:9094", "127.0.0.1:9094->9094/tcp"},
		{"127.0.0.1:9094", "[::1]:9094->9094/tcp"},
	} {
		if kafkaContainerFromList(test.endpoint, []byte("kafka-other|"+test.binding)) != "" {
			t.Fatal("чужой интерфейс/family принят")
		}
	}
}

func TestCertificateExpiredDiffersFromMissingDate(t *testing.T) {
	expires := time.Now().Add(-48 * time.Hour).UTC().Truncate(time.Second)
	info := certificateInfoFromX509("synthetic", &x509.Certificate{NotAfter: expires})
	if info.DaysLeft != 0 || info.ExpiresAt != expires.Format(time.RFC3339) {
		t.Fatal("просроченный сертификат стал неизвестным")
	}
	if certificateDaysRemaining(time.Time{}) != -1 {
		t.Fatal("отсутствие даты стало нулём")
	}
	if info := parseOpenSSLCertificate("synthetic.crt", []byte("notAfter=invalid")); info.ExpiresAt != "" || info.DaysLeft != -1 {
		t.Fatal("выдуманная дата")
	}
}

func TestCertificateProfileMetadataWithoutSecrets(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	expires := time.Now().UTC().Add(90 * 24 * time.Hour).Truncate(time.Second)
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "synthetic-client"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: expires, DNSNames: []string{"localhost"}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	public := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	private := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("synthetic-private-content")}))
	config := kafkaAuthConfig{Cert: public, CA: public + private, Key: private, Password: "synthetic-password"}
	infos := certificatesFromProfile(config)
	if len(infos) != 2 {
		t.Fatal("CA/client метаданные потеряны")
	}
	for _, info := range infos {
		if info.CommonName != "synthetic-client" || info.ExpiresAt != expires.Format(time.RFC3339) || info.DaysLeft < 88 || info.SAN != "localhost" {
			t.Fatal("неверные имена или сроки")
		}
	}
	response, err := json.Marshal(infos)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"PRIVATE KEY", "CERTIFICATE", "synthetic-private-content", "synthetic-password"} {
		if strings.Contains(string(response), forbidden) {
			t.Fatal("утечка содержимого профиля")
		}
	}
	if len(certificatesFromProfile(kafkaAuthConfig{CA: "invalid", Cert: private})) != 0 {
		t.Fatal("придуманный сертификат")
	}
}

func TestCertificatePrivateKeyEntryDoesNotReadContent(t *testing.T) {
	info, ok := readKeystoreCertificate("/nonexistent/synthetic-private.key", "")
	if !ok || info.DaysLeft != -1 || info.ExpiresAt != "" {
		t.Fatal("для ключа должен быть только нейтральный элемент без срока")
	}
}

func TestCertificateToolOutputBound(t *testing.T) {
	var output certificateOutput
	_, err := io.Copy(&output, strings.NewReader(strings.Repeat("x", (1<<20)+1)))
	if err == nil || output.buffer.Len() > 1<<20 {
		t.Fatal("вывод инструмента не ограничен")
	}
}

// Явно включаемая проверка уже настроенного локального тестового Docker.
// Читает только публичные CRT/CER; сокеты Kafka и приватные ключи не открывает.
func TestCertificateDockerPublicMetadata(t *testing.T) {
	endpoint := os.Getenv("ODYSSEY_TEST_CERTIFICATE_BOOTSTRAP")
	if endpoint == "" {
		t.Skip("нужен явно разрешённый локальный Docker")
	}
	if !isLocalBootstrap(endpoint) {
		t.Fatal("разрешён только локальный тестовый Docker")
	}
	container := findKafkaContainerForBootstrap(endpoint)
	if container == "" {
		t.Fatal("контейнер не найден")
	}
	count := 0
	for _, path := range findDockerKeystores(container) {
		if !strings.HasSuffix(path, ".crt") && !strings.HasSuffix(path, ".cer") {
			continue
		}
		info, ok := readKeystoreCertificate(path, container)
		if !ok || info.CommonName == "" || info.ExpiresAt == "" {
			t.Fatal("публичные метаданные не прочитаны")
		}
		count++
	}
	if count == 0 {
		t.Fatal("нет публичных CRT/CER")
	}
	t.Logf("Прочитано публичных сертификатов с именем и сроком: %d", count)
}
