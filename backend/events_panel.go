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
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/IBM/sarama"
)

// =============================================================================
// Модель события
// =============================================================================

type EventLevel string

const (
	INFO  EventLevel = "INFO"
	WARN  EventLevel = "WARN"
	ERROR EventLevel = "ERROR"
)

type DashboardEvent struct {
	Time    string     `json:"time"`
	Level   EventLevel `json:"level"`
	Group   string     `json:"group,omitempty"`
	Topic   string     `json:"topic,omitempty"`
	Status  string     `json:"status,omitempty"`
	Message string     `json:"message"`
	Source  string     `json:"source"`
}

type EventsResponse struct {
	Events []DashboardEvent `json:"events"`
}

// =============================================================================
// Кольцевой буфер
// =============================================================================

type eventRingBuffer struct {
	events []DashboardEvent
	idx    int
	full   bool
	mu     sync.RWMutex
}

func newEventRingBuffer(size int) *eventRingBuffer {
	return &eventRingBuffer{
		events: make([]DashboardEvent, size),
		idx:    0,
		full:   false,
	}
}

func (b *eventRingBuffer) Add(e DashboardEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.events[b.idx] = e
	b.idx = (b.idx + 1) % len(b.events)
	if b.idx == 0 {
		b.full = true
	}
}

// GetAll возвращает все хранящиеся события в обратном хронологическом порядке (сначала новые).
func (b *eventRingBuffer) GetAll() []DashboardEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()
	n := len(b.events)
	if !b.full {
		n = b.idx
	}
	if n == 0 {
		return []DashboardEvent{}
	}
	start := b.idx - n
	if start < 0 {
		start += len(b.events)
	}
	result := make([]DashboardEvent, 0, n)
	for i := 0; i < n; i++ {
		idx := (start + i) % len(b.events)
		if b.events[idx].Time != "" {
			result = append(result, b.events[idx])
		}
	}

	// Разворачиваем результат, чтобы новые события были сверху
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return result
}

// =============================================================================
// Сборщик событий
// =============================================================================

type EventCollector struct {
	bootstrap        string
	buffer           *eventRingBuffer
	stopChan         chan struct{}
	interval         time.Duration
	mu               sync.Mutex
	prevLags         map[string]int64
	prevGroupTopics  map[string]string
	prevTopicOffsets map[string]int64
	prevTopics       map[string]int16
	prevBrokers      map[int32]bool
	prevTopicConfigs map[string]map[string]string
	brokerAddresses  map[int32]string

	zeroSpeedNotified map[string]bool
	hadTraffic        map[string]bool

	initialized bool
}

func NewEventCollector(bootstrap string, bufferSize int, interval time.Duration) *EventCollector {
	return &EventCollector{
		bootstrap:         bootstrap,
		buffer:            newEventRingBuffer(bufferSize),
		stopChan:          make(chan struct{}),
		interval:          interval,
		prevLags:          make(map[string]int64),
		prevGroupTopics:   make(map[string]string),
		prevTopicOffsets:  make(map[string]int64),
		prevTopics:        make(map[string]int16),
		prevBrokers:       make(map[int32]bool),
		prevTopicConfigs:  make(map[string]map[string]string),
		brokerAddresses:   make(map[int32]string),
		zeroSpeedNotified: make(map[string]bool),
		hadTraffic:        make(map[string]bool),
		initialized:       false,
	}
}

func (ec *EventCollector) Start() {
	go func() {
		ticker := time.NewTicker(ec.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				ec.collect()
			case <-ec.stopChan:
				log.Printf("[EventCollector] остановлен для bootstrap %s", ec.bootstrap)
				return
			}
		}
	}()
}

func (ec *EventCollector) Stop() {
	close(ec.stopChan)
}

func (ec *EventCollector) getBrokerAddress(id int32) string {
	if addr, ok := ec.brokerAddresses[id]; ok {
		return addr
	}
	config := kafkaConfigForBootstrap(ec.bootstrap)
	config.Version = sarama.V2_8_0_0
	client, err := sarama.NewClient([]string{ec.bootstrap}, config)
	if err != nil {
		return fmt.Sprintf("broker-%d", id)
	}
	defer client.Close()
	for _, broker := range client.Brokers() {
		if broker.ID() == id {
			addr := broker.Addr()
			ec.brokerAddresses[id] = addr
			return addr
		}
	}
	return fmt.Sprintf("broker-%d", id)
}

