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
 * @file updater.go
 * @project Odyssey new 4.2.36
 * @description Проверка версии Odyssey и серверный поток прогресса обновления.
 * @changes Добавлены GitHub Releases API, SSE-события обновления и обработка ошибок.
 */

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	defaultOdysseyVersion = "4.2.37"
	releaseAPIURL         = "https://api.github.com/repos/Egorich88/odyssey-kafka/releases/latest"
)

type versionCheckResponse struct {
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion,omitempty"`
	UpdateAvailable bool   `json:"updateAvailable"`
	Checked         bool   `json:"checked"`
	Message         string `json:"message,omitempty"`
	ReleaseURL      string `json:"releaseUrl,omitempty"`
}

type updateEvent struct {
	Progress int    `json:"progress"`
	Stage    string `json:"stage"`
	Message  string `json:"message"`
	Status   string `json:"status"`
}

var updateState = struct {
	sync.Mutex
	running bool
	history []updateEvent
	clients map[chan updateEvent]struct{}
}{clients: make(map[chan updateEvent]struct{})}

func currentOdysseyVersion() string {
	if value := strings.TrimSpace(os.Getenv("ODYSSEY_VERSION")); value != "" {
		return strings.TrimPrefix(value, "v")
	}
	return defaultOdysseyVersion
}

func checkVersionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, releaseAPIURL, nil)
	if err != nil {
		sendJSONError(w, "Не удалось сформировать запрос к источнику релизов", http.StatusInternalServerError)
		return
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "Odyssey-Version-Checker")
	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
	if err != nil {
		_ = json.NewEncoder(w).Encode(versionCheckResponse{
			CurrentVersion: currentOdysseyVersion(),
			Checked:        false,
			Message:        "Источник обновлений временно недоступен: " + err.Error(),
		})
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_ = json.NewEncoder(w).Encode(versionCheckResponse{
			CurrentVersion: currentOdysseyVersion(),
			Checked:        false,
			Message:        fmt.Sprintf("Источник обновлений вернул HTTP %d", response.StatusCode),
		})
		return
	}

	var release struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil || release.TagName == "" {
		_ = json.NewEncoder(w).Encode(versionCheckResponse{
			CurrentVersion: currentOdysseyVersion(),
			Checked:        false,
			Message:        "Источник обновлений вернул некорректные сведения о релизе",
		})
		return
	}
	current := currentOdysseyVersion()
	latest := strings.TrimPrefix(release.TagName, "v")
	_ = json.NewEncoder(w).Encode(versionCheckResponse{
		CurrentVersion:  current,
		LatestVersion:   latest,
		UpdateAvailable: compareVersionStrings(latest, current) > 0,
		Checked:         true,
		Message:         versionStatusMessage(latest, current),
		ReleaseURL:      release.HTMLURL,
	})
}

func compareVersionStrings(left, right string) int {
	number := regexp.MustCompile(`\d+`)
	l := number.FindAllString(left, -1)
	r := number.FindAllString(right, -1)
	for index := 0; index < len(l) || index < len(r); index++ {
		var lv, rv int
		if index < len(l) {
			fmt.Sscanf(l[index], "%d", &lv)
		}
		if index < len(r) {
			fmt.Sscanf(r[index], "%d", &rv)
		}
		if lv > rv {
			return 1
		}
		if lv < rv {
			return -1
		}
	}
	return 0
}

func versionStatusMessage(latest, current string) string {
	if compareVersionStrings(latest, current) > 0 {
		return "Доступна новая версия"
	}
	return "Актуальная версия"
}

func updateStartHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	command := strings.TrimSpace(os.Getenv("ODYSSEY_UPDATE_COMMAND"))
	if command == "" {
		sendJSONError(w, "Автоматическое обновление не настроено на сервере. Укажите ODYSSEY_UPDATE_COMMAND для вашей среды развёртывания.", http.StatusNotImplemented)
		return
	}

	updateState.Lock()
	if updateState.running {
		updateState.Unlock()
		sendJSONError(w, "Обновление уже выполняется", http.StatusConflict)
		return
	}
	updateState.running = true
	updateState.history = nil
	updateState.Unlock()

	publishUpdate(updateEvent{Progress: 1, Stage: "Подготовка", Message: "Подготовка к запуску обновления", Status: "running"})
	go runUpdateCommand(command)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{"started": true, "eventsUrl": "/api/version/update/events"})
}

func runUpdateCommand(command string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		finishUpdateError("Не удалось открыть поток вывода команды обновления: " + err.Error())
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		finishUpdateError("Не удалось открыть поток ошибок команды обновления: " + err.Error())
		return
	}
	if err := cmd.Start(); err != nil {
		finishUpdateError("Не удалось запустить обновление: " + err.Error())
		return
	}

	var readers sync.WaitGroup
	readOutput := func(scanner *bufio.Scanner) {
		defer readers.Done()
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			progress := 10
			updateState.Lock()
			if len(updateState.history) > 0 {
				progress = updateState.history[len(updateState.history)-1].Progress
			}
			updateState.Unlock()
			// Если команда развёртывания печатает проценты, используем их.
			// Иначе показываем оценочный прогресс по сообщениям журнала.
			if match := regexp.MustCompile(`(\d{1,3})\s*%`).FindStringSubmatch(line); len(match) == 2 {
				fmt.Sscanf(match[1], "%d", &progress)
				if progress > 99 {
					progress = 99
				}
			} else if progress < 90 {
				progress += 5
			}
			publishUpdate(updateEvent{Progress: progress, Stage: "Обновление", Message: line, Status: "running"})
		}
	}
	readers.Add(2)
	go readOutput(bufio.NewScanner(stdout))
	go readOutput(bufio.NewScanner(stderr))
	waitErr := cmd.Wait()
	readers.Wait()
	if ctx.Err() != nil {
		finishUpdateError("Обновление прервано по тайм-ауту")
		return
	}
	if waitErr != nil {
		finishUpdateError("Команда обновления завершилась с ошибкой: " + waitErr.Error())
		return
	}
	publishUpdate(updateEvent{Progress: 100, Stage: "Завершено", Message: "Команда обновления завершена успешно. Для применения изменений может потребоваться перезапуск сервиса.", Status: "completed"})
	updateState.Lock()
	updateState.running = false
	updateState.Unlock()
}

func finishUpdateError(message string) {
	publishUpdate(updateEvent{Progress: 100, Stage: "Ошибка", Message: message, Status: "error"})
	updateState.Lock()
	updateState.running = false
	updateState.Unlock()
}

func publishUpdate(event updateEvent) {
	updateState.Lock()
	updateState.history = append(updateState.history, event)
	for client := range updateState.clients {
		select {
		case client <- event:
		default:
		}
	}
	updateState.Unlock()
}

func updateEventsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		sendJSONError(w, "Потоковая передача не поддерживается сервером", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	channel := make(chan updateEvent, 32)
	updateState.Lock()
	history := append([]updateEvent(nil), updateState.history...)
	updateState.clients[channel] = struct{}{}
	updateState.Unlock()
	defer func() {
		updateState.Lock()
		delete(updateState.clients, channel)
		close(channel)
		updateState.Unlock()
	}()

	send := func(event updateEvent) bool {
		payload, err := json.Marshal(event)
		if err != nil {
			return true
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	for _, event := range history {
		if !send(event) {
			return
		}
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case event, open := <-channel:
			if !open || !send(event) {
				return
			}
			if event.Status == "completed" || event.Status == "error" {
				return
			}
		case <-time.After(15 * time.Second):
			if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
