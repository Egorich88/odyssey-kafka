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
//   unknown  — данных недостаточно для подтверждения состояния.
//
// Сетевой показатель:
//   Kafka Admin API не предоставляет универсальную метрику качества сети.
//   Поэтому networkProblems отражает число подтверждённых отказов подключения.
// =============================================================================

package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/IBM/sarama"
)

// ClusterHealthResponse — агрегированное состояние Kafka-кластера.
type ClusterHealthResponse struct {
	ClusterID         string                    `json:"clusterId,omitempty"`
	ControllerQuorum  *controllerQuorumSnapshot `json:"controllerQuorum,omitempty"`
	Status            string                    `json:"status"`
	BrokerCount       int                       `json:"brokerCount"`
	OnlineBrokers     int                       `json:"onlineBrokers"`
	NetworkProblems   int                       `json:"networkProblems"`
	ISR               ISRHealth                 `json:"isr"`
	OfflinePartitions int                       `json:"offlinePartitions"`
	UnderReplicated   int                       `json:"underReplicated"`
	PartitionsTotal   int                       `json:"partitionsTotal"`
	ReplicasTotal     int                       `json:"replicasTotal"`
	Leaders           int                       `json:"leaders"`
	Followers         int                       `json:"followers"`
	Healthy           int                       `json:"healthy"`
	Offline           int                       `json:"offline"`
	RebalancingGroups int                       `json:"rebalancingGroups"`
	EmptyGroups       int                       `json:"emptyGroups"`
	DeadGroups        int                       `json:"deadGroups"`
	Brokers           []HealthBrokerInfo        `json:"brokers"`
}

// ISRHealth показывает число ISR-реплик и общее число реплик.
type ISRHealth struct {
	InSync int `json:"inSync"`
	Total  int `json:"total"`
}

// HealthBrokerInfo — компактная информация одного брокера.
type HealthBrokerInfo struct {
	ID             int32        `json:"id"`
	Address        string       `json:"address"`
	Online         bool         `json:"online"`
	BrokerStatus   brokerStatus `json:"brokerStatus"`
	Controller     bool         `json:"controller"`
	ControllerRole string       `json:"controllerRole"`
	ISRCount       int32        `json:"isrCount"`
	ReplicaCount   int32        `json:"replicaCount"`
	LeaderCount    int32        `json:"leaderCount"`
	CPU            *float64     `json:"cpu"`
	Memory         *float64     `json:"memory"`
	DiskUsage      float64      `json:"diskUsage"`
	DiskTotal      float64      `json:"diskTotal"`
	Version        string       `json:"version"`
}

