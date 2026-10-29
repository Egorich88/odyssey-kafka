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

// consumer_groups.go содержит API для страницы Consumer Groups.
// Здесь frontend получает реальные данные Kafka:
// - список групп;
// - состояние и protocol;
// - coordinator;
// - topics и количество partition;
// - участников группы;
// - текущие offsets и lag.
package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/IBM/sarama"
)

// ConsumerGroupSummary — строка основной таблицы Consumer Groups.
type ConsumerGroupSummary struct {
	Name        string   `json:"name"`
	State       string   `json:"state"`
	Lag         int64    `json:"lag"`
	Members     int      `json:"members"`
	Coordinator string   `json:"coordinator"`
	Topics      []string `json:"topics"`
	Partitions  int      `json:"partitions"`
	Protocol    string   `json:"protocol"`
}

// ConsumerGroupMemberResponse — реальный участник consumer group.
type ConsumerGroupMemberResponse struct {
	ID         string   `json:"id"`
	ClientID   string   `json:"clientId"`
	Host       string   `json:"host"`
	Partitions []string `json:"partitions"`
}

// ConsumerGroupOffsetResponse — offset конкретной topic/partition.
type ConsumerGroupOffsetResponse struct {
	Topic         string `json:"topic"`
	Partition     int32  `json:"partition"`
	CurrentOffset int64  `json:"currentOffset"`
	EndOffset     int64  `json:"endOffset"`
	Lag           int64  `json:"lag"`
}

// ConsumerGroupDetailsResponse — подробная информация выбранной группы.
type ConsumerGroupDetailsResponse struct {
	ConsumerGroupSummary
	MembersDetail []ConsumerGroupMemberResponse `json:"membersDetail"`
	Offsets       []ConsumerGroupOffsetResponse `json:"offsets"`
}

func writeConsumerGroupsJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

// buildConsumerGroupSummary собирает сводные данные одной группы напрямую из Kafka.
func buildConsumerGroupSummary(client sarama.Client, admin sarama.ClusterAdmin, groupName string) (ConsumerGroupSummary, error) {
	descriptions, err := admin.DescribeConsumerGroups([]string{groupName})
	if err != nil {
		return ConsumerGroupSummary{}, err
	}
	if len(descriptions) == 0 || descriptions[0] == nil {
		return ConsumerGroupSummary{}, &consumerGroupNotFoundError{groupName: groupName}
	}

	description := descriptions[0]

	offsets, err := admin.ListConsumerGroupOffsets(groupName, nil)
	if err != nil {
		return ConsumerGroupSummary{}, err
	}

	topicsSet := make(map[string]struct{})
	partitions := 0
	var totalLag int64

	for topic, topicOffsets := range offsets.Blocks {
		topicsSet[topic] = struct{}{}
		partitions += len(topicOffsets)

		for partition, block := range topicOffsets {
			if block == nil || block.Offset < 0 {
				continue
			}
			latest, latestErr := client.GetOffset(topic, partition, sarama.OffsetNewest)
			if latestErr != nil {
				continue
			}
			lag := latest - block.Offset
			if lag > 0 {
				totalLag += lag
			}
		}
	}

	topics := make([]string, 0, len(topicsSet))
	for topic := range topicsSet {
		topics = append(topics, topic)
	}
	sort.Strings(topics)

	coordinator := ""
	if broker, coordinatorErr := client.Coordinator(groupName); coordinatorErr == nil && broker != nil {
		coordinator = broker.Addr()
	}

	return ConsumerGroupSummary{
		Name:        groupName,
		State:       normalizeConsumerGroupState(description.State),
		Lag:         totalLag,
		Members:     len(description.Members),
		Coordinator: coordinator,
		Topics:      topics,
		Partitions:  partitions,
		Protocol:    description.Protocol,
	}, nil
}