func (ec *EventCollector) getControllerAddress() string {
	config := kafkaConfigForBootstrap(ec.bootstrap)
	config.Version = sarama.V2_8_0_0
	client, err := sarama.NewClient([]string{ec.bootstrap}, config)
	if err != nil {
		return "controller"
	}
	defer client.Close()
	controller, err := client.Controller()
	if err != nil {
		return "controller"
	}
	return ec.getBrokerAddress(controller.ID())
}

func (ec *EventCollector) addEvent(timeStr string, level EventLevel, msg, source string) {
	e := DashboardEvent{
		Time:    timeStr,
		Level:   level,
		Message: msg,
		Source:  source,
	}
	ec.buffer.Add(e)
	log.Printf("[Event] %s %s %s (source: %s)", timeStr, level, msg, source)
}

// addConsumerGroupEvent добавляет событие с явной связкой Group + Topic + State.
func (ec *EventCollector) addConsumerGroupEvent(
	timeStr string,
	level EventLevel,
	group string,
	topic string,
	status string,
	msg string,
	source string,
) {
	e := DashboardEvent{
		Time:    timeStr,
		Level:   level,
		Group:   group,
		Topic:   topic,
		Status:  status,
		Message: msg,
		Source:  source,
	}
	ec.buffer.Add(e)
	log.Printf("[Event] %s %s group=%s topic=%s status=%s %s",
		timeStr, level, group, topic, status, msg)
}

func (ec *EventCollector) initState() {
	log.Printf("[EventCollector] инициализация состояния (без генерации событий)")

	ec.hadTraffic = make(map[string]bool)
	ec.zeroSpeedNotified = make(map[string]bool)

	if topics, err := ec.fetchTopicMetadata(); err == nil {
		for topic, repl := range topics {
			ec.prevTopics[topic] = repl
		}
		log.Printf("[EventCollector] инициализировано %d топиков", len(topics))
	}

	if offsets, err := ec.fetchTopicOffsets(); err == nil {
		for topic, offset := range offsets {
			ec.prevTopicOffsets[topic] = offset
			if offset > 0 {
				ec.hadTraffic[topic] = true
			}
		}
		log.Printf("[EventCollector] инициализировано %d топиков для оффсетов", len(offsets))
	}

	if configs, err := ec.fetchTopicConfigs(); err == nil {
		for topic, cfg := range configs {
			ec.prevTopicConfigs[topic] = cfg
		}
		log.Printf("[EventCollector] инициализировано %d топиков для конфигов", len(configs))
	}

	if brokers, err := ec.fetchBrokerStatus(); err == nil {
		for id, status := range brokers {
			ec.prevBrokers[id] = status
		}
		log.Printf("[EventCollector] инициализировано %d брокеров", len(brokers))
	}

	if lags, err := ec.fetchConsumerLags(); err == nil {
		for group, lag := range lags {
			ec.prevLags[group] = lag
		}
		log.Printf("[EventCollector] инициализировано %d групп потребителей", len(lags))
	}

	// Сохраняем исходные состояния Group + Topic без генерации событий.
	if rows, err := collectConsumerLagRows(ec.bootstrap); err == nil {
		for _, row := range rows {
			ec.prevGroupTopics[row.Group+"\\x00"+row.Topic] = row.Status
		}
		log.Printf("[EventCollector] инициализировано %d связок Group + Topic", len(rows))
	}

	ec.initialized = true
}

