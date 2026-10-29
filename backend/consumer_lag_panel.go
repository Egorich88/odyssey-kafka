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
// Файл: consumer_lag_panel.go
// =============================================================================
// Назначение:
//   REST API и фоновый сборщик данных для панели Consumer Lag на странице
//   Overview. График хранит историю lag, а таблица дополнительно показывает
//   связку Consumer Group + Topic, текущее состояние группы, изменение lag
//   и время последней активности.
//
// Важно:
//   Kafka предоставляет состояние Consumer Group на уровне группы, а не
//   отдельного топика. Поэтому статус в строке Group + Topic отражает
//   фактическое состояние всей Consumer Group.
// =============================================================================

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/IBM/sarama"
)

// =============================================================================
// Модели данных
// =============================================================================

// LagPoint — точка графика одной Consumer Group с разбивкой lag по топикам.
type LagPoint struct {
	Time      string           `json:"time"`
	Timestamp int64            `json:"timestamp"`
	Group     string           `json:"group"`
	Value     int64            `json:"value"`
	Topics    map[string]int64 `json:"topics"`
}

// ConsumerLagRow — текущая строка таблицы Group + Topic.
type ConsumerLagRow struct {
	Group        string `json:"group"`
	Topic        string `json:"topic"`
	Status       string `json:"status"`
	Lag          int64  `json:"lag"`
	Change       int64  `json:"change"`
	LastActivity string `json:"lastActivity,omitempty"`
	Members      int    `json:"members"`
}

// LagResponse — ответ API графика и таблицы.
type LagResponse struct {
	Points []LagPoint       `json:"points"`
	Rows   []ConsumerLagRow `json:"rows"`
}

// =============================================================================
// Кольцевой буфер истории
// =============================================================================

type lagRingBuffer struct {
	points []LagPoint
	idx    int
	full   bool
	mu     sync.RWMutex
}

type lagMetricsStorage struct {
	mu   sync.RWMutex
	data map[string]*lagRingBuffer
	size int
}

func newLagMetricsStorage(bufferSize int) *lagMetricsStorage {
	return &lagMetricsStorage{
		data: make(map[string]*lagRingBuffer),
		size: bufferSize,
	}
}

func (s *lagMetricsStorage) getOrCreateBuffer(group string) *lagRingBuffer {
	s.mu.RLock()
	buf, exists := s.data[group]
	s.mu.RUnlock()
	if exists {
		return buf
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if buf, exists = s.data[group]; exists {
		return buf
	}

	buf = &lagRingBuffer{
		points: make([]LagPoint, s.size),
	}
	s.data[group] = buf
	return buf
}

func (s *lagMetricsStorage) addPoint(group string, point LagPoint) {
	buf := s.getOrCreateBuffer(group)
	buf.mu.Lock()
	defer buf.mu.Unlock()

	buf.points[buf.idx] = point
	buf.idx = (buf.idx + 1) % s.size
	if buf.idx == 0 {
		buf.full = true
	}
}

func (s *lagMetricsStorage) getAllPoints() []LagPoint {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]LagPoint, 0)

	for group, buf := range s.data {
		buf.mu.RLock()

		n := s.size
		if !buf.full {
			n = buf.idx
		}

		start := buf.idx - n
		if start < 0 {
			start += s.size
		}

		for i := 0; i < n; i++ {
			point := buf.points[(start+i)%s.size]
			if point.Time != "" {
				if point.Group == "" {
					point.Group = group
				}
				result = append(result, point)
			}
		}

		buf.mu.RUnlock()
	}

	return result
}

// =============================================================================
// Сборщик истории lag
// =============================================================================

type LagCollector struct {
	storage   *lagMetricsStorage
	bootstrap string
	mu        sync.Mutex
	stopChan  chan struct{}
	interval  time.Duration
}

func NewLagCollector(bootstrap string, bufferSize int, interval time.Duration) *LagCollector {
	return &LagCollector{
		storage:   newLagMetricsStorage(bufferSize),
		bootstrap: bootstrap,
		stopChan:  make(chan struct{}),
		interval:  interval,
	}
}

