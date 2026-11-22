package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testControllerQuorum(cluster string, leader, epoch int32) *controllerQuorumSnapshot {
	return &controllerQuorumSnapshot{ClusterID: cluster, LeaderID: leader, Epoch: epoch, VoterIDs: []int32{1, 2, 3}, Source: "describe_quorum"}
}

func TestControllerQuorumRoles(t *testing.T) {
	q := testControllerQuorum("A", 2, 5)
	for id, want := range map[int32]string{1: "standby", 2: "active", 3: "standby", 4: "broker"} {
		if got := q.role("A", id); got != want {
			t.Fatalf("node %d: %s != %s", id, got, want)
		}
	}
	if q.role("B", 2) != "unknown" || (*controllerQuorumSnapshot)(nil).role("A", 2) != "unknown" {
		t.Fatal("смешаны кластеры или неизвестные данные")
	}
	q.LeaderID = 8
	if q.role("A", 8) != "unknown" {
		t.Fatal("лидер вне voters")
	}
	q.LeaderID = 2
	q.VoterIDs = []int32{1, 2, 2}
	if q.role("A", 2) != "unknown" {
		t.Fatal("дублирующий node.id")
	}
}

func TestControllerQuorumCacheElectionAndIsolation(t *testing.T) {
	c := controllerQuorumCache{entries: make(map[string]*controllerQuorumEntry)}
	ctx := context.Background()
	key := "profile:1\x00A"
	current := testControllerQuorum("A", 1, 3)
	calls := 0
	read := func() (*controllerQuorumSnapshot, error) { calls++; return current, nil }
	if c.get(ctx, key, read).LeaderID != 1 || c.get(ctx, key, read).LeaderID != 1 || calls != 1 {
		t.Fatal("TTL не соблюдён")
	}
	c.entries[key].at = time.Now().Add(-controllerQuorumTTL)
	current = testControllerQuorum("A", 3, 4)
	if c.get(ctx, key, read).LeaderID != 3 {
		t.Fatal("переизбрание не подтверждено")
	}
	c.entries[key].at = time.Now().Add(-controllerQuorumTTL)
	current = testControllerQuorum("A", 2, 3)
	if c.get(ctx, key, read) != nil {
		t.Fatal("принят старый epoch")
	}
	c.entries[key].at = time.Now().Add(-controllerQuorumTTL)
	if c.get(ctx, key, func() (*controllerQuorumSnapshot, error) { return nil, errors.New("unavailable") }) != nil {
		t.Fatal("ошибка превратилась в новую роль")
	}
	for _, isolated := range []string{"profile:2\x00A", "other:1\x00A", "profile:1\x00B"} {
		if c.get(ctx, isolated, read) == nil {
			t.Fatal("смешаны профиль, ревизия или кластер")
		}
	}
}

func TestControllerQuorumCacheSingleFlight(t *testing.T) {
	c := controllerQuorumCache{entries: make(map[string]*controllerQuorumEntry)}
	var calls atomic.Int32
	start, ready := make(chan struct{}), make(chan struct{})
	read := func() (*controllerQuorumSnapshot, error) {
		calls.Add(1)
		close(start)
		<-ready
		return testControllerQuorum("A", 1, 1), nil
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if c.get(context.Background(), "A", read) == nil {
				t.Error("нет снимка")
			}
		}()
	}
	<-start
	close(ready)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("созданы параллельные проверки")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if c.get(ctx, "cancelled", func() (*controllerQuorumSnapshot, error) {
		t.Fatal("отменённый запрос выполнен")
		return nil, nil
	}) != nil {
		t.Fatal("отменённый снимок")
	}
}

func quorumResponse(leader, epoch int32, voters, observers []int32) []byte {
	b := qInt16(nil, 0)
	b = append(b, 2)
	b = qCompactString(b, "__cluster_metadata")
	b = append(b, 2)
	b = qInt32(b, 0)
	b = qInt16(b, 0)
	b = qInt32(b, leader)
	b = qInt32(b, epoch)
	b = append(b, make([]byte, 8)...)
	for _, ids := range [][]int32{voters, observers} {
		b = append(b, byte(len(ids)+1))
		for _, id := range ids {
			b = qInt32(b, id)
			b = append(b, make([]byte, 8)...)
			b = append(b, 0)
		}
	}
	return append(b, 0, 0, 0)
}
func TestControllerQuorumDecoder(t *testing.T) {
	b := quorumResponse(2, 5, []int32{1, 2, 3}, []int32{4})
	q, err := decodeControllerQuorum(b, "A")
	if err != nil || q.role("A", 2) != "active" || q.role("A", 4) != "broker" {
		t.Fatal("некорректный разбор кворума")
	}
	for n := 0; n < len(b); n++ {
		if _, err := decodeControllerQuorum(b[:n], "A"); err == nil {
			t.Fatalf("принят обрезанный ответ %d", n)
		}
	}
	for _, bad := range [][]byte{quorumResponse(-1, 5, []int32{1, 2, 3}, nil), quorumResponse(2, -1, []int32{1, 2, 3}, nil), quorumResponse(2, 5, []int32{1, 2, 2}, nil), {0, 0, 255, 255, 255, 255, 127}} {
		if _, err := decodeControllerQuorum(bad, "A"); err == nil {
			t.Fatal("невалидный кворум принят")
		}
	}
}

func TestControllerQuorumSaturatedSlotsRespectBudget(t *testing.T) {
	for i := 0; i < cap(controllerQuorumSlots); i++ {
		controllerQuorumSlots <- struct{}{}
	}
	defer func() {
		for i := 0; i < cap(controllerQuorumSlots); i++ {
			<-controllerQuorumSlots
		}
	}()
	c := controllerQuorumCache{entries: make(map[string]*controllerQuorumEntry)}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	started := time.Now()
	q := c.get(ctx, "waiting", func() (*controllerQuorumSnapshot, error) {
		t.Fatal("проверка стартовала без свободного слота")
		return nil, nil
	})
	if q != nil || time.Since(started) > time.Second {
		t.Fatal("очередь не соблюдает бюджет")
	}
}
