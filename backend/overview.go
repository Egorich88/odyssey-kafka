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

// Package main предоставляет HTTP-обработчики для мониторинга Kafka-кластера.
// Эти эндпоинты используются страницей Dashboard (Обзор кластера).
package main

import (
	"encoding/json"
	"net/http"

	"github.com/IBM/sarama"
)

// =============================================================================
// Модели ответов API
// =============================================================================

// DashboardOverviewResponse содержит сводную информацию о состоянии кластера.
type DashboardOverviewResponse struct {
	Brokers         int   `json:"brokers"`         // количество брокеров
	Topics          int   `json:"topics"`          // количество топиков
	Partitions      int   `json:"partitions"`      // общее количество партиций
	ConsumerGroups  int   `json:"consumerGroups"`  // количество групп потребителей
	ControllerID    int32 `json:"controllerId"`    // ID текущего брокера-контроллера
	UnderReplicated int   `json:"underReplicated"` // количество недореплицированных партиций
}

// DashboardBroker описывает один брокер Kafka.
type DashboardBroker struct {
	ID         int32  `json:"id"`         // идентификатор брокера
	Address    string `json:"address"`    // сетевой адрес (host:port)
	Controller bool   `json:"controller"` // является ли контроллером кластера
}

// DashboardBrokersResponse возвращает список брокеров.
type DashboardBrokersResponse struct {
	Brokers []DashboardBroker `json:"brokers"`
}

// DashboardConsumerGroup описывает группу потребителей.
type DashboardConsumerGroup struct {
	Name  string `json:"name"`  // название группы
	State string `json:"state"` // состояние (например, "Stable")
}

// DashboardConsumerGroupsResponse возвращает список групп потребителей.
type DashboardConsumerGroupsResponse struct {
	Groups []DashboardConsumerGroup `json:"groups"`
}

// DashboardPartitionsResponse содержит общее количество партиций.
type DashboardPartitionsResponse struct {
	Total int `json:"total"`
}

// DashboardMessagesTotalResponse содержит общее количество сообщений во всём кластере.
type DashboardMessagesTotalResponse struct {
	Total int64 `json:"total"`
}

// =============================================================================
// HTTP-обработчики
// =============================================================================

// getDashboardMessagesTotalHandler возвращает общее количество сообщений во всех топиках.
// Оно вычисляется как сумма максимальных смещений (latest offset) по всем партициям.
func getDashboardMessagesTotalHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	topics, err := client.Topics()
	if err != nil {
		sendJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var total int64
	for _, topic := range topics {
		partitions, err := client.Partitions(topic)
		if err != nil {
			continue
		}
		for _, p := range partitions {
			latest, err := client.GetOffset(topic, p, sarama.OffsetNewest)
			if err != nil {
				continue
			}
			total += latest
		}
	}

	_ = json.NewEncoder(w).Encode(DashboardMessagesTotalResponse{Total: total})
}

// getDashboardOverviewHandler возвращает агрегированную информацию о кластере:
// количество брокеров, топиков, партиций, consumer-групп, ID контроллера,
// а также число недореплицированных партиций.
func getDashboardOverviewHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	// Брокеры
	brokers := client.Brokers()

	// Контроллер
	controller, err := client.Controller()
	if err != nil {
		sendJSONError(w, "Не удалось получить контроллер кластера", http.StatusInternalServerError)
		return
	}

	// Топики и партиции
	topics, err := client.Topics()
	if err != nil {
		sendJSONError(w, "Не удалось получить список топиков", http.StatusInternalServerError)
		return
	}

	totalPartitions := 0
	underReplicated := 0

	for _, topic := range topics {
		partitions, err := client.Partitions(topic)
		if err != nil {
			continue
		}
		totalPartitions += len(partitions)

		for _, partitionID := range partitions {
			replicas, err := client.Replicas(topic, partitionID)
			if err != nil {
				continue
			}
			isr, err := client.InSyncReplicas(topic, partitionID)
			if err != nil {
				continue
			}
			// Если размер ISR меньше количества реплик, партиция недореплицирована
			if len(isr) < len(replicas) {
				underReplicated++
			}
		}
	}

	// Consumer-группы
	admin, err := createAdminClient(bootstrap)
	if err != nil {
		sendJSONError(w, "Не удалось создать Admin Client", http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	groups, err := admin.ListConsumerGroups()
	if err != nil {
		sendJSONError(w, "Не удалось получить Consumer Groups", http.StatusInternalServerError)
		return
	}

	response := DashboardOverviewResponse{
		Brokers:         len(brokers),
		Topics:          len(topics),
		Partitions:      totalPartitions,
		ConsumerGroups:  len(groups),
		ControllerID:    controller.ID(),
		UnderReplicated: underReplicated,
	}

	_ = json.NewEncoder(w).Encode(response)
}

// getDashboardBrokersHandler возвращает список всех брокеров кластера с указанием,
// является ли брокер контроллером.
func getDashboardBrokersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	controller, err := client.Controller()
	if err != nil {
		sendJSONError(w, "Не удалось определить контроллер кластера", http.StatusInternalServerError)
		return
	}

	result := make([]DashboardBroker, 0, len(client.Brokers()))
	for _, broker := range client.Brokers() {
		result = append(result, DashboardBroker{
			ID:         broker.ID(),
			Address:    broker.Addr(),
			Controller: broker.ID() == controller.ID(),
		})
	}

	_ = json.NewEncoder(w).Encode(DashboardBrokersResponse{Brokers: result})
}

// getDashboardConsumerGroupsHandler возвращает список всех consumer-групп
// с их текущим состоянием.
func getDashboardConsumerGroupsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	admin, err := createAdminClient(bootstrap)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	groupsMap, err := admin.ListConsumerGroups()
	if err != nil {
		sendJSONError(w, "Ошибка получения consumer groups: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Собираем названия групп для детального описания
	groupNames := make([]string, 0, len(groupsMap))
	for name := range groupsMap {
		groupNames = append(groupNames, name)
	}

	descriptions, err := admin.DescribeConsumerGroups(groupNames)
	if err != nil {
		sendJSONError(w, "Ошибка описания consumer groups: "+err.Error(), http.StatusInternalServerError)
		return
	}

	result := make([]DashboardConsumerGroup, 0, len(descriptions))
	for _, group := range descriptions {
		result = append(result, DashboardConsumerGroup{
			Name:  group.GroupId,
			State: group.State,
		})
	}

	_ = json.NewEncoder(w).Encode(DashboardConsumerGroupsResponse{Groups: result})
}

// getDashboardPartitionsHandler возвращает общее количество партиций во всех топиках.
func getDashboardPartitionsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	topics, err := client.Topics()
	if err != nil {
		sendJSONError(w, "Не удалось получить список топиков", http.StatusInternalServerError)
		return
	}

	totalPartitions := 0
	for _, topic := range topics {
		partitions, err := client.Partitions(topic)
		if err != nil {
			continue
		}
		totalPartitions += len(partitions)
	}

	_ = json.NewEncoder(w).Encode(DashboardPartitionsResponse{Total: totalPartitions})
}

// Примечание: в данном файле используются вспомогательные функции:
// - getBootstrapFromRequest(r *http.Request) string
// - createAdminClient(bootstrap string) (sarama.ClusterAdmin, error)
// - sendJSONError(w http.ResponseWriter, message string, code int)
// Они должны быть определены в другом месте пакета main.