func (lc *LagCollector) Start() {
	go func() {
		ticker := time.NewTicker(lc.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				lc.collect()
			case <-lc.stopChan:
				log.Printf("[LagCollector] остановлен для bootstrap %s", lc.bootstrap)
				return
			}
		}
	}()
}

func (lc *LagCollector) Stop() {
	close(lc.stopChan)
}

func (lc *LagCollector) collect() {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	lagMap, topicsMap, err := lc.fetchConsumerLagsWithTopics()
	if err != nil {
		log.Printf("[LagCollector] ошибка получения lag: %v", err)
		return
	}

	now := time.Now()

	for group, totalLag := range lagMap {
		if totalLag < 0 {
			totalLag = 0
		}

		lc.storage.addPoint(group, LagPoint{
			Time:      now.Format("15:04:05"),
			Timestamp: now.UnixMilli(),
			Group:     group,
			Value:     totalLag,
			Topics:    topicsMap[group],
		})
	}
}

func (lc *LagCollector) fetchConsumerLagsWithTopics() (
	map[string]int64,
	map[string]map[string]int64,
	error,
) {
	admin, err := createAdminClient(lc.bootstrap)
	if err != nil {
		return nil, nil, err
	}
	defer admin.Close()

	config := kafkaConfigForBootstrap(lc.bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{lc.bootstrap}, config)
	if err != nil {
		return nil, nil, err
	}
	defer client.Close()

	groupsMap, err := admin.ListConsumerGroups()
	if err != nil {
		return nil, nil, err
	}

	result := make(map[string]int64)
	topicsResult := make(map[string]map[string]int64)

	for groupName := range groupsMap {
		offsets, err := admin.ListConsumerGroupOffsets(groupName, nil)
		if err != nil {
			continue
		}

		var totalLag int64
		groupTopics := make(map[string]int64)

		for topic, partitions := range offsets.Blocks {
			var topicLag int64

			for partition, block := range partitions {
				if block == nil || block.Offset < 0 {
					continue
				}

				latestOffset, err := client.GetOffset(topic, partition, sarama.OffsetNewest)
				if err != nil {
					continue
				}

				lag := latestOffset - block.Offset
				if lag > 0 {
					topicLag += lag
					totalLag += lag
				}
			}

			groupTopics[topic] = topicLag
		}

		result[groupName] = totalLag
		topicsResult[groupName] = groupTopics
	}

	return result, topicsResult, nil
}

// =============================================================================
// Текущие строки таблицы Group + Topic
// =============================================================================

type consumerLagSnapshot struct {
	Lag          int64
	Status       string
	LastActiveAt time.Time
}

var (
	consumerLagStateMu sync.Mutex
	consumerLagState   = make(map[string]map[string]consumerLagSnapshot)
)

func getConsumerLagState(bootstrap string) map[string]consumerLagSnapshot {
	state, ok := consumerLagState[bootstrap]
	if !ok {
		state = make(map[string]consumerLagSnapshot)
		consumerLagState[bootstrap] = state
	}
	return state
}

