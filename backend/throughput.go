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
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/IBM/sarama"
)

// =============================================================================
// Модели данных для ответа API
// =============================================================================

type DashboardThroughputPoint struct {
	Time      string  `json:"time"`
	Timestamp int64   `json:"timestamp"`
	Incoming  float64 `json:"incoming"`
	Outgoing  float64 `json:"outgoing"`
}

type DashboardThroughputResponse struct {
	Points []DashboardThroughputPoint `json:"points"`
}

// =============================================================================
// Кольцевой буфер
// =============================================================================

type ThroughputRingBuffer struct {
	mu     sync.RWMutex
	size   int
	points []DashboardThroughputPoint
	idx    int
	full   bool
}

func NewThroughputRingBuffer(size int) *ThroughputRingBuffer {
	return &ThroughputRingBuffer{
		size:   size,
		points: make([]DashboardThroughputPoint, size),
		idx:    0,
		full:   false,
	}
}

func (rb *ThroughputRingBuffer) Add(p DashboardThroughputPoint) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.points[rb.idx] = p
	rb.idx = (rb.idx + 1) % rb.size
	if rb.idx == 0 {
		rb.full = true
	}
}

func (rb *ThroughputRingBuffer) GetAll() []DashboardThroughputPoint {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	n := rb.size
	if !rb.full {
		n = rb.idx
	}
	result := make([]DashboardThroughputPoint, n)
	start := rb.idx - n
	if start < 0 {
		start += rb.size
	}
	for i := 0; i < n; i++ {
		result[i] = rb.points[(start+i)%rb.size]
	}
	return result
}

// =============================================================================
// Детализированный сборщик метрик (с сохранением предыдущих оффсетов)
// =============================================================================

type TopicPartitionKey struct {
	Topic     string
	Partition int32
}

type ThroughputCollector struct {
	buffer    *ThroughputRingBuffer
	bootstrap string
	lastTime  time.Time
	mu        sync.Mutex
	stopChan  chan struct{}
	// предыдущие значения оффсетов для входящих (latest offset)
	lastMessagesOffsets map[TopicPartitionKey]int64
	// предыдущие значения оффсетов для исходящих (committed offsets по группам)
	lastConsumedOffsets map[string]map[TopicPartitionKey]int64 // group -> partition -> offset
}

func NewThroughputCollector(bootstrap string, bufferSize int) *ThroughputCollector {
	return &ThroughputCollector{
		buffer:              NewThroughputRingBuffer(bufferSize),
		bootstrap:           bootstrap,
		stopChan:            make(chan struct{}),
		lastMessagesOffsets: make(map[TopicPartitionKey]int64),
		lastConsumedOffsets: make(map[string]map[TopicPartitionKey]int64),
	}
}

func (tc *ThroughputCollector) Start(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				tc.collect()
			case <-tc.stopChan:
				log.Printf("[ThroughputCollector] остановлен для bootstrap %s", tc.bootstrap)
				return
			}
		}
	}()
}

func (tc *ThroughputCollector) Stop() {
	close(tc.stopChan)
}

func (tc *ThroughputCollector) collect() {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	// Получаем текущие оффсеты: latest offsets (входящие) и committed offsets (исходящие)
	messagesOffsets, consumedOffsets, err := tc.fetchDetailedMetrics()
	if err != nil {
		log.Printf("[ThroughputCollector] ошибка получения метрик: %v", err)
		return
	}

	now := time.Now()
	if tc.lastTime.IsZero() {
		// первая итерация – сохраняем состояния
		tc.lastMessagesOffsets = messagesOffsets
		tc.lastConsumedOffsets = consumedOffsets
		tc.lastTime = now
		log.Printf("[ThroughputCollector] первая итерация: сохранены начальные оффсеты")
		return
	}

	elapsed := now.Sub(tc.lastTime).Seconds()
	if elapsed <= 0 {
		return
	}

	// ----- Вычисляем общие суммы и детальные изменения -----
	var totalNewMessages int64
	var totalNewConsumed int64

	// Логируем изменения входящих (по топикам/партициям)
	for key, current := range messagesOffsets {
		prev, exists := tc.lastMessagesOffsets[key]
		if !exists {
			// новая партиция – считаем прирост от 0
			prev = 0
		}
		delta := current - prev
		if delta > 0 {
			totalNewMessages += delta
			log.Printf("[INCOMING] topic=%s partition=%d новое сообщение(ий): %d (offset: %d -> %d)",
				key.Topic, key.Partition, delta, prev, current)
		}
	}

	// Логируем изменения исходящих (по группам потребителей)
	for group, partitions := range consumedOffsets {
		prevGroup, ok := tc.lastConsumedOffsets[group]
		if !ok {
			// новая группа потребителей
			log.Printf("[CONSUMER] новая группа подключилась: %s", group)
			prevGroup = make(map[TopicPartitionKey]int64)
		}
		for key, current := range partitions {
			prev := prevGroup[key]
			delta := current - prev
			if delta > 0 {
				totalNewConsumed += delta
				log.Printf("[OUTGOING] group=%s topic=%s partition=%d прочитано сообщений: %d (offset: %d -> %d)",
					group, key.Topic, key.Partition, delta, prev, current)
			}
		}
	}

	// Вычисляем средние скорости
	incomingRate := float64(totalNewMessages) / elapsed
	outgoingRate := float64(totalNewConsumed) / elapsed

	// Округляем
	incomingRate = math.Round(incomingRate*10) / 10
	outgoingRate = math.Round(outgoingRate*10) / 10

	log.Printf("[ThroughputCollector] итого: входящие +%d сообщений (%.1f msg/s), исходящие +%d сообщений (%.1f msg/s), elapsed=%.2f",
		totalNewMessages, incomingRate, totalNewConsumed, outgoingRate, elapsed)

	// Сохраняем текущие оффсеты для следующей итерации
	tc.lastMessagesOffsets = messagesOffsets
	tc.lastConsumedOffsets = consumedOffsets
	tc.lastTime = now

	if incomingRate < 0 {
		incomingRate = 0
	}

	if outgoingRate < 0 {
		outgoingRate = 0
	}

	// Добавляем точку в буфер
	point := DashboardThroughputPoint{
		Time:      now.Format("15:04:05"),
		Timestamp: now.UnixMilli(),
		Incoming:  incomingRate,
		Outgoing:  outgoingRate,
	}
	tc.buffer.Add(point)
}

