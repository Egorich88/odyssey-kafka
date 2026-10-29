/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * @file certificates.go
 * @project Odyssey new 4.2.36
 * @description Получение информации о TLS-сертификатах Kafka.
 * @changes Добавлено получение сертификатов, предъявляемых брокерами при TLS-подключении.
 */

/**
 * @file certificates.go
 * Обнаружение TLS-сертификатов и связанных файлов Kafka.
 *
 * Refactor 4.2.35:
 * - поддерживаются JKS / PKCS#12 / PFX / P12 / PEM / CRT / DER / KEY / P8;
 * - для X.509 читаются Subject, Issuer, CN и SAN;
 * - для keystore/truststore используется keytool;
 * - приватные ключи показываются как связанные TLS-файлы, даже если у них
 *   нет собственного срока действия.
 *
 * Важно: компонент не хранит пароли. Для JKS/PKCS#12 используется
 * KAFKA_KEYSTORE_PASSWORD, а при его отсутствии — стандартный changeit.
 */
package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type CertificateInfo struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Path       string `json:"path"`
	Type       string `json:"type"`
	ExpiresAt  string `json:"expiresAt"`
	DaysLeft   int    `json:"daysLeft"`
	Subject    string `json:"subject,omitempty"`
	Issuer     string `json:"issuer,omitempty"`
	CommonName string `json:"commonName,omitempty"`
	SAN        string `json:"san,omitempty"`
	Error      string `json:"error,omitempty"` // Причина, если сертификат/endpoint недоступен.
}

type CertificatesResponse struct {
	Count        int               `json:"count"`
	NearestDays  int               `json:"nearestDays"`
	Certificates []CertificateInfo `json:"certificates"`
	Available    bool              `json:"available"`
	Message      string            `json:"message,omitempty"`
}

func getCertificatesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	var result []CertificateInfo
	seen := make(map[string]bool)

	if isLocalBootstrap(bootstrap) {
		for _, path := range findLocalKeystores() {
			if info, ok := readKeystoreCertificate(path, ""); ok && !seen[info.Path] {
				seen[info.Path] = true
				result = append(result, info)
			}
		}
	}

	if container := findKafkaContainerForBootstrap(bootstrap); container != "" {
		for _, path := range findDockerKeystores(container) {
			if info, ok := readKeystoreCertificate(path, container); ok {
				info.Path = container + ":" + path
				key := info.Path
				if !seen[key] {
					seen[key] = true
					result = append(result, info)
				}
			}
		}
	}

	// Получаем сертификаты, которые реально предъявляют брокеры при TLS.
	// Проверка допускает самоподписанные сертификаты только для чтения их
	// метаданных; это соединение не используется для выполнения Kafka-команд.
	for _, endpoint := range strings.Split(bootstrap, ",") {
		endpoint = strings.TrimSpace(endpoint)
		if endpoint == "" {
			continue
		}
		info, ok := readRemoteTLSCertificate(endpoint, bootstrap)
		if !ok {
			// Показываем явно, что TLS-сертификат по адресу получить не удалось.
			// Это не подменяет отсутствие сертификатов и помогает диагностировать доступ.
			info = CertificateInfo{Name: endpoint, Path: "TLS: " + endpoint, Type: "TLS X.509", DaysLeft: -1, Error: "Не получилось подключиться к сертификату"}
		}
		key := info.Path
		if !seen[key] {
			seen[key] = true
			result = append(result, info)
		}
	}

	nearest := -1
	for index := range result {
		if result[index].DaysLeft < 0 {
			result[index].Status = "unknown"
		} else if result[index].DaysLeft < 7 {
			result[index].Status = "critical"
		} else if result[index].DaysLeft < 30 {
			result[index].Status = "warning"
		} else {
			result[index].Status = "valid"
		}
		cert := result[index]
		if cert.DaysLeft >= 0 && (nearest < 0 || cert.DaysLeft < nearest) {
			nearest = cert.DaysLeft
		}
	}

	response := CertificatesResponse{
		Count:        len(result),
		NearestDays:  nearest,
		Certificates: result,
		Available:    len(result) > 0,
	}
	if len(result) == 0 {
		response.Message = "JKS/PKCS#12/PFX/P12/PEM/CRT/DER/KEY/P8 файлы не обнаружены"
	}

	_ = json.NewEncoder(w).Encode(response)
}

func readRemoteTLSCertificate(endpoint, bootstrap string) (CertificateInfo, bool) {
	dialer := &net.Dialer{Timeout: 3 * time.Second}
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
	// Reuse the selected profile's CA and client certificate so the certificate
	// panel can inspect a broker that requires mTLS without bypassing verification.
	if kafkaConfig := kafkaConfigForBootstrap(bootstrap); kafkaConfig.Net.TLS.Enable && kafkaConfig.Net.TLS.Config != nil {
		tlsConfig = kafkaConfig.Net.TLS.Config.Clone()
		tlsConfig.MinVersion = tls.VersionTLS12
		tlsConfig.InsecureSkipVerify = false
	}
	connection, err := tls.DialWithDialer(dialer, "tcp", endpoint, tlsConfig)
	if err != nil {
		return CertificateInfo{}, false
	}
	defer connection.Close()

	state := connection.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return CertificateInfo{}, false
	}
	certificate := state.PeerCertificates[0]
	return certificateInfoFromX509(endpoint, certificate), true
}

