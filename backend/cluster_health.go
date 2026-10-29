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
// Файл: cluster_health.go
// =============================================================================
// Назначение:
//   Предоставляет агрегированное состояние Kafka-кластера для страницы
//   Overview. Один запрос возвращает статус кластера, состояние ISR,
//   состояние партиций, состояние Consumer Groups и компактные сведения
//   по брокерам.
//
//   Эндпоинт:
//     GET /api/overview/health
//
// Статус:
//   healthy  — проблем не обнаружено;
//   warning  — кластер доступен, но есть under-replicated/Empty/Rebalancing;
//   critical — есть недоступные брокеры/партиции или Dead groups;
//   unknown  — фронтенд использует это состояние во время получения данных.
//
// Сетевой показатель:
//   Kafka Admin API не предоставляет универсальную метрику качества сети.
//   Поэтому networkProblems отражает количество брокеров, с которыми KSC
//   не смог подтвердить связность. Это именно проверка связности, а не
//   полноценный network monitoring.
// =============================================================================

package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/IBM/sarama"
)

// ClusterHealthResponse — агрегированное состояние Kafka-кластера.
type ClusterHealthResponse struct {
	Status            string             `json:"status"`
	BrokerCount       int                `json:"brokerCount"`
	OnlineBrokers     int                `json:"onlineBrokers"`
	NetworkProblems   int                `json:"networkProblems"`
	ISR               ISRHealth          `json:"isr"`
	OfflinePartitions int                `json:"offlinePartitions"`
	UnderReplicated   int                `json:"underReplicated"`
	PartitionsTotal   int                `json:"partitionsTotal"`
	ReplicasTotal     int                `json:"replicasTotal"`
	Leaders           int                `json:"leaders"`
	Followers         int                `json:"followers"`
	Healthy           int                `json:"healthy"`
	Offline           int                `json:"offline"`
	RebalancingGroups int                `json:"rebalancingGroups"`
	EmptyGroups       int                `json:"emptyGroups"`
	DeadGroups        int                `json:"deadGroups"`
	Brokers           []HealthBrokerInfo `json:"brokers"`
}

// ISRHealth показывает число ISR-реплик и общее число реплик.
type ISRHealth struct {
	InSync int `json:"inSync"`
	Total  int `json:"total"`
}

// HealthBrokerInfo — компактная информация одного брокера.
type HealthBrokerInfo struct {
	ID           int32   `json:"id"`
	Address      string  `json:"address"`
	Online       bool    `json:"online"`
	Controller   bool    `json:"controller"`
	ISRCount     int32   `json:"isrCount"`
	ReplicaCount int32   `json:"replicaCount"`
	LeaderCount  int32   `json:"leaderCount"`
	CPU          float64 `json:"cpu"`
	Memory       float64 `json:"memory"`
	DiskUsage    float64 `json:"diskUsage"`
	DiskTotal    float64 `json:"diskTotal"`
	Version      string  `json:"version"`
}

