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
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
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

	bootstrap := getProfileKeyFromRequest(r)
	profileConfig, _ := kafkaAuthProfileSnapshot(bootstrap)
	addresses := profileConfig.Bootstrap
	var result []CertificateInfo
	seen := make(map[string]bool)
	// В ответ попадают только публичные метаданные CA/client-сертификатов.
	// Приватный ключ профиля здесь не разбирается и не возвращается.
	result = append(result, certificatesFromProfile(profileConfig)...)

	if isLocalBootstrap(addresses) {
		for _, path := range findLocalKeystores() {
			if info, ok := readKeystoreCertificate(path, ""); ok && !seen[info.Path] {
				seen[info.Path] = true
				result = append(result, info)
			}
		}
	}

	containers := make(map[string]bool)
	for _, endpoint := range parseBootstrapServers(addresses) {
		container := findKafkaContainerForBootstrap(endpoint)
		if container == "" || containers[container] {
			continue
		}
		containers[container] = true
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
	// Доверие и имя узла проверяются по настройкам выбранного TLS-профиля.
	for _, endpoint := range strings.Split(addresses, ",") {
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
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
	// Используем CA и клиентский сертификат выбранного профиля без обхода mTLS.
	if kafkaConfig := kafkaConfigForProfile(bootstrap); kafkaConfig.Net.TLS.Enable && kafkaConfig.Net.TLS.Config != nil {
		tlsConfig = kafkaConfig.Net.TLS.Config.Clone()
		tlsConfig.MinVersion = tls.VersionTLS12
		tlsConfig.InsecureSkipVerify = false
	}
	connectionRaw, err := activeKafkaPolicy.Dial("tcp", endpoint)
	if err != nil {
		return CertificateInfo{}, false
	}
	host, _, err := net.SplitHostPort(endpoint)
	if err != nil {
		connectionRaw.Close()
		return CertificateInfo{}, false
	}
	tlsConfig.ServerName = host
	connection := tls.Client(connectionRaw, tlsConfig)
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(3 * time.Second))
	if connection.Handshake() != nil {
		return CertificateInfo{}, false
	}

	state := connection.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return CertificateInfo{}, false
	}
	certificate := state.PeerCertificates[0]
	return certificateInfoFromX509(endpoint, certificate), true
}