// buildConsumerGroupDetails добавляет участников и offsets к сводной информации.
func buildConsumerGroupDetails(client sarama.Client, admin sarama.ClusterAdmin, groupName string) (ConsumerGroupDetailsResponse, error) {
	summary, err := buildConsumerGroupSummary(client, admin, groupName)
	if err != nil {
		return ConsumerGroupDetailsResponse{}, err
	}

	descriptions, err := admin.DescribeConsumerGroups([]string{groupName})
	if err != nil || len(descriptions) == 0 || descriptions[0] == nil {
		if err != nil {
			return ConsumerGroupDetailsResponse{}, err
		}
		return ConsumerGroupDetailsResponse{}, &consumerGroupNotFoundError{groupName: groupName}
	}

	description := descriptions[0]
	members := make([]ConsumerGroupMemberResponse, 0, len(description.Members))

	for memberID, member := range description.Members {
		if member == nil {
			continue
		}

		partitions := make([]string, 0)
		if assignment, assignmentErr := member.GetMemberAssignment(); assignmentErr == nil && assignment != nil {
			for topic, topicPartitions := range assignment.Topics {
				for _, partition := range topicPartitions {
					partitions = append(partitions, topic+"-"+itoa32(partition))
				}
			}
			sort.Strings(partitions)
		}

		members = append(members, ConsumerGroupMemberResponse{
			ID:         memberID,
			ClientID:   member.ClientId,
			Host:       member.ClientHost,
			Partitions: partitions,
		})
	}

	sort.Slice(members, func(i, j int) bool {
		return members[i].ID < members[j].ID
	})

	offsetsResponse := make([]ConsumerGroupOffsetResponse, 0, summary.Partitions)
	offsets, err := admin.ListConsumerGroupOffsets(groupName, nil)
	if err != nil {
		return ConsumerGroupDetailsResponse{}, err
	}

	for topic, topicOffsets := range offsets.Blocks {
		for partition, block := range topicOffsets {
			if block == nil {
				continue
			}

			endOffset := int64(-1)
			if latest, latestErr := client.GetOffset(topic, partition, sarama.OffsetNewest); latestErr == nil {
				endOffset = latest
			}

			lag := int64(0)
			if block.Offset >= 0 && endOffset >= 0 && endOffset > block.Offset {
				lag = endOffset - block.Offset
			}

			offsetsResponse = append(offsetsResponse, ConsumerGroupOffsetResponse{
				Topic:         topic,
				Partition:     partition,
				CurrentOffset: block.Offset,
				EndOffset:     endOffset,
				Lag:           lag,
			})
		}
	}

	sort.Slice(offsetsResponse, func(i, j int) bool {
		if offsetsResponse[i].Topic == offsetsResponse[j].Topic {
			return offsetsResponse[i].Partition < offsetsResponse[j].Partition
		}
		return offsetsResponse[i].Topic < offsetsResponse[j].Topic
	})

	return ConsumerGroupDetailsResponse{
		ConsumerGroupSummary: summary,
		MembersDetail:        members,
		Offsets:              offsetsResponse,
	}, nil
}

// getConsumerGroupsHandler возвращает реальные группы для основной таблицы.
func getConsumerGroupsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	bootstrap := getBootstrapFromRequest(r)
	client, err := createKafkaClientForConsumerGroups(bootstrap)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	admin, err := createAdminClient(bootstrap)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Admin Client: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	groupsMap, err := admin.ListConsumerGroups()
	if err != nil {
		sendJSONError(w, "Ошибка получения Consumer Groups: "+err.Error(), http.StatusInternalServerError)
		return
	}

	result := make([]ConsumerGroupSummary, 0, len(groupsMap))
	for groupName := range groupsMap {
		summary, summaryErr := buildConsumerGroupSummary(client, admin, groupName)
		if summaryErr != nil {
			continue
		}
		result = append(result, summary)
	}

	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})

	writeConsumerGroupsJSON(w, result)
}

// getConsumerGroupDetailsHandler возвращает реальное содержимое Members/Offsets.
func getConsumerGroupDetailsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	prefix := "/api/consumer-groups/"
	if !strings.HasPrefix(r.URL.Path, prefix) {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	groupName := strings.TrimPrefix(r.URL.Path, prefix)
	if groupName == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	bootstrap := getBootstrapFromRequest(r)
	client, err := createKafkaClientForConsumerGroups(bootstrap)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Kafka: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	admin, err := createAdminClient(bootstrap)
	if err != nil {
		sendJSONError(w, "Ошибка подключения к Admin Client: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer admin.Close()

	details, err := buildConsumerGroupDetails(client, admin, groupName)
	if err != nil {
		sendJSONError(w, "Не удалось получить данные группы: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeConsumerGroupsJSON(w, details)
}

func createKafkaClientForConsumerGroups(bootstrap string) (sarama.Client, error) {
	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0
	return sarama.NewClient([]string{bootstrap}, config)
}

func normalizeConsumerGroupState(state string) string {
	switch state {
	case "PreparingRebalance", "CompletingRebalance":
		return "Rebalancing"
	case "Stable", "Rebalancing", "Dead", "Empty":
		return state
	default:
		if state == "" {
			return "Empty"
		}
		return state
	}
}

func itoa32(value int32) string {
	return strconv.FormatInt(int64(value), 10)
}

type consumerGroupNotFoundError struct {
	groupName string
}

func (e *consumerGroupNotFoundError) Error() string {
	return "Consumer Group не найдена: " + e.groupName
}
