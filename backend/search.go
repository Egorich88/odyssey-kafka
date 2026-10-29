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

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/IBM/sarama"
)

// =============================================================================
// Модели данных для работы с сообщениями
// =============================================================================

// Message представляет одно сообщение из Kafka.
type Message struct {
	Offset    int64  `json:"offset"`
	Key       string `json:"key"`
	Value     string `json:"value"`
	Timestamp string `json:"timestamp"`
	Partition int32  `json:"partition"`
}

// MessagesResponse – ответ API с сообщениями и общим количеством.
type MessagesResponse struct {
	Messages []Message `json:"messages"`
	Total    int       `json:"total"`
}

// PartitionsResponse – ответ API со списком партиций.
type PartitionsResponse struct {
	Partitions []int32 `json:"partitions"`
}

// =============================================================================
// HTTP-обработчики
// =============================================================================

// getMessagesHandler возвращает сообщения из топика с поддержкой поиска по ключу/значению.
// Параметры:
//   - partition: номер партиции или "all"
//   - offset: начальный оффсет
//   - limit: максимальное количество сообщений (не более 1000)
//   - search: поисковая строка (регистронезависимая фильтрация)
func getMessagesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	// Извлекаем имя топика из URL
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		sendJSONError(w, "Invalid topic path", http.StatusBadRequest)
		return
	}
	topic := pathParts[3]
	if topic == "" {
		sendJSONError(w, "Topic name required", http.StatusBadRequest)
		return
	}

	// Чтение параметров запроса
	offsetStr := r.URL.Query().Get("offset")
	limitStr := r.URL.Query().Get("limit")
	partitionStr := r.URL.Query().Get("partition")
	searchQuery := r.URL.Query().Get("search")

	log.Printf("[Search] topic=%s partition=%s offset=%s search=%s", topic, partitionStr, offsetStr, searchQuery)

	// Определяем партицию
	var partition int32 = -1
	if partitionStr != "" && partitionStr != "all" {
		if p, err := strconv.Atoi(partitionStr); err == nil {
			partition = int32(p)
		}
	}

	// Начальный оффсет
	offset := int64(0)
	if offsetStr != "" {
		if o, err := strconv.ParseInt(offsetStr, 10, 64); err == nil && o >= 0 {
			offset = o
		}
	}

	// Лимит сообщений (не более 1000)
	limit := int32(10)
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
			limit = int32(l)
		}
	}

	// Подключение к Kafka
	bootstrap := getBootstrapFromRequest(r)
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0
	config.Consumer.Return.Errors = true

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		log.Printf("Client error: %v", err)
		sendJSONError(w, "Failed to create client: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	consumer, err := sarama.NewConsumerFromClient(client)
	if err != nil {
		log.Printf("Consumer error: %v", err)
		sendJSONError(w, "Failed to create consumer: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer consumer.Close()

	// Если выбрана конкретная партиция – получаем диапазоны оффсетов
	var earliestOffset, latestOffset int64
	if partition != -1 {
		earliestOffset, err = client.GetOffset(topic, partition, sarama.OffsetOldest)
		if err != nil {
			sendJSONError(w, "Failed to get earliest offset: "+err.Error(), http.StatusInternalServerError)
			return
		}
		latestOffset, err = client.GetOffset(topic, partition, sarama.OffsetNewest)
		if err != nil {
			sendJSONError(w, "Failed to get latest offset: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if offset < earliestOffset {
		offset = earliestOffset
	}

	messages := make([]Message, 0)

	// Если начальный оффсет достиг конца – возвращаем пустой результат
	if partition != -1 && offset >= latestOffset {
		total := int(latestOffset - earliestOffset)
		_ = json.NewEncoder(w).Encode(MessagesResponse{Messages: messages, Total: total})
		return
	}

	// Получаем список партиций топика
	partitions, err := client.Partitions(topic)
	log.Printf("[Search] partitions of %s: %+v", topic, partitions)
	if err != nil {
		sendJSONError(w, "Failed to get partitions: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Функция проверки, подходит ли сообщение под поиск (регистронезависимо)
	matchesSearch := func(msg *sarama.ConsumerMessage) bool {
		if searchQuery == "" {
			return true
		}
		query := strings.ToLower(searchQuery)
		keyMatch := strings.Contains(strings.ToLower(string(msg.Key)), query)
		valMatch := strings.Contains(strings.ToLower(string(msg.Value)), query)
		return keyMatch || valMatch
	}

	if partition == -1 {
		// Чтение из ВСЕХ партиций (последовательно)
		for _, p := range partitions {
			log.Printf("[Search] reading topic=%s partition=%d offset=%d", topic, p, offset)
			pc, err := consumer.ConsumePartition(topic, p, sarama.OffsetOldest)
			if err != nil {
				log.Printf("Partition %d error: %v", p, err)
				continue
			}
			timeout := time.After(1 * time.Second)
			done := false
			for !done {
				select {
				case msg := <-pc.Messages():
					log.Printf("[Search] msg partition=%d offset=%d", p, msg.Offset)
					if matchesSearch(msg) {
						messages = append(messages, Message{
							Offset:    msg.Offset,
							Key:       string(msg.Key),
							Value:     string(msg.Value),
							Timestamp: msg.Timestamp.Format(time.RFC3339),
							Partition: p,
						})
					}
					if len(messages) >= int(limit) {
						done = true
					}
				case <-timeout:
					done = true
				}
			}
			pc.Close()
			if len(messages) >= int(limit) {
				break
			}
		}
	} else {
		// Чтение из одной конкретной партиции, начиная с offset
		pc, err := consumer.ConsumePartition(topic, partition, offset)
		if err != nil {
			sendJSONError(w, "Failed to consume partition: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer pc.Close()
		timeout := time.After(3 * time.Second)
		done := false
		for i := int32(0); i < limit && !done; i++ {
			select {
			case msg := <-pc.Messages():
				log.Printf("[Search] msg partition=%d offset=%d", partition, msg.Offset)
				if matchesSearch(msg) {
					messages = append(messages, Message{
						Offset:    msg.Offset,
						Key:       string(msg.Key),
						Value:     string(msg.Value),
						Timestamp: msg.Timestamp.Format(time.RFC3339),
						Partition: partition,
					})
				}
			case <-timeout:
				done = true
			}
		}
	}

	// Общее количество сообщений (для пагинации)
	total := len(messages)
	if partition != -1 {
		total = int(latestOffset - earliestOffset)
	}
	_ = json.NewEncoder(w).Encode(MessagesResponse{Messages: messages, Total: total})
}

// getPartitionsHandler возвращает список ID партиций для указанного топика.
func getPartitionsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/topics/")
	path = strings.TrimSuffix(path, "/partitions")
	topic := strings.TrimSuffix(path, "/")
	if topic == "" {
		sendJSONError(w, "Topic name required", http.StatusBadRequest)
		return
	}

	bootstrap := getBootstrapFromRequest(r)
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	partitions, err := client.Partitions(topic)
	log.Printf("[Search] partitions of %s: %+v", topic, partitions)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(PartitionsResponse{Partitions: partitions})
}