// collectConsumerLagRows получает актуальные state, lag и метаданные
// Consumer Groups одним проходом по Admin API.
func collectConsumerLagRows(bootstrap string) ([]ConsumerLagRow, error) {
	admin, err := createAdminClient(bootstrap)
	if err != nil {
		return nil, err
	}
	defer admin.Close()

	config := kafkaConfigForBootstrap(bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{bootstrap}, config)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	groupsMap, err := admin.ListConsumerGroups()
	if err != nil {
		return nil, err
	}

	consumerLagStateMu.Lock()
	defer consumerLagStateMu.Unlock()

	stateCache := getConsumerLagState(bootstrap)
	now := time.Now()

	rows := make([]ConsumerLagRow, 0)

	for groupName := range groupsMap {
		descriptions, err := admin.DescribeConsumerGroups([]string{groupName})
		if err != nil || len(descriptions) == 0 || descriptions[0] == nil {
			continue
		}

		description := descriptions[0]
		status := normalizeConsumerGroupState(description.State)
		members := len(description.Members)

		offsets, err := admin.ListConsumerGroupOffsets(groupName, nil)
		if err != nil {
			continue
		}

		topics := make(map[string]int64)

		for topic, partitions := range offsets.Blocks {
			var topicLag int64

			for partition, block := range partitions {
				if block == nil || block.Offset < 0 {
					continue
				}

				endOffset, err := client.GetOffset(topic, partition, sarama.OffsetNewest)
				if err != nil {
					continue
				}

				lag := endOffset - block.Offset
				if lag > 0 {
					topicLag += lag
				}
			}

			topics[topic] = topicLag
		}

		for topic, lag := range topics {
			key := groupName + "\x00" + topic
			previous, exists := stateCache[key]

			lastActiveAt := previous.LastActiveAt
			if members > 0 && status == "Stable" {
				lastActiveAt = now
			}

			change := int64(0)
			if exists {
				change = lag - previous.Lag
			}

			stateCache[key] = consumerLagSnapshot{
				Lag:          lag,
				Status:       status,
				LastActiveAt: lastActiveAt,
			}

			lastActivity := ""
			if !lastActiveAt.IsZero() {
				lastActivity = lastActiveAt.Format("15:04:05")
			}

			rows = append(rows, ConsumerLagRow{
				Group:        groupName,
				Topic:        topic,
				Status:       status,
				Lag:          lag,
				Change:       change,
				LastActivity: lastActivity,
				Members:      members,
			})
		}
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Group == rows[j].Group {
			return rows[i].Topic < rows[j].Topic
		}
		return rows[i].Group < rows[j].Group
	})

	return rows, nil
}

// Глобальный сборщик истории lag.
// Один активный сборщик соответствует текущему выбранному Kafka bootstrap.
var (
	currentLagCollector *LagCollector
	lagCollectorMu      sync.RWMutex
)

// ensureLagCollectorForBootstrap создаёт или переключает сборщик для указанного кластера.
// При смене кластера старый сборщик останавливается, чтобы не продолжать опрашивать
// предыдущую Kafka-инсталляцию.
func ensureLagCollectorForBootstrap(bootstrap string) {
	lagCollectorMu.Lock()
	defer lagCollectorMu.Unlock()

	if currentLagCollector != nil && currentLagCollector.bootstrap == bootstrap {
		return
	}

	if currentLagCollector != nil {
		currentLagCollector.Stop()
	}

	log.Printf("[LagCollector] создаём сборщик для bootstrap: %s", bootstrap)
	// 10 секунд × 8640 точек = 24 часа истории в памяти.
	currentLagCollector = NewLagCollector(bootstrap, 8640, 10*time.Second)
	currentLagCollector.Start()
}

// =============================================================================
// HTTP API
// =============================================================================

// GetConsumerLagHandler — график lag + текущая таблица Group + Topic.
//
// Маршрут:
//
//	GET /api/overview/consumer-lag?range=15m|1h|6h|24h
//
// Ответ содержит:
//
//	points — исторические данные для графика;
//	rows   — текущие данные для таблицы.
func GetConsumerLagHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	if bootstrap == "" {
		sendJSONError(w, "Bootstrap server not provided", http.StatusBadRequest)
		return
	}

	ensureLagCollectorForBootstrap(bootstrap)

	lagCollectorMu.RLock()
	collector := currentLagCollector
	lagCollectorMu.RUnlock()

	if collector == nil {
		sendJSONError(w, "Сборщик lag не инициализирован", http.StatusInternalServerError)
		return
	}

	from, to := metricRange(r)
	allPoints := collector.storage.getAllPoints()
	points := make([]LagPoint, 0, len(allPoints))
	for _, point := range allPoints {
		stamp := time.UnixMilli(point.Timestamp)
		if point.Timestamp == 0 || (!stamp.Before(from) && !stamp.After(to)) {
			points = append(points, point)
		}
	}

	rows, rowsErr := collectConsumerLagRows(bootstrap)
	if rowsErr != nil {
		log.Printf("[GetConsumerLagHandler] ошибка получения таблицы: %v", rowsErr)
		rows = []ConsumerLagRow{}
	}

	_ = json.NewEncoder(w).Encode(LagResponse{
		Points: points,
		Rows:   rows,
	})
}