// fetchDetailedMetrics возвращает:
// - map[TopicPartitionKey]int64 – текущие latest offsets (входящие)
// - map[group]map[TopicPartitionKey]int64 – текущие committed offsets (исходящие)
func (tc *ThroughputCollector) fetchDetailedMetrics() (map[TopicPartitionKey]int64, map[string]map[TopicPartitionKey]int64, error) {
	config := kafkaConfigForBootstrap(tc.bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{tc.bootstrap}, config)
	if err != nil {
		return nil, nil, err
	}
	defer client.Close()

	// Принудительное обновление метаданных
	_ = client.RefreshMetadata()

	// ----- 1. Собираем latest offsets -----
	messages := make(map[TopicPartitionKey]int64)
	topics, err := client.Topics()
	if err != nil {
		return nil, nil, err
	}
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
			messages[TopicPartitionKey{Topic: topic, Partition: p}] = latest
		}
	}

	// ----- 2. Собираем committed offsets (по группам) -----
	admin, err := createAdminClient(tc.bootstrap)
	if err != nil {
		return messages, nil, err
	}
	defer admin.Close()

	groupsMap, err := admin.ListConsumerGroups()
	if err != nil {
		return messages, nil, err
	}

	consumed := make(map[string]map[TopicPartitionKey]int64)
	for groupName := range groupsMap {
		offsets, err := admin.ListConsumerGroupOffsets(groupName, nil)
		if err != nil {
			continue
		}
		groupMap := make(map[TopicPartitionKey]int64)
		for topic, partitions := range offsets.Blocks {
			for partition, block := range partitions {
				key := TopicPartitionKey{Topic: topic, Partition: partition}
				groupMap[key] = block.Offset
			}
		}
		if len(groupMap) > 0 {
			consumed[groupName] = groupMap
		}
	}

	return messages, consumed, nil
}

func (tc *ThroughputCollector) GetPoints() []DashboardThroughputPoint {
	return tc.buffer.GetAll()
}

// =============================================================================
// Глобальное управление сборщиками
// =============================================================================

var (
	currentCollector *ThroughputCollector
	collectorMu      sync.RWMutex
)

func ensureCollectorForBootstrap(bootstrap string) {
	collectorMu.Lock()
	defer collectorMu.Unlock()
	if currentCollector != nil && currentCollector.bootstrap == bootstrap {
		return
	}
	if currentCollector != nil {
		currentCollector.Stop()
	}
	log.Printf("[ThroughputCollector] создаём новый сборщик для bootstrap: %s", bootstrap)
	// 15 секунд × 5760 точек = 24 часа истории в памяти.
	currentCollector = NewThroughputCollector(bootstrap, 5760)
	currentCollector.Start(15 * time.Second)
}

func getDashboardThroughputHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	bootstrap := getBootstrapFromRequest(r)
	if bootstrap == "" {
		sendJSONError(w, "Bootstrap server not provided", http.StatusBadRequest)
		return
	}
	ensureCollectorForBootstrap(bootstrap)
	collectorMu.RLock()
	collector := currentCollector
	collectorMu.RUnlock()
	if collector == nil {
		sendJSONError(w, "Сборщик метрик не инициализирован", http.StatusInternalServerError)
		return
	}
	from, to := metricRange(r)
	allPoints := collector.GetPoints()
	points := make([]DashboardThroughputPoint, 0, len(allPoints))
	for _, point := range allPoints {
		stamp := time.UnixMilli(point.Timestamp)
		if point.Timestamp == 0 || (!stamp.Before(from) && !stamp.After(to)) {
			points = append(points, point)
		}
	}
	response := DashboardThroughputResponse{Points: points}
	_ = json.NewEncoder(w).Encode(response)
}