func (ec *EventCollector) collect() {
	ec.mu.Lock()
	defer ec.mu.Unlock()

	if !ec.initialized {
		ec.initState()
		return
	}

	now := time.Now()
	timeStr := now.Format("15:04:05")
	source := ec.getControllerAddress()

	// ---- 1. Топики ----
	currentTopics, err := ec.fetchTopicMetadata()
	if err != nil {
		log.Printf("[EventCollector] ошибка получения метаданных топиков: %v", err)
	} else {
		for topic, repl := range currentTopics {
			prevRepl, exists := ec.prevTopics[topic]
			if !exists {
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Топик создан: %s (репликация: %d, партиций: %d)", topic, repl, ec.getTopicPartitions(topic)), source)
				delete(ec.zeroSpeedNotified, topic)
				delete(ec.hadTraffic, topic)
			} else if repl != prevRepl {
				ec.addEvent(timeStr, WARN, fmt.Sprintf("Изменена репликация топика %s: %d -> %d", topic, prevRepl, repl), source)
			}
			ec.prevTopics[topic] = repl
		}

		for topic := range ec.prevTopics {
			if _, exists := currentTopics[topic]; !exists {
				ec.addEvent(timeStr, WARN, fmt.Sprintf("Топик удалён: %s", topic), source)
				delete(ec.prevTopics, topic)
				delete(ec.zeroSpeedNotified, topic)
				delete(ec.hadTraffic, topic)
			}
		}
	}

	// ---- 2. Конфигурации топиков (теперь отслеживаем ВСЕ изменения) ----
	currentConfigs, err := ec.fetchTopicConfigs()
	if err != nil {
		log.Printf("[EventCollector] ошибка получения конфигов топиков: %v", err)
	} else {
		for topic, configs := range currentConfigs {
			prevConfigs, exists := ec.prevTopicConfigs[topic]
			if !exists {
				ec.prevTopicConfigs[topic] = configs
				continue
			}

			// Проверяем все изменения конфигураций
			for key, value := range configs {
				if prevVal, ok := prevConfigs[key]; ok && prevVal != value {
					ec.addEvent(timeStr, WARN, fmt.Sprintf("Изменена конфигурация топика %s: %s = %s (было %s)", topic, key, value, prevVal), source)
				}
			}

			// Проверяем удалённые параметры (были в prev, нет в current)
			for key, prevVal := range prevConfigs {
				if _, ok := configs[key]; !ok {
					ec.addEvent(timeStr, WARN, fmt.Sprintf("Удалён параметр конфигурации топика %s: %s (было %s)", topic, key, prevVal), source)
				}
			}

			ec.prevTopicConfigs[topic] = configs
		}
	}

	// ---- 3. Скорость записи ----
	currentOffsets, err := ec.fetchTopicOffsets()
	if err != nil {
		log.Printf("[EventCollector] ошибка получения оффсетов: %v", err)
	} else {
		for topic, current := range currentOffsets {
			prev, exists := ec.prevTopicOffsets[topic]
			if !exists {
				ec.prevTopicOffsets[topic] = current
				if current > 0 {
					ec.hadTraffic[topic] = true
				}
				continue
			}
			delta := current - prev
			if delta < 0 {
				delta = 0
			}

			if delta > 0 {
				ec.hadTraffic[topic] = true
			}

			if delta == 0 && prev > 0 {
				if ec.hadTraffic[topic] && !ec.zeroSpeedNotified[topic] {
					ec.addEvent(timeStr, WARN, fmt.Sprintf("Скорость записи в топик %s упала до нуля", topic), source)
					ec.zeroSpeedNotified[topic] = true
				}
			} else if delta > 0 && ec.zeroSpeedNotified[topic] {
				ec.zeroSpeedNotified[topic] = false
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Скорость записи в топик %s восстановлена", topic), source)
			}

			ec.prevTopicOffsets[topic] = current
		}
	}

	// ---- 4. Lag ----
	currentLags, err := ec.fetchConsumerLags()
	if err != nil {
		log.Printf("[EventCollector] ошибка получения lag: %v", err)
	} else {
		for group, lag := range currentLags {
			prev, exists := ec.prevLags[group]
			if !exists {
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Обнаружена новая группа потребителей: %s (lag: %d)", group, lag), source)
				ec.prevLags[group] = lag
				continue
			}

			diff := lag - prev
			if diff > 0 {
				ec.addEvent(timeStr, ERROR, fmt.Sprintf("Увеличилось отставание потребителя %s: %d -> %d", group, prev, lag), source)
			} else if diff < 0 && lag == 0 {
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Отставание потребителя %s полностью устранено (было %d)", group, prev), source)
			} else if diff < 0 && lag > 0 && lag < 10 {
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Отставание потребителя %s значительно снизилось: %d -> %d", group, prev, lag), source)
			}
			ec.prevLags[group] = lag
		}

		for group := range ec.prevLags {
			if _, exists := currentLags[group]; !exists {
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Группа потребителей %s удалена", group), source)
				delete(ec.prevLags, group)
			}
		}
	}

	// ---- 5. Состояния Consumer Groups ----
	if rows, rowsErr := collectConsumerLagRows(ec.bootstrap); rowsErr == nil {
		seen := make(map[string]bool)

		for _, row := range rows {
			key := row.Group + "\\x00" + row.Topic
			seen[key] = true

			previousStatus, exists := ec.prevGroupTopics[key]
			if !exists {
				ec.prevGroupTopics[key] = row.Status
				continue
			}

			if previousStatus != row.Status {
				level := INFO
				switch row.Status {
				case "Empty", "Dead":
					level = ERROR
				case "Rebalancing":
					level = WARN
				}

				message := fmt.Sprintf(
					"Группа %s (%s) перешла из состояния %s в %s",
					row.Group, row.Topic, previousStatus, row.Status,
				)

				ec.addConsumerGroupEvent(
					timeStr,
					level,
					row.Group,
					row.Topic,
					row.Status,
					message,
					source,
				)
			}

			ec.prevGroupTopics[key] = row.Status
		}

		for key := range ec.prevGroupTopics {
			if !seen[key] {
				delete(ec.prevGroupTopics, key)
			}
		}
	} else {
		log.Printf("[EventCollector] ошибка получения состояний Consumer Groups: %v", rowsErr)
	}

	// ---- 6. Доступность брокеров ----
	currentBrokers, err := ec.fetchBrokerStatus()
	if err != nil {
		log.Printf("[EventCollector] ошибка получения статуса брокеров: %v", err)
	} else {
		for id, available := range currentBrokers {
			prevAvailable, exists := ec.prevBrokers[id]
			if !exists {
				ec.prevBrokers[id] = available
				continue
			}
			if !available && prevAvailable {
				ec.addEvent(timeStr, ERROR, fmt.Sprintf("Брокер %s недоступен", ec.getBrokerAddress(id)), ec.getBrokerAddress(id))
			} else if available && !prevAvailable {
				ec.addEvent(timeStr, INFO, fmt.Sprintf("Брокер %s восстановлен", ec.getBrokerAddress(id)), ec.getBrokerAddress(id))
			}
			ec.prevBrokers[id] = available
		}
	}
}

