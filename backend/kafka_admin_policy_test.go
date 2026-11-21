package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/IBM/sarama"
)

type policyTestAdmin struct {
	sarama.ClusterAdmin
	writes, lists, descriptions, configs, closes int
}

func (a *policyTestAdmin) CreateTopic(string, *sarama.TopicDetail, bool) error {
	a.writes++
	return nil
}
func (a *policyTestAdmin) DeleteTopic(string) error { a.writes++; return nil }
func (a *policyTestAdmin) AlterConfig(sarama.ConfigResourceType, string, map[string]*string, bool) error {
	a.writes++
	return nil
}
func (a *policyTestAdmin) ListTopics() (map[string]sarama.TopicDetail, error) {
	a.lists++
	return map[string]sarama.TopicDetail{"test-topic": {NumPartitions: 1, ReplicationFactor: 1}}, nil
}
func (a *policyTestAdmin) DescribeTopics([]string) ([]*sarama.TopicMetadata, error) {
	a.descriptions++
	return []*sarama.TopicMetadata{{Name: "test-topic", Partitions: []*sarama.PartitionMetadata{{ID: 0, Leader: 1, Replicas: []int32{1}, Isr: []int32{1}}}}}, nil
}
func (a *policyTestAdmin) DescribeConfig(sarama.ConfigResource) ([]sarama.ConfigEntry, error) {
	a.configs++
	return []sarama.ConfigEntry{{Name: "retention.ms", Value: "60000"}}, nil
}
func (a *policyTestAdmin) Close() error { a.closes++; return nil }

func setupPolicyTestAdmin(t *testing.T) (*policyTestAdmin, *int) {
	t.Helper()
	admin := &policyTestAdmin{}
	connections := new(int)
	oldFactory := newTopicsAdminClient
	newTopicsAdminClient = func(string) (sarama.ClusterAdmin, error) { *connections++; return admin, nil }
	t.Cleanup(func() { newTopicsAdminClient = oldFactory })
	return admin, connections
}

func policyTestMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/topics", topicsRouter)
	mux.HandleFunc("/api/topics/", topicRouter)
	mux.HandleFunc("/api/capabilities", kafkaCapabilitiesHandler)
	return mux
}

func TestKafkaAdministrativeRequestsAreDeniedBeforeClientCreation(t *testing.T) {
	admin, connections := setupPolicyTestAdmin(t)
	t.Setenv("ODYSSEY_ALLOW_KAFKA_ADMIN", "true")
	t.Setenv("ODYSSEY_ENABLE_ADMIN_OPERATIONS", "true")
	cases := []struct {
		method, path string
		status       int
	}{
		{http.MethodPost, "/api/topics", http.StatusForbidden},
		{http.MethodPost, "/api/topics/", http.StatusForbidden},
		{http.MethodDelete, "/api/topics/test-topic", http.StatusForbidden},
		{http.MethodDelete, "/api/topics/test-topic/", http.StatusForbidden},
		{http.MethodPatch, "/api/topics/test-topic/config", http.StatusForbidden},
		{http.MethodPatch, "/api/topics/test-topic/config-extra", http.StatusNotFound},
		{http.MethodPut, "/api/topics/test-topic/config", http.StatusMethodNotAllowed},
		{http.MethodPost, "/api/topics/test-topic/config", http.StatusMethodNotAllowed},
		{http.MethodDelete, "/api/topics/", http.StatusMethodNotAllowed},
	}
	for _, test := range cases {
		for _, body := range []string{`{"topic":"test-topic","configs":{"retention.ms":"1"}}`, "{invalid"} {
			t.Run(test.method+test.path+body, func(t *testing.T) {
				request := httptest.NewRequest(test.method, test.path+"?owner=true&allow=true", strings.NewReader(body))
				request.RemoteAddr = "127.0.0.1:1234"
				request.Header.Set("Authorization", "Bearer synthetic-owner")
				request.Header.Set("X-Odyssey-Owner", "true")
				request.Header.Set("X-Kafka-Bootstrap", "test-broker.invalid:9092")
				request.Header.Set("X-HTTP-Method-Override", "GET")
				request.AddCookie(&http.Cookie{Name: "owner", Value: "true"})
				response := httptest.NewRecorder()
				policyTestMux().ServeHTTP(response, request)
				if response.Code != test.status {
					t.Fatalf("Ожидался HTTP %d, получен %d", test.status, response.Code)
				}
				if *connections != 0 || admin.writes != 0 {
					t.Fatal("Запрещённый запрос создал клиента или изменил Kafka")
				}
				if test.status == http.StatusForbidden {
					var result map[string]string
					if json.Unmarshal(response.Body.Bytes(), &result) != nil || result["error"] == "" {
						t.Fatal("Ожидалась JSON-ошибка запрета")
					}
					if response.Header().Get("Cache-Control") != "no-store" {
						t.Fatal("Ответ с разрешениями нельзя кэшировать")
					}
				}
			})
		}
	}
}

