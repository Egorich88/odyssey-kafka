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

/**
 * @file main.go
 * @project Odyssey new 4.2.36
 * @description Регистрация REST API приложения.
 * @changes Добавлены маршруты проверки версии, запуска обновления и потока прогресса.
 */

// Package main — точка входа бэкенда для Kafka System Control.
// Предоставляет REST API для управления топиками, сообщениями,
// а также метриками для дашборда.
package main

import (
	"encoding/json" // ← добавлен импорт
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/IBM/sarama"
)

// =============================================================================
// Вспомогательные функции
// =============================================================================

// getBootstrapFromRequest возвращает адрес Kafka-брокера из заголовка или переменной окружения.
func getBootstrapFromRequest(r *http.Request) string {
	if bootstrap := r.Header.Get("X-Kafka-Bootstrap"); bootstrap != "" {
		return bootstrap
	}
	if env := os.Getenv("KAFKA_BOOTSTRAP_SERVERS"); env != "" {
		return env
	}
	return "localhost:9092"
}

// createAdminClient создаёт административный клиент Sarama для управления кластером.
func createAdminClient(bootstrap string) (sarama.ClusterAdmin, error) {
	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0
	return sarama.NewClusterAdmin([]string{bootstrap}, config)
}

// sendJSONError отправляет JSON-ответ с сообщением об ошибке и HTTP-статусом.
func sendJSONError(w http.ResponseWriter, msg string, status int) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// =============================================================================
// Основная функция — настройка маршрутов и запуск сервера
// =============================================================================

func main() {
	// ----- Группа маршрутов для управления топиками (обработчики в topics.go) -----
	http.HandleFunc("/api/topics", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getTopicsHandler(w, r)
		case http.MethodPost:
			createTopicHandler(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/api/topics/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/topics/" {
			getTopicsHandler(w, r)
			return
		}
		switch r.Method {
		case http.MethodDelete:
			deleteTopicHandler(w, r)
		case http.MethodPatch:
			if strings.Contains(r.URL.Path, "/config") {
				updateTopicConfigHandler(w, r)
			} else {
				w.WriteHeader(http.StatusNotFound)
			}
		case http.MethodGet:
			if strings.Contains(r.URL.Path, "/messages") {
				getMessagesHandler(w, r) // обработчик из search.go
			} else if strings.Contains(r.URL.Path, "/partitions") {
				getPartitionsHandler(w, r) // обработчик из search.go
			} else {
				getTopicDetailHandler(w, r)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	// =============================================================================
	// Маршруты Consumer Groups
	// =============================================================================
	//
	// Эти маршруты используются отдельной страницей:
	//
	//     frontend/src/pages/consumer-groups/
	//
	// GET /api/consumer-groups
	//     Возвращает список Consumer Groups текущего Kafka-кластера.
	//
	// GET /api/consumer-groups/{group}
	//     Возвращает подробную информацию выбранной Consumer Group:
	//
	//     • состояние группы;
	//     • участников;
	//     • offsets;
	//     • topics;
	//     • lag;
	//     • дополнительную информацию для панели Details.
	//
	// В дальнейшем здесь же будут добавлены:
	//
	//     POST   /api/consumer-groups/{group}/offsets/reset
	//     DELETE /api/consumer-groups/{group}
	//     POST   /api/consumer-groups/{group}/pause
	//     POST   /api/consumer-groups/{group}/resume
	//
	// ВАЖНО:
	// Consumer Groups используют тот же механизм выбора Kafka-кластера,
	// что и остальные API — заголовок X-Kafka-Bootstrap.
	// =============================================================================

	http.HandleFunc("/api/consumer-groups", func(w http.ResponseWriter, r *http.Request) {

		switch r.Method {

		case http.MethodGet:

			getConsumerGroupsHandler(w, r)

		default:

			w.WriteHeader(http.StatusMethodNotAllowed)

		}

	})

	http.HandleFunc("/api/consumer-groups/", func(w http.ResponseWriter, r *http.Request) {

		// Убираем начальную часть:
		//
		// /api/consumer-groups/
		//
		// чтобы получить имя Consumer Group.

		groupName := strings.TrimPrefix(
			r.URL.Path,
			"/api/consumer-groups/",
		)

		if groupName == "" {

			w.WriteHeader(http.StatusNotFound)

			return

		}

		switch r.Method {

		case http.MethodGet:

			getConsumerGroupDetailsHandler(w, r)

		default:

			w.WriteHeader(http.StatusMethodNotAllowed)

		}

	})
	// ----- Маршруты для Overview (метрики кластера) -----
	http.HandleFunc("/api/overview", getDashboardOverviewHandler)
	http.HandleFunc("/api/overview/health", getDashboardHealthHandler)
	http.HandleFunc("/api/overview/brokers", getDashboardBrokersHandler)
	http.HandleFunc("/api/overview/brokers-detailed", GetBrokersHandler)
	http.HandleFunc("/api/overview/consumer-groups", getDashboardConsumerGroupsHandler)
	http.HandleFunc("/api/overview/partitions", getDashboardPartitionsHandler)
	http.HandleFunc("/api/overview/throughput", getDashboardThroughputHandler)
	http.HandleFunc("/api/overview/topics-throughput", GetTopicsPanelHandler)
	http.HandleFunc("/api/overview/messages-total", getDashboardMessagesTotalHandler)
	http.HandleFunc("/api/overview/consumer-lag", GetConsumerLagHandler)
	http.HandleFunc("/api/overview/events", getDashboardEventsHandler)
	http.HandleFunc("/api/overview/certificates", getCertificatesHandler)

	// Проверка актуальной версии и серверный поток прогресса обновления.
	http.HandleFunc("/api/version/check", checkVersionHandler)
	http.HandleFunc("/api/version/update", updateStartHandler)
	http.HandleFunc("/api/version/update/events", updateEventsHandler)

	// ----- Health check для кластера -----
	// Эндпоинт проверяет доступность Kafka-брокера.
	// Фронтенд вызывает его, чтобы отобразить цветной индикатор (зелёный/красный/серый)
	// в выпадающем списке кластеров.
	http.HandleFunc("/api/clusters/health", getClusterHealthHandler)

	port := ":8080"
	log.Printf("Server running on %s", port)
	log.Fatal(http.ListenAndServe(port, nil))
}
