package main

import (
	"context"
	"errors"
	"testing"

	"github.com/IBM/sarama"
)

type dashboardGroupStub struct {
	names       map[string]string
	listErr     error
	described   bool
	description []*sarama.GroupDescription
}

func (s *dashboardGroupStub) ListConsumerGroups() (map[string]string, error) {
	return s.names, s.listErr
}

func (s *dashboardGroupStub) DescribeConsumerGroups([]string) ([]*sarama.GroupDescription, error) {
	s.described = true
	return s.description, nil
}

func TestDashboardConsumerGroupsKeepsPartialList(t *testing.T) {
	admin := &dashboardGroupStub{
		names:   map[string]string{"known": "consumer"},
		listErr: context.DeadlineExceeded,
	}
	got, err := listDashboardConsumerGroups(admin)
	if err != nil || !got.Partial || admin.described || len(got.Groups) != 1 ||
		got.Groups[0] != (DashboardConsumerGroup{Name: "known", State: "Unknown"}) {
		t.Fatalf("Частичный ответ: %+v, описания запрошены: %t, ошибка: %v", got, admin.described, err)
	}
}

func TestDashboardConsumerGroupsDistinguishesEmptyListFromError(t *testing.T) {
	admin := &dashboardGroupStub{}
	got, err := listDashboardConsumerGroups(admin)
	if err != nil || got.Groups == nil || len(got.Groups) != 0 || got.Partial || admin.described {
		t.Fatalf("Пустой список: %+v, ошибка: %v", got, err)
	}
	admin.listErr = context.DeadlineExceeded
	if _, err := listDashboardConsumerGroups(admin); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Ожидалась ошибка списка, получено %v", err)
	}
}

func TestDashboardConsumerGroupsKeepsActualState(t *testing.T) {
	admin := &dashboardGroupStub{
		names:       map[string]string{"known": "consumer"},
		description: []*sarama.GroupDescription{{GroupId: "known", State: "Stable"}},
	}
	got, err := listDashboardConsumerGroups(admin)
	if err != nil || got.Partial || !admin.described || len(got.Groups) != 1 || got.Groups[0].State != "Stable" {
		t.Fatalf("Полный ответ: %+v, ошибка: %v", got, err)
	}
}
