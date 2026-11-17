package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"

	"github.com/IBM/sarama"
)

type fakeListingBroker struct {
	id       int32
	opened   bool
	calls    *atomic.Int32
	response *sarama.ListGroupsResponse
	err      error
}

func (b *fakeListingBroker) ID() int32    { return b.id }
func (b *fakeListingBroker) Addr() string { return fmt.Sprintf("broker-%d.test:9092", b.id) }
func (b *fakeListingBroker) Open(*sarama.Config) error {
	b.opened = true
	return nil
}
func (b *fakeListingBroker) ListGroups(*sarama.ListGroupsRequest) (*sarama.ListGroupsResponse, error) {
	b.calls.Add(1)
	if !b.opened {
		return nil, sarama.ErrNotConnected
	}
	return b.response, b.err
}

func TestBrokerStatusesFromExistingListGroups(t *testing.T) {
	var calls atomic.Int32
	targets := make([]groupListingBroker, 7)
	rows := make([]HealthBrokerInfo, 7)
	for i := range targets {
		b := &fakeListingBroker{id: int32(i), calls: &calls, response: &sarama.ListGroupsResponse{}}
		targets[i] = b
		rows[i] = HealthBrokerInfo{ID: b.ID(), Address: b.Addr()}
	}
	online, offline := applyBrokerStatuses(rows, nil)
	if online != 0 || offline != 0 || rows[0].BrokerStatus != brokerUnknown {
		t.Fatal("Без результата все брокеры должны оставаться неизвестными")
	}
	_, statuses, err := listGroupsByBroker(targets, sarama.NewConfig())
	online, offline = applyBrokerStatuses(rows, statuses)
	if err != nil || calls.Load() != 7 || online != 7 || offline != 0 {
		t.Fatalf("Запросов: %d, online: %d, offline: %d, ошибка: %v", calls.Load(), online, offline, err)
	}
	wrongAddress := []HealthBrokerInfo{{ID: rows[0].ID, Address: "changed.test:9092"}}
	if n, e := applyBrokerStatuses(wrongAddress, statuses); n != 0 || e != 0 || wrongAddress[0].BrokerStatus != brokerUnknown {
		t.Fatal("Старое наблюдение не должно применяться к новому адресу брокера")
	}
	for _, row := range rows {
		if !row.Online || row.BrokerStatus != brokerOnline {
			t.Fatalf("Нет подтверждения для брокера %d", row.ID)
		}
	}
}

func TestObservedBrokerStatus(t *testing.T) {
	for _, tc := range []struct {
		name     string
		response *sarama.ListGroupsResponse
		err      error
		want     brokerStatus
	}{
		{"успех", &sarama.ListGroupsResponse{}, nil, brokerOnline},
		{"отказ dial", nil, &net.OpError{Op: "dial", Err: syscall.ECONNREFUSED}, brokerOffline},
		{"таймаут", nil, context.DeadlineExceeded, brokerUnknown},
		{"отмена", nil, context.Canceled, brokerUnknown},
		{"TLS", nil, x509.UnknownAuthorityError{}, brokerUnknown},
		{"mTLS", nil, tls.AlertError(42), brokerUnknown},
		{"SASL", nil, sarama.ErrSASLAuthenticationFailed, brokerUnknown},
		{"ACL", &sarama.ListGroupsResponse{Err: sarama.ErrClusterAuthorizationFailed}, nil, brokerUnknown},
		{"нет сокета", nil, sarama.ErrNotConnected, brokerUnknown},
		{"иная ошибка", nil, errors.New("неоднозначный отказ"), brokerUnknown},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if status := observedBrokerStatus(tc.response, tc.err); status != tc.want {
				t.Fatalf("Статус %s, ожидался %s", status, tc.want)
			}
		})
	}
}

func TestObservedWinsockConnectionRefusal(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Проверка кода Winsock")
	}
	err := &net.OpError{Op: "dial", Err: syscall.Errno(10061)}
	if got := observedBrokerStatus(nil, err); got != brokerOffline {
		t.Fatalf("Подтверждённый отказ Winsock: %s", got)
	}
}

func TestBrokerEventsKeepLastConfirmedStatus(t *testing.T) {
	collector := NewEventCollector("events.test:9092", 10, 0)
	endpoint := brokerEndpoint{1, "events.test:9092"}
	observe := func(revision uint64, status brokerStatus) {
		collector.observeBrokerStatuses("12:00:00", revision, map[brokerEndpoint]brokerStatus{endpoint: status})
	}
	observe(1, brokerOnline)
	observe(1, brokerUnknown)
	observe(1, brokerOnline)
	if got := len(collector.buffer.GetAll()); got != 0 {
		t.Fatalf("Ложные события: %d", got)
	}
	observe(1, brokerOffline)
	observe(1, brokerUnknown)
	observe(1, brokerOnline)
	if got := len(collector.buffer.GetAll()); got != 2 {
		t.Fatalf("Ожидались подтверждённый отказ и восстановление, получено %d", got)
	}
	observe(2, brokerOffline)
	if got := len(collector.buffer.GetAll()); got != 2 {
		t.Fatalf("Переход между разными профилями создал событие: %d", got)
	}
}

func TestBrokerStatusProfileRevision(t *testing.T) {
	const bootstrap = "profile-a.test:9092, profile-b.test:9092"
	register := func(body string) uint64 {
		req := httptest.NewRequest(http.MethodPost, "/api/clusters/config", strings.NewReader(body))
		rec := httptest.NewRecorder()
		registerKafkaConfigHandler(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("Ответ регистрации: %d", rec.Code)
		}
		_, revision := kafkaAuthProfileSnapshot(bootstrap)
		return revision
	}
	plain := `{"brokers":"profile-a.test:9092, profile-b.test:9092","authType":"PLAINTEXT"}`
	sasl := `{"brokers":"profile-a.test:9092, profile-b.test:9092","authType":"SASL_PLAIN","username":"test-user","password":"test-value"}`
	first := register(plain)
	if again := register(plain); first != again {
		t.Fatal("Повторная регистрация не должна сбрасывать состояние")
	}
	second := register(sasl)
	config, revision := kafkaConfigAndRevision(bootstrap)
	if second == first || second != revision || !config.Net.TLS.Enable || !config.Net.SASL.Enable ||
		len(parseBootstrapServers(bootstrap)) != 2 {
		t.Fatal("Изменение профиля и несколько bootstrap не сохранились")
	}
}

func TestBrokerStatusesKeepPartialResults(t *testing.T) {
	var calls atomic.Int32
	targets := make([]groupListingBroker, 7)
	rows := make([]HealthBrokerInfo, 7)
	for i := range targets {
		b := &fakeListingBroker{id: int32(i), calls: &calls, response: &sarama.ListGroupsResponse{}}
		if i == 6 {
			b.response = nil
			b.err = &net.OpError{Op: "dial", Err: syscall.ECONNREFUSED}
		}
		targets[i] = b
		rows[i] = HealthBrokerInfo{ID: b.ID(), Address: b.Addr()}
	}
	_, statuses, err := listGroupsByBroker(targets, sarama.NewConfig())
	online, offline := applyBrokerStatuses(rows, statuses)
	if !errors.Is(err, syscall.ECONNREFUSED) || calls.Load() != 7 || online != 6 || offline != 1 {
		t.Fatalf("Запросов: %d, online: %d, offline: %d, ошибка: %v", calls.Load(), online, offline, err)
	}
}