func certificateInfoFromX509(endpoint string, certificate *x509.Certificate) CertificateInfo {
	days := int(time.Until(certificate.NotAfter).Hours() / 24)
	if days < 0 {
		days = -1
	}
	commonName := certificate.Subject.CommonName
	if commonName == "" {
		commonName = endpoint
	}
	sans := make([]string, 0, len(certificate.DNSNames)+len(certificate.IPAddresses))
	sans = append(sans, certificate.DNSNames...)
	for _, address := range certificate.IPAddresses {
		sans = append(sans, address.String())
	}
	return CertificateInfo{
		Name:       commonName,
		Path:       fmt.Sprintf("TLS: %s", endpoint),
		Type:       "TLS X.509",
		ExpiresAt:  certificate.NotAfter.Format(time.RFC3339),
		DaysLeft:   days,
		Subject:    certificate.Subject.String(),
		Issuer:     certificate.Issuer.String(),
		CommonName: commonName,
		SAN:        strings.Join(sans, ", "),
	}
}

func findLocalKeystores() []string {
	var result []string
	seen := make(map[string]bool)
	add := func(path string) {
		if path != "" && !seen[path] {
			seen[path] = true
			result = append(result, path)
		}
	}

	for _, env := range []string{
		"KAFKA_SSL_KEYSTORE_LOCATION", "KAFKA_SSL_TRUSTSTORE_LOCATION",
		"SSL_KEYSTORE_LOCATION", "SSL_TRUSTSTORE_LOCATION",
	} {
		add(os.Getenv(env))
	}

	// Ищем только в каталогах Kafka. Общие системные каталоги /etc/ssl
	// и /etc/pki намеренно исключены: их файлы не обязательно относятся к Kafka.
	for _, base := range []string{
		"/etc/kafka", "/opt/kafka/config", "/opt/bitnami/kafka/config",
		"/var/lib/kafka", "/kafka/config",
	} {
		_ = filepath.Walk(base, func(path string, info os.FileInfo, err error) error {
			if err != nil || info == nil || info.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(path))
			if isSupportedCertificateExtension(ext) {
				add(path)
			}
			return nil
		})
	}
	return result
}

func isSupportedCertificateExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".jks", ".p12", ".pfx", ".pem", ".crt", ".cer", ".der", ".key", ".p8":
		return true
	default:
		return false
	}
}

