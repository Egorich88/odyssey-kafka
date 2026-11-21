/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// =============================================================================
// Файл: topics.go
// =============================================================================
// Назначение:
//   Предоставляет REST API для управления топиками Kafka.
//   Включает операции: получение списка топиков, создание, удаление,
//   получение детальной информации (партиции, конфигурация),
//   обновление конфигурации топика.
//
// Маршруты:
//   GET    /api/topics           - Получение списка всех топиков
//   POST   /api/topics           - Создание нового топика
//   DELETE /api/topics/{topic}   - Удаление топика
//   GET    /api/topics/{topic}   - Детальная информация о топике
//   PATCH  /api/topics/{topic}/config - Обновление конфигурации топика
//
// Безопасность:
//   X-Kafka-Bootstrap выбирает подключение, но не подтверждает полномочия.
//   Изменения проходят единую серверную политику authorizeKafkaAdministration.
// =============================================================================

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/IBM/sarama"
)

// Подставной клиент в тестах исключает реальные подключения к Kafka.
var newTopicsAdminClient = createAdminClient

func topicsRouter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getTopicsHandler(w, r)
	case http.MethodPost, http.MethodOptions:
		createTopicHandler(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func topicRouter(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/topics/" {
		topicsRouter(w, r)
		return
	}
	switch r.Method {
	case http.MethodDelete:
		deleteTopicHandler(w, r)
	case http.MethodPatch:
		if strings.HasSuffix(r.URL.Path, "/config") {
			updateTopicConfigHandler(w, r)
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	case http.MethodGet:
		if strings.Contains(r.URL.Path, "/messages") {
			getMessagesHandler(w, r)
		} else if strings.Contains(r.URL.Path, "/partitions") {
			getPartitionsHandler(w, r)
		} else {
			getTopicDetailHandler(w, r)
		}
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// =============================================================================
// Модели данных (DTO) для API топиков
// =============================================================================

// TopicMetadata представляет базовую информацию о топике.
// Используется для отображения в списке топиков на фронтенде.
type TopicMetadata struct {
	Name              string `json:"name"`              // Имя топика
	Partitions        int32  `json:"partitions"`        // Количество партиций
	ReplicationFactor int16  `json:"replicationFactor"` // Фактор репликации
}

// TopicsResponse — ответ API со списком топиков.
// Возвращает массив топиков и опциональное сообщение об ошибке.
type TopicsResponse struct {
	Topics []TopicMetadata `json:"topics"`
	Error  string          `json:"error,omitempty"`
}

// CreateTopicRequest — тело запроса для создания нового топика.
type CreateTopicRequest struct {
	Topic       string            `json:"topic"`             // Имя топика
	Partitions  int32             `json:"partitions"`        // Количество партиций
	Replication int16             `json:"replication"`       // Фактор репликации
	Configs     map[string]string `json:"configs,omitempty"` // Дополнительные параметры конфигурации
}

// CreateTopicResponse — ответ API после создания топика.
type CreateTopicResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// PartitionInfo — информация о партиции топика.
// Используется в детальном просмотре топика.
type PartitionInfo struct {
	ID       int32   `json:"id"`       // ID партиции
	Leader   int32   `json:"leader"`   // ID брокера-лидера
	Replicas []int32 `json:"replicas"` // Список ID брокеров-реплик
	Isr      []int32 `json:"isr"`      // Список синхронизированных реплик (In-Sync Replicas)
}

// TopicDetailResponse — детальная информация о топике.
// Включает партиции, фактор репликации и конфигурацию.
type TopicDetailResponse struct {
	Name              string            `json:"name"`              // Имя топика
	Partitions        []PartitionInfo   `json:"partitions"`        // Список партиций
	ReplicationFactor int16             `json:"replicationFactor"` // Фактор репликации
	Configs           map[string]string `json:"configs"`           // Конфигурация топика
}

// UpdateTopicConfigRequest — тело запроса для обновления конфигурации.
type UpdateTopicConfigRequest struct {
	Configs map[string]string `json:"configs"` // Новые параметры конфигурации
}

// =============================================================================
// HTTP-обработчики для управления топиками
// =============================================================================

// getTopicsHandler возвращает список всех топиков с базовой информацией.
// Используется фронтендом для отображения таблицы топиков.
func getTopicsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	admin, err := newTopicsAdminClient(bootstrap)
	if err != nil {
		log.Printf("[getTopicsHandler] AdminClient error: %v", err)
		sendJSONError(w, "Failed to connect to Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	topicsMap, err := admin.ListTopics()
	if err != nil {
		log.Printf("[getTopicsHandler] ListTopics error: %v", err)
		sendJSONError(w, "Failed to list topics: "+err.Error(), http.StatusInternalServerError)
		return
	}

	result := make([]TopicMetadata, 0, len(topicsMap))
	for name, metadata := range topicsMap {
		result = append(result, TopicMetadata{
			Name:              name,
			Partitions:        metadata.NumPartitions,
			ReplicationFactor: metadata.ReplicationFactor,
		})
	}
	_ = json.NewEncoder(w).Encode(TopicsResponse{Topics: result})
}

// createTopicHandler создаёт новый топик в Kafka.
// Поддерживает дополнительные параметры конфигурации через поле Configs.
func createTopicHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Kafka-Bootstrap")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeKafkaAdministration(w, r, adminCreateTopic) {
		return
	}

	var req CreateTopicRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[createTopicHandler] JSON decode error: %v", err)
		sendJSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Topic == "" {
		sendJSONError(w, "Topic name required", http.StatusBadRequest)
		return
	}

	partitions := req.Partitions
	if partitions <= 0 {
		partitions = 1
	}
	replication := req.Replication
	if replication <= 0 {
		replication = 1
	}

	bootstrap := getBootstrapFromRequest(r)
	admin, err := newTopicsAdminClient(bootstrap)
	if err != nil {
		log.Printf("[createTopicHandler] AdminClient error: %v", err)
		sendJSONError(w, "Failed to connect to Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	topicDetail := &sarama.TopicDetail{
		NumPartitions:     partitions,
		ReplicationFactor: replication,
	}
	if len(req.Configs) > 0 {
		configMap := make(map[string]*string)
		for key, value := range req.Configs {
			v := value
			configMap[key] = &v
		}
		topicDetail.ConfigEntries = configMap
	}

	if err := admin.CreateTopic(req.Topic, topicDetail, false); err != nil {
		log.Printf("[createTopicHandler] CreateTopic error: %v", err)
		sendJSONError(w, "Failed to create topic: "+err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(CreateTopicResponse{Success: true})
}

// deleteTopicHandler удаляет топик по имени.
// Требует подтверждения на фронтенде (используется confirm).
func deleteTopicHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", http.MethodDelete)
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeKafkaAdministration(w, r, adminDeleteTopic) {
		return
	}

	topic := strings.TrimPrefix(r.URL.Path, "/api/topics/")
	topic = strings.TrimSuffix(topic, "/")
	if topic == "" {
		sendJSONError(w, "Topic name required", http.StatusBadRequest)
		return
	}

	bootstrap := getBootstrapFromRequest(r)
	log.Printf("[deleteTopicHandler] Deleting topic: %s, bootstrap: %s", topic, bootstrap)

	admin, err := newTopicsAdminClient(bootstrap)
	if err != nil {
		log.Printf("[deleteTopicHandler] AdminClient error: %v", err)
		sendJSONError(w, "Failed to connect to Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	if err = admin.DeleteTopic(topic); err != nil {
		log.Printf("[deleteTopicHandler] DeleteTopic error: %v", err)
		sendJSONError(w, "Failed to delete topic: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// getTopicDetailHandler возвращает детальную информацию о топике.
// Включает список партиций с лидерами, репликами и ISR, а также конфигурацию.
func getTopicDetailHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	topic := strings.TrimPrefix(r.URL.Path, "/api/topics/")
	topic = strings.TrimSuffix(topic, "/")
	if topic == "" {
		sendJSONError(w, "Topic name required", http.StatusBadRequest)
		return
	}

	bootstrap := getBootstrapFromRequest(r)
	admin, err := newTopicsAdminClient(bootstrap)
	if err != nil {
		log.Printf("[getTopicDetailHandler] AdminClient error: %v", err)
		sendJSONError(w, "Failed to connect to Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	metadata, err := admin.DescribeTopics([]string{topic})
	if err != nil {
		log.Printf("[getTopicDetailHandler] DescribeTopics error: %v", err)
		sendJSONError(w, "Failed to describe topic: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if len(metadata) == 0 {
		sendJSONError(w, "Topic not found", http.StatusNotFound)
		return
	}

	topicMeta := metadata[0]
	if topicMeta.Err != sarama.ErrNoError {
		sendJSONError(w, topicMeta.Err.Error(), http.StatusInternalServerError)
		return
	}

	partitions := make([]PartitionInfo, 0, len(topicMeta.Partitions))
	for _, p := range topicMeta.Partitions {
		partitions = append(partitions, PartitionInfo{
			ID:       p.ID,
			Leader:   p.Leader,
			Replicas: p.Replicas,
			Isr:      p.Isr,
		})
	}

	replicationFactor := int16(1)
	if len(topicMeta.Partitions) > 0 {
		replicationFactor = int16(len(topicMeta.Partitions[0].Replicas))
	}

	configs := make(map[string]string)
	cfgResource := sarama.ConfigResource{Type: sarama.TopicResource, Name: topic}
	resp, err := admin.DescribeConfig(cfgResource)
	if err != nil {
		log.Printf("[getTopicDetailHandler] DescribeConfig error for topic %s: %v", topic, err)
	} else {
		for _, entry := range resp {
			configs[entry.Name] = entry.Value
		}
		log.Printf("[getTopicDetailHandler] Loaded %d config entries for topic %s", len(configs), topic)
	}

	response := TopicDetailResponse{
		Name:              topic,
		Partitions:        partitions,
		ReplicationFactor: replicationFactor,
		Configs:           configs,
	}
	_ = json.NewEncoder(w).Encode(response)
}

// updateTopicConfigHandler обновляет конфигурацию топика.
// Принимает карту параметров и применяет их через AlterConfig.
func updateTopicConfigHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Kafka-Bootstrap")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/topics/")
	path = strings.TrimSuffix(path, "/config")
	topic := strings.TrimSuffix(path, "/")
	if topic == "" {
		sendJSONError(w, "Topic name required", http.StatusBadRequest)
		return
	}

	if r.Method != http.MethodPatch {
		w.Header().Set("Allow", http.MethodPatch)
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeKafkaAdministration(w, r, adminAlterTopicConfig) {
		return
	}

	var req UpdateTopicConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[updateTopicConfigHandler] JSON decode error: %v", err)
		sendJSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	bootstrap := getBootstrapFromRequest(r)
	admin, err := newTopicsAdminClient(bootstrap)
	if err != nil {
		log.Printf("[updateTopicConfigHandler] AdminClient error: %v", err)
		sendJSONError(w, "Failed to connect to Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	configs := make(map[string]*string)
	for key, value := range req.Configs {
		v := value
		configs[key] = &v
	}
	if err = admin.AlterConfig(sarama.TopicResource, topic, configs, false); err != nil {
		log.Printf("[updateTopicConfigHandler] AlterConfig error: %v", err)
		sendJSONError(w, "Failed to update config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