func (ec *EventCollector) getTopicPartitions(topic string) int32 {
	config := kafkaConfigForBootstrap(ec.bootstrap)
	config.Version = sarama.V2_8_0_0
	client, err := sarama.NewClient([]string{ec.bootstrap}, config)
	if err != nil {
		return 0
	}
	defer client.Close()
	partitions, err := client.Partitions(topic)
	if err != nil {
		return 0
	}
	return int32(len(partitions))
}

// --- Вспомогательные методы ---

func (ec *EventCollector) fetchConsumerLags() (map[string]int64, error) {
	admin, err := createAdminClient(ec.bootstrap)
	if err != nil {
		return nil, err
	}
	defer admin.Close()

	config := kafkaConfigForBootstrap(ec.bootstrap)
	config.Version = sarama.V2_8_0_0
	client, err := sarama.NewClient([]string{ec.bootstrap}, config)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	groupsMap, err := admin.ListConsumerGroups()
	if err != nil {
		return nil, err
	}

	result := make(map[string]int64)
	for groupName := range groupsMap {
		offsets, err := admin.ListConsumerGroupOffsets(groupName, nil)
		if err != nil {
			continue
		}
		var totalLag int64
		for topic, partitions := range offsets.Blocks {
			for partition, block := range partitions {
				latestOffset, err := client.GetOffset(topic, partition, sarama.OffsetNewest)
				if err != nil {
					continue
				}
				lag := latestOffset - block.Offset
				if lag > 0 {
					totalLag += lag
				}
			}
		}
		result[groupName] = totalLag
	}
	return result, nil
}