func isLocalBootstrap(bootstrap string) bool {
	host, _, err := net.SplitHostPort(bootstrap)
	if err != nil {
		return bootstrap == "localhost" || bootstrap == "127.0.0.1"
	}
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func findKafkaContainerForBootstrap(bootstrap string) string {
	_, port, err := net.SplitHostPort(bootstrap)
	if err != nil {
		return ""
	}

	output, err := exec.Command("sh", "-c", "docker ps --format '{{.Names}}|{{.Ports}}' | grep -i kafka").Output()
	if err != nil {
		return ""
	}

	for _, line := range strings.Split(string(output), "\n") {
		parts := strings.SplitN(line, "|", 2)
		if len(parts) != 2 {
			continue
		}
		if strings.Contains(parts[1], ":"+port+"->") {
			return strings.TrimSpace(parts[0])
		}
	}
	return ""
}

func findDockerKeystores(container string) []string {
	if container == "" {
		return nil
	}

	command := `find /etc/kafka /opt/kafka/config /var/lib/kafka /opt/bitnami/kafka/config -type f \( -name "*.jks" -o -name "*.p12" -o -name "*.pfx" -o -name "*.pem" -o -name "*.crt" -o -name "*.cer" -o -name "*.der" -o -name "*.key" -o -name "*.p8" \) 2>/dev/null | head -200`
	output, err := exec.Command("docker", "exec", container, "sh", "-c", command).Output()
	if err != nil {
		return nil
	}

	var result []string
	for _, line := range strings.Split(string(output), "\n") {
		if strings.TrimSpace(line) != "" {
			result = append(result, strings.TrimSpace(line))
		}
	}
	return result
}

func runCertificateCommand(container string, args ...string) ([]byte, error) {
	if container != "" {
		return exec.Command("docker", append([]string{"exec", container}, args...)...).CombinedOutput()
	}
	return exec.Command(args[0], args[1:]...).CombinedOutput()
}

func readKeystoreCertificate(path, container string) (CertificateInfo, bool) {
	ext := strings.ToLower(filepath.Ext(path))

	// X.509-файлы можно разобрать напрямую через openssl.
	if ext == ".pem" || ext == ".crt" || ext == ".cer" || ext == ".der" {
		args := []string{"openssl", "x509"}
		if ext == ".der" {
			args = append(args, "-inform", "DER")
		}
		args = append(args, "-in", path, "-noout", "-enddate", "-subject", "-issuer", "-nameopt", "RFC2253", "-ext", "subjectAltName")
		output, err := runCertificateCommand(container, args...)
		if err != nil {
			return CertificateInfo{}, false
		}
		return parseOpenSSLCertificate(path, output), true
	}

	// KEY/P8 — приватный ключ. Он не имеет срока действия, но полезен в
	// таблице как часть TLS-конфигурации. Проверяем, что файл действительно
	// читается openssl, и показываем нейтральный статус срока.
	if ext == ".key" || ext == ".p8" {
		output, err := runCertificateCommand(container, "openssl", "pkey", "-in", path, "-noout")
		if err != nil {
			// PKCS#8 может быть DER; пробуем второй вариант.
			if ext == ".p8" {
				output, err = runCertificateCommand(container, "openssl", "pkey", "-inform", "DER", "-in", path, "-noout")
			}
		}
		if err != nil {
			return CertificateInfo{}, false
		}
		_ = output
		typeName := "Private Key / KEY"
		if ext == ".p8" {
			typeName = "PKCS#8 / P8"
		}
		return CertificateInfo{
			Name:       filepath.Base(path),
			Path:       path,
			Type:       typeName,
			ExpiresAt:  "",
			DaysLeft:   -1,
			Subject:    "Приватный ключ",
			Issuer:     "—",
			CommonName: "—",
			SAN:        "—",
		}, true
	}

	password := os.Getenv("KAFKA_KEYSTORE_PASSWORD")
	if password == "" {
		password = "changeit"
	}

	output, err := runCertificateCommand(container, "keytool", "-list", "-v", "-keystore", path, "-storepass", password)
	if err != nil {
		return CertificateInfo{}, false
	}

	text := string(output)
	re := regexp.MustCompile(`Valid from: .* until:\s*(.+)`)
	match := re.FindStringSubmatch(text)
	if len(match) < 2 {
		return CertificateInfo{}, false
	}

	expires := parseKeytoolDate(strings.TrimSpace(match[1]))
	if expires.IsZero() {
		return CertificateInfo{}, false
	}

	typeName := "JKS Keystore"
	if ext == ".p12" {
		typeName = "PKCS#12 / P12"
	} else if ext == ".pfx" {
		typeName = "PKCS#12 / PFX"
	}
	lowerName := strings.ToLower(filepath.Base(path))
	if strings.Contains(lowerName, "truststore") {
		typeName = "JKS Truststore"
	}

	owner := firstKeytoolValue(text, "Owner:")
	issuer := firstKeytoolValue(text, "Issuer:")
	commonName := extractCN(owner)
	san := firstKeytoolSAN(text)

	return CertificateInfo{
		Name:       filepath.Base(path),
		Path:       path,
		Type:       typeName,
		ExpiresAt:  expires.Format(time.RFC3339),
		DaysLeft:   int(time.Until(expires).Hours() / 24),
		Subject:    owner,
		Issuer:     issuer,
		CommonName: commonName,
		SAN:        san,
	}, true
}

func parseOpenSSLCertificate(path string, output []byte) CertificateInfo {
	text := string(output)
	expires := parseOpenSSLDate(firstLineValue(text, "notAfter="))
	subject := firstLineValue(text, "subject=")
	issuer := firstLineValue(text, "issuer=")
	san := parseSAN(text)

	return CertificateInfo{
		Name:       filepath.Base(path),
		Path:       path,
		Type:       certificateType(filepath.Ext(path)),
		ExpiresAt:  expires.Format(time.RFC3339),
		DaysLeft:   int(time.Until(expires).Hours() / 24),
		Subject:    subject,
		Issuer:     issuer,
		CommonName: extractCN(subject),
		SAN:        san,
	}
}

func certificateType(ext string) string {
	switch strings.ToLower(ext) {
	case ".der":
		return "X.509 / DER"
	case ".crt":
		return "X.509 / CRT"
	case ".cer":
		return "X.509 / CER"
	default:
		return "X.509 / PEM"
	}
}

func parseOpenSSLDate(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	for _, layout := range []string{"Jan 2 15:04:05 2006 MST", "Jan 02 15:04:05 2006 MST"} {
		if parsed, err := time.Parse(layout, strings.TrimSpace(value)); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func parseKeytoolDate(value string) time.Time {
	for _, layout := range []string{
		"Mon Jan 02 15:04:05 MST 2006",
		"Mon Jan 02 15:04:05 UTC 2006",
		"Mon Jan 02 15:04:05 -0700 2006",
	} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func firstLineValue(text, prefix string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

func firstKeytoolValue(text, prefix string) string {
	return firstLineValue(text, prefix)
}

func extractCN(value string) string {
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "CN=") {
			return strings.TrimPrefix(part, "CN=")
		}
	}
	return ""
}

func parseSAN(text string) string {
	lines := strings.Split(text, "\n")
	for index, line := range lines {
		if strings.Contains(line, "X509v3 Subject Alternative Name") && index+1 < len(lines) {
			return strings.TrimSpace(lines[index+1])
		}
	}
	return ""
}

func firstKeytoolSAN(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "DNSName:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "DNSName:"))
		}
	}
	return ""
}
