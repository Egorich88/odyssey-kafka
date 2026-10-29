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
	"sync"
	"time"

	"github.com/IBM/sarama"
)

// TopicsPanelPoint – точка графика для одного топика (скорость float64)
type TopicsPanelPoint struct {
	Time      string  `json:"time"`
	Timestamp int64   `json:"timestamp"`
	Topic     string  `json:"topic"`
	Value     float64 `json:"value"`
}

type TopicsPanelResponse struct {
	Points []TopicsPanelPoint `json:"points"`
}

type topicsRingBuffer struct {
	points []TopicsPanelPoint
	idx    int
	full   bool
	mu     sync.RWMutex
}

type topicsMetricsStorage struct {
	mu   sync.RWMutex
	data map[string]*topicsRingBuffer
	size int
}

func newTopicsMetricsStorage(bufferSize int) *topicsMetricsStorage {
	return &topicsMetricsStorage{
		data: make(map[string]*topicsRingBuffer),
		size: bufferSize,
	}
}

func (s *topicsMetricsStorage) getOrCreateBuffer(topic string) *topicsRingBuffer {
	s.mu.RLock()
	buf, exists := s.data[topic]
	s.mu.RUnlock()
	if exists {
		return buf
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if buf, exists = s.data[topic]; exists {
		return buf
	}
	buf = &topicsRingBuffer{
		points: make([]TopicsPanelPoint, s.size),
		idx:    0,
		full:   false,
	}
	s.data[topic] = buf
	return buf
}

func (s *topicsMetricsStorage) addPoint(topic string, point TopicsPanelPoint) {
	buf := s.getOrCreateBuffer(topic)
	buf.mu.Lock()
	defer buf.mu.Unlock()
	buf.points[buf.idx] = point
	buf.idx = (buf.idx + 1) % s.size
	if buf.idx == 0 {
		buf.full = true
	}
}

func (s *topicsMetricsStorage) getAllPoints() []TopicsPanelPoint {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]TopicsPanelPoint, 0)
	for topic, buf := range s.data {
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
			pt := buf.points[(start+i)%s.size]
			if pt.Time != "" {
				if pt.Topic == "" {
					pt.Topic = topic
				}
				result = append(result, pt)
			}
		}
		buf.mu.RUnlock()
	}
	return result
}

type TopicsPanelCollector struct {
	storage     *topicsMetricsStorage
	bootstrap   string
	lastOffsets map[string]int64
	lastTime    time.Time
	mu          sync.Mutex
	stopChan    chan struct{}
	interval    time.Duration
}

func NewTopicsPanelCollector(bootstrap string, bufferSize int, interval time.Duration) *TopicsPanelCollector {
	return &TopicsPanelCollector{
		storage:     newTopicsMetricsStorage(bufferSize),
		bootstrap:   bootstrap,
		lastOffsets: make(map[string]int64),
		stopChan:    make(chan struct{}),
		interval:    interval,
	}
}

func (tc *TopicsPanelCollector) Start() {
	go func() {
		ticker := time.NewTicker(tc.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				tc.collect()
			case <-tc.stopChan:
				log.Printf("[TopicsPanelCollector] остановлен для bootstrap %s", tc.bootstrap)
				return
			}
		}
	}()
}

func (tc *TopicsPanelCollector) Stop() {
	close(tc.stopChan)
}

