package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
)

func TestServerUpdateHTTPRemainsForbidden(t *testing.T) {
	var executions atomic.Int32
	originalExecutor := executeUpdateCommand
	executeUpdateCommand = func(string) { executions.Add(1) }
	t.Cleanup(func() { executeUpdateCommand = originalExecutor })

	// Только синтетические данные: проверяем, что запрет не раскрывает историю
	// и не меняет состояние уже выполняющегося обновления.
	updateState.Lock()
	oldRunning, oldHistory, oldClients := updateState.running, updateState.history, updateState.clients
	history := []updateEvent{{Progress: 42, Stage: "test-stage", Message: "synthetic-private-output", Status: "running"}}
	updateState.running = true
	updateState.history = history
	updateState.clients = make(map[chan updateEvent]struct{})
	updateState.Unlock()
	t.Cleanup(func() {
		updateState.Lock()
		updateState.running, updateState.history, updateState.clients = oldRunning, oldHistory, oldClients
		updateState.Unlock()
	})

	routes := []struct {
		path, method string
		handler      http.HandlerFunc
	}{
		{"/api/version/update", http.MethodPost, updateStartHandler},
		{"/api/version/update/events", http.MethodGet, updateEventsHandler},
	}
	for _, route := range routes {
		for _, command := range []string{"", "synthetic-update-command"} {
			for _, permission := range []string{"", "false", "true", "TRUE", "1"} {
				for _, spoofOwner := range []bool{false, true} {
					t.Run(route.path+"/command="+command+"/permission="+permission+"/owner="+map[bool]string{false: "absent", true: "spoofed"}[spoofOwner], func(t *testing.T) {
						t.Setenv("ODYSSEY_UPDATE_COMMAND", command)
						t.Setenv("ODYSSEY_ALLOW_SERVER_UPDATE", permission)
						request := httptest.NewRequest(route.method, route.path, nil)
						request.RemoteAddr = "127.0.0.1:12345"
						if spoofOwner {
							request.Header.Set("Authorization", "Bearer synthetic-test-token")
							request.Header.Set("X-Odyssey-Owner", "true")
							request.Header.Set("X-Forwarded-For", "127.0.0.1")
							request.AddCookie(&http.Cookie{Name: "owner", Value: "true"})
						}
						response := httptest.NewRecorder()
						route.handler(response, request)
						if response.Code != http.StatusForbidden {
							t.Fatalf("Ожидался запрет 403, получен %d", response.Code)
						}
						if executions.Load() != 0 {
							t.Fatal("Запрещённый запрос вызвал исполнитель команды")
						}
						var body map[string]string
						if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body["error"] == "" {
							t.Fatal("Ожидалась безопасная JSON-ошибка")
						}
						if strings.Contains(response.Body.String(), "synthetic-") || strings.Contains(response.Body.String(), "test-stage") {
							t.Fatal("Запрет раскрыл команду, историю или данные запроса")
						}
						if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Content-Type") != "application/json; charset=utf-8" || response.Flushed {
							t.Fatal("Запрещённый ответ кэшируется или открывает поток SSE")
						}
						updateState.Lock()
						unchanged := updateState.running && reflect.DeepEqual(updateState.history, history) && len(updateState.clients) == 0
						updateState.Unlock()
						if !unchanged {
							t.Fatal("Запрещённый запрос изменил состояние обновления или создал подписку")
						}
					})
				}
			}
		}
	}
}