// getDashboardHealthHandler возвращает фактическое состояние кластера.
func getDashboardHealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getProfileKeyFromRequest(r)
	if bootstrap == "" {
		sendJSONError(w, "Bootstrap server not provided", http.StatusBadRequest)
		return
	}

	config, metadataRevision := kafkaConfigAndRevision(bootstrap)
	config.Version = sarama.V2_8_0_0
	config.Net.DialTimeout = 3 * time.Second
	config.Net.ReadTimeout = 2 * time.Second
	config.Net.WriteTimeout = 2 * time.Second

	client, err := sarama.NewClient(kafkaProfileBrokers(bootstrap), config)
	if err != nil {
		_ = json.NewEncoder(w).Encode(ClusterHealthResponse{
			Status: "unknown",
		})
		return
	}
	defer client.Close()

	brokers := client.Brokers()
	clusterID, quorum := loadControllerQuorum(r.Context(), client, bootstrap, config)

	kafkaVersion := getRealKafkaVersionWithLog(bootstrap)

	healthBrokers := make([]HealthBrokerInfo, 0, len(brokers))
	brokerByID := make(map[int32]int, len(brokers))

	for _, broker := range brokers {

		info := HealthBrokerInfo{
			ID:             broker.ID(),
			Address:        broker.Addr(),
			BrokerStatus:   brokerUnknown,
			Controller:     quorum.role(clusterID, broker.ID()) == "active",
			ControllerRole: quorum.role(clusterID, broker.ID()),
			Version:        kafkaVersion,
		}

		healthBrokers = append(healthBrokers, info)
		brokerByID[broker.ID()] = len(healthBrokers) - 1
	}

	topics, err := client.Topics()
	if err != nil {
		_ = json.NewEncoder(w).Encode(ClusterHealthResponse{
			Status:           "unknown",
			BrokerCount:      len(brokers),
			Brokers:          healthBrokers,
			ClusterID:        clusterID,
			ControllerQuorum: quorum,
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
	partitionStateUnknown := false

	for _, topic := range topics {
		partitions, err := client.Partitions(topic)
		if err != nil {
			partitionStateUnknown = true
			continue
		}

		for _, partition := range partitions {
			totalPartitions++
			replicas, replicasErr := client.Replicas(topic, partition)
			if replicasErr != nil {
				partitionStateUnknown = true
				continue
			}

			isr, isrErr := client.InSyncReplicas(topic, partition)
			if isrErr != nil {
				partitionStateUnknown = true
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
				if errors.Is(leaderErr, sarama.ErrLeaderNotAvailable) {
					offlinePartitions++
				} else {
					partitionStateUnknown = true
				}
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
	admin, adminClient, revision, groupErr := newBrokerStatusAdmin(bootstrap, true)
	var groups map[string]string
	var statuses map[brokerEndpoint]brokerStatus
	diskOwnsClient := false
	if groupErr == nil {
		defer func() {
			if !diskOwnsClient {
				_ = admin.Close()
			}
		}()
		groups, statuses, groupErr = listObservedGroups(adminClient)
		if groupErr != nil {
			groups = nil
		}
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

	_, currentRevision := kafkaAuthProfileSnapshot(bootstrap)
	if metadataRevision != revision || revision != currentRevision || r.Context().Err() != nil {
		statuses = nil
	} else {
		profile := brokerDiskProfile{bootstrap: bootstrap, revision: revision}
		disks := overviewBrokerDisks.get(profile, time.Now())
		if adminClient != nil {
			done := overviewBrokerDisks.refresh(profile, adminClient, statuses, admin.Close)
			diskOwnsClient = done != nil
			if diskOwnsClient && disks == nil {
				timer := time.NewTimer(brokerDiskInitialWait)
				select {
				case <-done:
					disks = overviewBrokerDisks.get(profile, time.Now())
				case <-timer.C:
				case <-r.Context().Done():
				}
				timer.Stop()
			}
		}
		// Профиль мог измениться, пока собирался первый снимок.
		if _, latestRevision := kafkaAuthProfileSnapshot(bootstrap); latestRevision != revision {
			disks, statuses = nil, nil
		}
		for i := range healthBrokers {
			broker := &healthBrokers[i]
			disk := disks[brokerEndpoint{broker.ID, broker.Address}]
			broker.DiskUsage, broker.DiskTotal = disk.usedGiB, disk.totalGiB
		}
	}
	if _, latestRevision := kafkaAuthProfileSnapshot(bootstrap); latestRevision != metadataRevision || r.Context().Err() != nil {
		quorum = nil
		for i := range healthBrokers {
			healthBrokers[i].Controller = false
			healthBrokers[i].ControllerRole = "unknown"
		}
	}
	onlineBrokers, networkProblems := applyBrokerStatuses(healthBrokers, statuses)
	status := "healthy"

	switch {
	case offlinePartitions > 0 || networkProblems > 0 || deadGroups > 0:
		status = "critical"
	case underReplicated > 0 || rebalancingGroups > 0 || emptyGroups > 0:
		status = "warning"
	case partitionStateUnknown || groupErr != nil || onlineBrokers < len(healthBrokers) || len(healthBrokers) == 0:
		status = "unknown"
	}

	_ = json.NewEncoder(w).Encode(ClusterHealthResponse{
		ClusterID:        clusterID,
		ControllerQuorum: quorum,
		Status:           status,
		BrokerCount:      len(brokers),
		OnlineBrokers:    onlineBrokers,
		NetworkProblems:  networkProblems,
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