func (tc *TopicsPanelCollector) collect() {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	currentOffsets, err := tc.fetchTopicOffsets()
	if err != nil {
		log.Printf("[TopicsPanelCollector] ошибка получения оффсетов: %v", err)
		return
	}

	now := time.Now()
	if tc.lastTime.IsZero() {
		tc.lastOffsets = currentOffsets
		tc.lastTime = now
		log.Printf("[TopicsPanelCollector] инициализация оффсетов, точек не добавляется")
		return
	}

	elapsed := now.Sub(tc.lastTime).Seconds()
	if elapsed <= 0 {
		return
	}

	for topic, current := range currentOffsets {
		last, exists := tc.lastOffsets[topic]
		if !exists {
			continue
		}
		delta := current - last
		if delta < 0 {
			log.Printf("[TopicsPanelCollector] отрицательная дельта для топика %s: %d, установлена в 0", topic, delta)
			delta = 0
		}
		rate := float64(delta) / elapsed
		// Не умножаем, не округляем – оставляем как есть
		point := TopicsPanelPoint{
			Time:      now.Format("15:04:05"),
			Timestamp: now.UnixMilli(),
			Topic:     topic,
			Value:     rate,
		}
		tc.storage.addPoint(topic, point)
		log.Printf("[TopicsPanelCollector] topic=%s, delta=%d, rate=%.2f msg/s", topic, delta, rate)
	}

	tc.lastOffsets = currentOffsets
	tc.lastTime = now
}

func (tc *TopicsPanelCollector) fetchTopicOffsets() (map[string]int64, error) {
	config := kafkaConfigForBootstrap(tc.bootstrap)
	config.Version = sarama.V2_8_0_0

	client, err := sarama.NewClient([]string{tc.bootstrap}, config)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	if err = client.RefreshMetadata(); err != nil {
		log.Printf("RefreshMetadata error: %v", err)
	}

	topics, err := client.Topics()
	if err != nil {
		return nil, err
	}

	result := make(map[string]int64)
	for _, topic := range topics {
		partitions, err := client.Partitions(topic)
		if err != nil {
			continue
		}
		var sum int64
		for _, p := range partitions {
			latest, err := client.GetOffset(topic, p, sarama.OffsetNewest)
			if err != nil {
				continue
			}
			sum += latest
		}
		result[topic] = sum
	}
	log.Printf("[fetchTopicOffsets] найдено %d топиков", len(result))
	return result, nil
}

func (tc *TopicsPanelCollector) GetPoints() []TopicsPanelPoint {
	all := tc.storage.getAllPoints()
	// Защита от отрицательных значений
	for i := range all {
		if all[i].Value < 0 {
			all[i].Value = 0
		}
	}
	return all
}

var (
	currentTopicsCollector *TopicsPanelCollector
	topicsCollectorMu      sync.RWMutex
)

func ensureTopicsCollectorForBootstrap(bootstrap string) {
	topicsCollectorMu.Lock()
	defer topicsCollectorMu.Unlock()
	if currentTopicsCollector != nil && currentTopicsCollector.bootstrap == bootstrap {
		return
	}
	if currentTopicsCollector != nil {
		currentTopicsCollector.Stop()
	}
	log.Printf("[TopicsPanelCollector] создаём сборщик для bootstrap: %s", bootstrap)
	// 10 секунд × 8640 точек = 24 часа истории в памяти.
	currentTopicsCollector = NewTopicsPanelCollector(bootstrap, 8640, 10*time.Second)
	currentTopicsCollector.Start()
}

// GetTopicsPanelHandler – обработчик API
func GetTopicsPanelHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	if bootstrap == "" {
		sendJSONError(w, "Bootstrap server not provided", http.StatusBadRequest)
		return
	}

	ensureTopicsCollectorForBootstrap(bootstrap)

	topicsCollectorMu.RLock()
	collector := currentTopicsCollector
	topicsCollectorMu.RUnlock()

	if collector == nil {
		sendJSONError(w, "Сборщик метрик для топиков не инициализирован", http.StatusInternalServerError)
		return
	}

	from, to := metricRange(r)
	allPoints := collector.GetPoints()
	points := make([]TopicsPanelPoint, 0, len(allPoints))
	for _, point := range allPoints {
		stamp := time.UnixMilli(point.Timestamp)
		if point.Timestamp == 0 || (!stamp.Before(from) && !stamp.After(to)) {
			points = append(points, point)
		}
	}
	response := TopicsPanelResponse{Points: points}
	log.Printf("[GetTopicsPanelHandler] возвращаем %d точек", len(points))
	_ = json.NewEncoder(w).Encode(response)
}