func certificateInfoFromX509(endpoint string, certificate *x509.Certificate) CertificateInfo {
	days := certificateDaysRemaining(certificate.NotAfter)
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

func certificateDaysRemaining(expires time.Time) int {
	if expires.IsZero() {
		return -1
	}
	if !expires.After(time.Now()) {
		return 0
	}
	return int(time.Until(expires).Hours() / 24)
}

func certificatesFromProfile(config kafkaAuthConfig) []CertificateInfo {
	var result []CertificateInfo
	for _, source := range []struct{ name, value string }{{"CA", config.CA}, {"Client", config.Cert}} {
		remaining := []byte(source.value)
		for index := 1; len(remaining) > 0 && index <= 64; index++ {
			block, rest := pem.Decode(remaining)
			if block == nil {
				break
			}
			remaining = rest
			if block.Type != "CERTIFICATE" {
				continue
			}
			certificate, err := x509.ParseCertificate(block.Bytes)
			if err != nil {
				continue
			}
			info := certificateInfoFromX509("profile", certificate)
			info.Path = fmt.Sprintf("Profile: %s #%d", source.name, index)
			info.Type = "X.509 / " + source.name
			result = append(result, info)
		}
	}
	return result
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
	// Удалённый Kafka с совпадающим портом не связан с локальным контейнером.
	if !isLocalBootstrap(bootstrap) {
		return ""
	}
	_, port, err := net.SplitHostPort(bootstrap)
	if err != nil {
		return ""
	}

	output, err := runCertificateCommand("", "docker", "ps", "--filter", "publish="+port, "--format", "{{.Names}}|{{.Ports}}")
	if err != nil {
		return ""
	}
	return kafkaContainerFromList(bootstrap, output)
}

func kafkaContainerFromList(bootstrap string, output []byte) string {
	if !isLocalBootstrap(bootstrap) {
		return ""
	}
	_, port, err := net.SplitHostPort(bootstrap)
	if err != nil {
		return ""
	}
	selected := ""

	for _, line := range strings.Split(string(output), "\n") {
		parts := strings.SplitN(line, "|", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		if strings.Contains(strings.ToLower(name), "kafka") && dockerPublicationMatches(bootstrap, port, parts[1]) {
			if selected != "" && selected != name {
				return ""
			}
			selected = name
		}
	}
	return selected
}

func dockerPublicationMatches(bootstrap, port, publications string) bool {
	host, _, _ := net.SplitHostPort(bootstrap)
	for _, publication := range strings.Split(publications, ",") {
		bound, _, ok := strings.Cut(strings.TrimSpace(publication), "->")
		if !ok {
			continue
		}
		ipText, boundPort, err := net.SplitHostPort(bound)
		ip := net.ParseIP(ipText)
		if err != nil || boundPort != port || ip == nil {
			continue
		}
		if !ip.IsUnspecified() && !ip.Equal(net.ParseIP("127.0.0.1")) && !ip.Equal(net.ParseIP("::1")) {
			continue
		}
		if host == "127.0.0.1" && ip.To4() == nil {
			continue
		}
		if host == "::1" && ip.To4() != nil {
			continue
		}
		return true
	}
	return false
}

func findDockerKeystores(container string) []string {
	if container == "" {
		return nil
	}

	command := `find /etc/kafka /opt/kafka/config /var/lib/kafka /opt/bitnami/kafka/config -type f \( -name "*.jks" -o -name "*.p12" -o -name "*.pfx" -o -name "*.pem" -o -name "*.crt" -o -name "*.cer" -o -name "*.der" -o -name "*.key" -o -name "*.p8" \) 2>/dev/null | head -200`
	output, err := runCertificateCommand(container, "sh", "-c", command)
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
	return runCertificateCommandInput(container, nil, args...)
}

func runCertificateCommandInput(container string, input io.Reader, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()
	var cmd *exec.Cmd
	if container != "" {
		dockerArgs := []string{"exec"}
		if input != nil {
			dockerArgs = append(dockerArgs, "-i")
		}
		dockerArgs = append(dockerArgs, container)
		cmd = exec.CommandContext(ctx, "docker", append(dockerArgs, args...)...)
	} else {
		cmd = exec.CommandContext(ctx, args[0], args[1:]...)
	}
	var output certificateOutput
	cmd.Stdout = &output
	cmd.Stderr = io.Discard
	cmd.Stdin = input
	cmd.WaitDelay = 250 * time.Millisecond
	err := cmd.Run()
	return output.buffer.Bytes(), err
}

type certificateOutput struct{ buffer bytes.Buffer }

func (b *certificateOutput) Write(data []byte) (int, error) {
	if b.buffer.Len()+len(data) > 1<<20 {
		return 0, errors.New("ответ инструмента сертификатов слишком велик")
	}
	return b.buffer.Write(data)
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

	// KEY/P8 показываем только как найденное имя связанного файла.
	// Приватное содержимое для панели мониторинга читать не требуется.
	if ext == ".key" || ext == ".p8" {
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

	// keytool читает пароль из stdin без TTY. Он не попадает в argv/docker exec.
	output, err := runCertificateCommandInput(container, strings.NewReader(password+"\n"), "keytool", "-list", "-v", "-keystore", path)
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
		DaysLeft:   certificateDaysRemaining(expires),
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
	expiresAt := ""
	if !expires.IsZero() {
		expiresAt = expires.Format(time.RFC3339)
	}

	return CertificateInfo{
		Name:       filepath.Base(path),
		Path:       path,
		Type:       certificateType(filepath.Ext(path)),
		ExpiresAt:  expiresAt,
		DaysLeft:   certificateDaysRemaining(expires),
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