func TestUpdateHandlersRejectOtherMethods(t *testing.T) {
	var executions atomic.Int32
	originalExecutor := executeUpdateCommand
	executeUpdateCommand = func(string) { executions.Add(1) }
	t.Cleanup(func() { executeUpdateCommand = originalExecutor })
	t.Setenv("ODYSSEY_UPDATE_COMMAND", "synthetic-update-command")
	t.Setenv("ODYSSEY_ALLOW_SERVER_UPDATE", "true")
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodDelete, http.MethodOptions, http.MethodPatch} {
		response := httptest.NewRecorder()
		updateStartHandler(response, httptest.NewRequest(method, "/api/version/update", nil))
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatalf("Метод %s не запрещён", method)
		}
	}
	for _, method := range []string{http.MethodPost, http.MethodHead, http.MethodPut, http.MethodDelete, http.MethodOptions, http.MethodPatch} {
		response := httptest.NewRecorder()
		updateEventsHandler(response, httptest.NewRequest(method, "/api/version/update/events", nil))
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatalf("Метод %s открыл SSE", method)
		}
	}
	if executions.Load() != 0 {
		t.Fatal("Неподдерживаемый метод вызвал исполнитель")
	}
}

func TestForbiddenUpdateDoesNotStartWhenIdle(t *testing.T) {
	t.Setenv("ODYSSEY_UPDATE_COMMAND", "synthetic-update-command")
	t.Setenv("ODYSSEY_ALLOW_SERVER_UPDATE", "true")
	var executions atomic.Int32
	originalExecutor := executeUpdateCommand
	executeUpdateCommand = func(string) { executions.Add(1) }
	t.Cleanup(func() { executeUpdateCommand = originalExecutor })
	updateState.Lock()
	oldRunning, oldHistory := updateState.running, updateState.history
	updateState.running, updateState.history = false, nil
	updateState.Unlock()
	t.Cleanup(func() {
		updateState.Lock()
		updateState.running, updateState.history = oldRunning, oldHistory
		updateState.Unlock()
	})
	response := httptest.NewRecorder()
	updateStartHandler(response, httptest.NewRequest(http.MethodPost, "/api/version/update", nil))
	if response.Code != http.StatusForbidden || executions.Load() != 0 {
		t.Fatal("Незанятый механизм обновления допустил запрещённый запуск")
	}
	updateState.Lock()
	unchanged := !updateState.running && updateState.history == nil
	updateState.Unlock()
	if !unchanged {
		t.Fatal("Запрещённый запрос подготовил обновление к запуску")
	}
}

type updaterTestTransport func(*http.Request) (*http.Response, error)

func (transport updaterTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return transport(r)
}

func TestVersionCheckWorksWithServerUpdateDisabled(t *testing.T) {
	t.Setenv("ODYSSEY_VERSION", "4.3.2")
	t.Setenv("ODYSSEY_UPDATE_COMMAND", "synthetic-update-command")
	t.Setenv("ODYSSEY_ALLOW_SERVER_UPDATE", "false")
	var executions atomic.Int32
	originalExecutor := executeUpdateCommand
	executeUpdateCommand = func(string) { executions.Add(1) }
	t.Cleanup(func() { executeUpdateCommand = originalExecutor })
	originalTransport := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = originalTransport })
	requests := 0
	// Подставной транспорт не обращается ни к GitHub, ни к Kafka.
	http.DefaultTransport = updaterTestTransport(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Method != http.MethodGet || request.URL.String() != releaseAPIURL {
			t.Fatal("Неожиданный запрос проверки версии")
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"tag_name":"v4.3.3","html_url":"https://example.invalid/release"}`)), Header: make(http.Header)}, nil
	})
	response := httptest.NewRecorder()
	checkVersionHandler(response, httptest.NewRequest(http.MethodGet, "/api/version/check", nil))
	var result versionCheckResponse
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &result) != nil {
		t.Fatal("Проверка версии не вернула успешный JSON-ответ")
	}
	if !result.Checked || !result.UpdateAvailable || result.CurrentVersion != "4.3.2" || result.LatestVersion != "4.3.3" || requests != 1 {
		t.Fatalf("Нарушен контракт проверки версии: %+v", result)
	}
	if executions.Load() != 0 {
		t.Fatal("Проверка версии вызвала исполнитель обновления")
	}
}