func TestKafkaWriteHandlersCannotBeCalledWithReadMethods(t *testing.T) {
	admin, connections := setupPolicyTestAdmin(t)
	for _, handler := range []http.HandlerFunc{createTopicHandler, deleteTopicHandler, updateTopicConfigHandler} {
		response := httptest.NewRecorder()
		handler(response, httptest.NewRequest(http.MethodGet, "/api/topics/test-topic", nil))
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatal("Обработчик записи допускает метод GET")
		}
	}
	if *connections != 0 || admin.writes != 0 {
		t.Fatal("Проверка метода обратилась к Kafka")
	}
}

func TestKafkaMonitoringAndReadCapabilitiesRemainAvailable(t *testing.T) {
	admin, connections := setupPolicyTestAdmin(t)
	for _, path := range []string{"/api/topics", "/api/topics/", "/api/topics/test-topic"} {
		response := httptest.NewRecorder()
		policyTestMux().ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("Чтение %s недоступно: %d", path, response.Code)
		}
	}
	if admin.writes != 0 || admin.lists != 2 || admin.descriptions != 1 || admin.configs != 1 || admin.closes != 3 || *connections != 3 {
		t.Fatal("Нарушена работа читающих операций или закрытие клиентов")
	}
	response := httptest.NewRecorder()
	policyTestMux().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/capabilities", nil))
	var capabilities struct {
		KafkaAdmin map[string]bool `json:"kafkaAdmin"`
	}
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &capabilities) != nil || len(capabilities.KafkaAdmin) != 4 {
		t.Fatal("Некорректный ответ возможностей")
	}
	for action, allowed := range capabilities.KafkaAdmin {
		if allowed {
			t.Fatalf("Core разрешил %s без авторизации", action)
		}
	}
	if *connections != 3 {
		t.Fatal("Чтение разрешений создало Kafka-клиента")
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("Разрешения кэшируются")
	}
}

func TestMissingKafkaAdminPolicyFailsClosed(t *testing.T) {
	old := kafkaAdminPolicy
	kafkaAdminPolicy = nil
	t.Cleanup(func() { kafkaAdminPolicy = old })
	for _, action := range []kafkaAdminAction{adminCreateTopic, adminDeleteTopic, adminAlterTopicConfig, adminManageACL, "future.action"} {
		response := httptest.NewRecorder()
		if authorizeKafkaAdministration(response, httptest.NewRequest(http.MethodPost, "/", nil), action) || response.Code != http.StatusForbidden {
			t.Fatal("Отсутствующая политика разрешила административную операцию")
		}
	}
}

func TestTopicPreflightDoesNotCreateKafkaClient(t *testing.T) {
	_, connections := setupPolicyTestAdmin(t)
	response := httptest.NewRecorder()
	policyTestMux().ServeHTTP(response, httptest.NewRequest(http.MethodOptions, "/api/topics", nil))
	if response.Code != http.StatusNoContent || *connections != 0 {
		t.Fatal("Preflight выполнил Kafka-операцию")
	}
	response = httptest.NewRecorder()
	kafkaCapabilitiesHandler(response, httptest.NewRequest(http.MethodPost, "/api/capabilities", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatal("Capabilities допускает запись")
	}
}

type policyTestAuthorizer map[kafkaAdminAction]bool

func (policy policyTestAuthorizer) Allowed(_ *http.Request, action kafkaAdminAction) bool {
	return policy[action]
}

func TestCapabilitiesMatchTrustedServerPolicyAndImplementedActions(t *testing.T) {
	admin, connections := setupPolicyTestAdmin(t)
	original := kafkaAdminPolicy
	// Подставная серверная политика проверяет точку расширения; аутентификацию
	// или разрешение из HTTP-заголовков эта тестовая реализация не добавляет.
	kafkaAdminPolicy = policyTestAuthorizer{adminCreateTopic: true, adminAlterTopicConfig: true, adminManageACL: true}
	t.Cleanup(func() { kafkaAdminPolicy = original })
	response := httptest.NewRecorder()
	kafkaCapabilitiesHandler(response, httptest.NewRequest(http.MethodGet, "/api/capabilities", nil))
	var capabilities struct {
		KafkaAdmin map[string]bool `json:"kafkaAdmin"`
	}
	if json.Unmarshal(response.Body.Bytes(), &capabilities) != nil {
		t.Fatal("Некорректный ответ возможностей")
	}
	flags := capabilities.KafkaAdmin
	if !flags["createTopic"] || !flags["alterTopicConfig"] || flags["deleteTopic"] || flags["manageAcl"] {
		t.Fatal("Возможности не соответствуют политике или объявляют отсутствующий ACL API")
	}
	for _, test := range []struct {
		method, path, body string
		status             int
	}{
		{http.MethodPost, "/api/topics", `{"topic":"test-topic"}`, http.StatusOK},
		{http.MethodPatch, "/api/topics/test-topic/config", `{"configs":{"retention.ms":"1"}}`, http.StatusOK},
		{http.MethodDelete, "/api/topics/test-topic", "", http.StatusForbidden},
	} {
		response = httptest.NewRecorder()
		policyTestMux().ServeHTTP(response, httptest.NewRequest(test.method, test.path, strings.NewReader(test.body)))
		if response.Code != test.status {
			t.Fatalf("Операция %s не соответствует политике: %d", test.method, response.Code)
		}
	}
	if admin.writes != 2 || *connections != 2 || admin.closes != 2 {
		t.Fatal("Нарушена изоляция разрешённых и запрещённых операций")
	}
}