// getDashboardHealthHandler возвращает фактическое состояние кластера.
func getDashboardHealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	if bootstrap == "" {
		sendJSONError(w, "Bootstrap server not provided", http.StatusBadRequest)
		return
	}

	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0
	config.Net.DialTimeout = 3 * time.Second
	config.Net.ReadTimeout = 2 * time.Second
	config.Net.WriteTimeout = 2 * time.Second

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		_ = json.NewEncoder(w).Encode(ClusterHealthResponse{
			Status:          "critical",
			NetworkProblems: 1,
		})
		return
	}
	defer client.Close()

	brokers := client.Brokers()
	controller, controllerErr := client.Controller()

	// Метрики Docker используются только как дополнительная эксплуатационная
	// информация. Если Kafka работает не в Docker, значения остаются нулевыми.
	dockerMetrics, containerName := getMetricsFromDockerWithName()
	kafkaVersion := getRealKafkaVersionWithLog(bootstrap)

	healthBrokers := make([]HealthBrokerInfo, 0, len(brokers))
	brokerByID := make(map[int32]int, len(brokers))

	networkProblems := 0
	onlineBrokers := 0

	for _, broker := range brokers {
		online := false
		if connected, connectedErr := broker.Connected(); connectedErr == nil {
			online = connected
		}

		if online {
			onlineBrokers++
		} else {
			networkProblems++
		}

		info := HealthBrokerInfo{
			ID:         broker.ID(),
			Address:    broker.Addr(),
			Online:     online,
			Controller: controllerErr == nil && controller != nil && broker.ID() == controller.ID(),
			CPU:        dockerMetrics.CPU,
			Memory:     dockerMetrics.Memory,
			Version:    kafkaVersion,
		}

		if containerName != "" {
			info.DiskUsage, info.DiskTotal = getDiskUsage(containerName)
		}

		healthBrokers = append(healthBrokers, info)
		brokerByID[broker.ID()] = len(healthBrokers) - 1
	}

	topics, err := client.Topics()
	if err != nil {
		_ = json.NewEncoder(w).Encode(ClusterHealthResponse{
			Status:          "critical",
			BrokerCount:     len(brokers),
			OnlineBrokers:   onlineBrokers,
			NetworkProblems: networkProblems + 1,
			Brokers:         healthBrokers,
		})
		return
	}

	totalPartitions := 0
	totalReplicas := 0
	inSyncReplicas := 0
	leaderCount := 0
	followerCount := 0
	healthyPartitions := 0
	underReplicated := 0
	offlinePartitions := 0

	for _, topic := range topics {
		partitions, err := client.Partitions(topic)
		if err != nil {
			continue
		}

		for _, partition := range partitions {
			totalPartitions++
			replicas, replicasErr := client.Replicas(topic, partition)
			if replicasErr != nil {
				continue
			}

			isr, isrErr := client.InSyncReplicas(topic, partition)
			if isrErr != nil {
				continue
			}

			totalReplicas += len(replicas)
			inSyncReplicas += len(isr)
			if len(replicas) > 0 {
				followerCount += len(replicas) - 1
			}

			for _, brokerID := range replicas {
				if brokerIndex, ok := brokerByID[brokerID]; ok {
					healthBrokers[brokerIndex].ReplicaCount++
				}
			}

			if leader, leaderErr := client.Leader(topic, partition); leaderErr == nil && leader != nil {
				leaderCount++
				if brokerIndex, ok := brokerByID[leader.ID()]; ok {
					healthBrokers[brokerIndex].LeaderCount++
				}
			} else {
				offlinePartitions++
				continue
			}

			if len(isr) < len(replicas) {
				underReplicated++
			} else {
				healthyPartitions++
			}

			for _, brokerID := range isr {
				if brokerIndex, ok := brokerByID[brokerID]; ok {
					healthBrokers[brokerIndex].ISRCount++
				}
			}
		}
	}

	// Consumer Group состояние.
	admin, err := createAdminClient(bootstrap)
	if err != nil {
		sendJSONError(w, "Не удалось создать Admin Client: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	groups, err := admin.ListConsumerGroups()
	if err != nil {
		sendJSONError(w, "Не удалось получить Consumer Groups: "+err.Error(), http.StatusInternalServerError)
		return
	}

	rebalancingGroups := 0
	emptyGroups := 0
	deadGroups := 0

	for groupName := range groups {
		descriptions, describeErr := admin.DescribeConsumerGroups([]string{groupName})
		if describeErr != nil || len(descriptions) == 0 || descriptions[0] == nil {
			continue
		}

		switch normalizeConsumerGroupState(descriptions[0].State) {
		case "Rebalancing":
			rebalancingGroups++
		case "Empty":
			emptyGroups++
		case "Dead":
			deadGroups++
		}
	}

	status := "healthy"

	switch {
	case controllerErr != nil || offlinePartitions > 0 || networkProblems > 0 || deadGroups > 0:
		status = "critical"
	case underReplicated > 0 || rebalancingGroups > 0 || emptyGroups > 0:
		status = "warning"
	}

	_ = json.NewEncoder(w).Encode(ClusterHealthResponse{
		Status:          status,
		BrokerCount:     len(brokers),
		OnlineBrokers:   onlineBrokers,
		NetworkProblems: networkProblems,
		ISR: ISRHealth{
			InSync: inSyncReplicas,
			Total:  totalReplicas,
		},
		OfflinePartitions: offlinePartitions,
		UnderReplicated:   underReplicated,
		PartitionsTotal:   totalPartitions,
		ReplicasTotal:     totalReplicas,
		Leaders:           leaderCount,
		Followers:         followerCount,
		Healthy:           healthyPartitions,
		Offline:           offlinePartitions,
		RebalancingGroups: rebalancingGroups,
		EmptyGroups:       emptyGroups,
		DeadGroups:        deadGroups,
		Brokers:           healthBrokers,
	})
}