func (ec *EventCollector) fetchTopicOffsets() (map[string]int64, error) {
	config := kafkaConfigForBootstrap(ec.bootstrap)
	config.Version = sarama.V2_8_0_0
	client, err := sarama.NewClient([]string{ec.bootstrap}, config)
	if err != nil {
		return nil, err
	}
	defer client.Close()

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
	return result, nil
}

func (ec *EventCollector) fetchTopicMetadata() (map[string]int16, error) {
	admin, err := createAdminClient(ec.bootstrap)
	if err != nil {
		return nil, err
	}
	defer admin.Close()

	topicsMap, err := admin.ListTopics()
	if err != nil {
		return nil, err
	}
	result := make(map[string]int16)
	for name, metadata := range topicsMap {
		result[name] = metadata.ReplicationFactor
	}
	return result, nil
}

func (ec *EventCollector) fetchBrokerStatus() (map[int32]bool, error) {
	config := kafkaConfigForBootstrap(ec.bootstrap)
	config.Version = sarama.V2_8_0_0
	config.Net.DialTimeout = 2 * time.Second
	client, err := sarama.NewClient([]string{ec.bootstrap}, config)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	brokers := client.Brokers()
	result := make(map[int32]bool)
	for _, b := range brokers {
		ec.brokerAddresses[b.ID()] = b.Addr()
		connected, err := b.Connected()
		if err != nil {
			result[b.ID()] = false
		} else {
			result[b.ID()] = connected
		}
	}
	return result, nil
}

func (ec *EventCollector) fetchTopicConfigs() (map[string]map[string]string, error) {
	admin, err := createAdminClient(ec.bootstrap)
	if err != nil {
		return nil, err
	}
	defer admin.Close()

	topics, err := admin.ListTopics()
	if err != nil {
		return nil, err
	}
	result := make(map[string]map[string]string)
	for topic := range topics {
		cfgResource := sarama.ConfigResource{Type: sarama.TopicResource, Name: topic}
		resp, err := admin.DescribeConfig(cfgResource)
		if err != nil {
			continue
		}
		cfgMap := make(map[string]string)
		for _, entry := range resp {
			cfgMap[entry.Name] = entry.Value
		}
		if len(cfgMap) > 0 {
			result[topic] = cfgMap
		}
	}
	return result, nil
}

func (ec *EventCollector) GetEvents() []DashboardEvent {
	return ec.buffer.GetAll()
}

// =============================================================================
// Глобальное управление
// =============================================================================

var (
	currentEventCollector *EventCollector
	eventCollectorMu      sync.RWMutex
)

func ensureEventCollectorForBootstrap(bootstrap string) {
	eventCollectorMu.Lock()
	defer eventCollectorMu.Unlock()
	if currentEventCollector != nil && currentEventCollector.bootstrap == bootstrap {
		return
	}
	if currentEventCollector != nil {
		currentEventCollector.Stop()
	}
	log.Printf("[EventCollector] создаём сборщик для bootstrap: %s", bootstrap)
	currentEventCollector = NewEventCollector(bootstrap, 50, 10*time.Second)
	currentEventCollector.Start()
}

func getDashboardEventsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	bootstrap := getBootstrapFromRequest(r)
	if bootstrap == "" {
		sendJSONError(w, "Bootstrap server not provided", http.StatusBadRequest)
		return
	}

	ensureEventCollectorForBootstrap(bootstrap)

	eventCollectorMu.RLock()
	collector := currentEventCollector
	eventCollectorMu.RUnlock()

	if collector == nil {
		sendJSONError(w, "Сборщик событий не инициализирован", http.StatusInternalServerError)
		return
	}

	events := collector.GetEvents()
	response := EventsResponse{Events: events}
	_ = json.NewEncoder(w).Encode(response)
}
