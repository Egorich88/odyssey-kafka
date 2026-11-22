package main

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/IBM/sarama"
)

const controllerQuorumTTL = 30 * time.Second

// Metadata.ControllerID в KRaft обозначает брокер для forwarding, а не Raft-лидера.
// Только DescribeQuorum(__cluster_metadata, 0) подтверждает роли контроллеров.
type controllerQuorumSnapshot struct {
	ClusterID string  `json:"clusterId"`
	LeaderID  int32   `json:"leaderId"`
	Epoch     int32   `json:"epoch"`
	VoterIDs  []int32 `json:"voterIds"`
	Source    string  `json:"source"`
}

func (q *controllerQuorumSnapshot) role(clusterID string, nodeID int32) string {
	if q == nil || clusterID == "" || clusterID != q.ClusterID || q.Source != "describe_quorum" || q.Epoch < 0 || q.LeaderID < 0 {
		return "unknown"
	}
	seen := make(map[int32]bool, len(q.VoterIDs))
	for _, id := range q.VoterIDs {
		if id < 0 || seen[id] {
			return "unknown"
		}
		seen[id] = true
	}
	if !seen[q.LeaderID] {
		return "unknown"
	}
	if nodeID == q.LeaderID {
		return "active"
	}
	if seen[nodeID] {
		return "standby"
	}
	return "broker"
}

type controllerQuorumEntry struct {
	at        time.Time
	value     *controllerQuorumSnapshot
	loading   chan struct{}
	epoch     int32
	leader    int32
	confirmed bool
}
type controllerQuorumCache struct {
	mu      sync.Mutex
	entries map[string]*controllerQuorumEntry
}

var overviewControllerQuorum = controllerQuorumCache{entries: make(map[string]*controllerQuorumEntry)}
var controllerQuorumSlots = make(chan struct{}, 4)

// Ключ включает серверный профиль с ревизией и фактический Cluster ID.
// Ошибки тоже ограничены TTL; параллельные HTTP-запросы делят одну проверку.
func (c *controllerQuorumCache) get(ctx context.Context, key string, read func() (*controllerQuorumSnapshot, error)) *controllerQuorumSnapshot {
	for {
		c.mu.Lock()
		e := c.entries[key]
		if e != nil && e.loading != nil {
			ready := e.loading
			c.mu.Unlock()
			select {
			case <-ready:
				continue
			case <-ctx.Done():
				return nil
			}
		}
		if e != nil && time.Since(e.at) < controllerQuorumTTL {
			c.mu.Unlock()
			return e.value
		}
		if len(c.entries) >= 64 {
			for k, entry := range c.entries {
				if entry.loading == nil {
					delete(c.entries, k)
					break
				}
			}
			if len(c.entries) >= 64 {
				c.mu.Unlock()
				return nil
			}
		}
		previous := e
		e = &controllerQuorumEntry{loading: make(chan struct{})}
		if previous != nil {
			e.epoch, e.leader, e.confirmed = previous.epoch, previous.leader, previous.confirmed
		}
		c.entries[key] = e
		c.mu.Unlock()
		var value *controllerQuorumSnapshot
		select {
		case controllerQuorumSlots <- struct{}{}:
			if ctx.Err() == nil {
				value, _ = read()
			}
			<-controllerQuorumSlots
		case <-ctx.Done():
		}
		if ctx.Err() != nil {
			value = nil
		}
		if value != nil {
			if e.confirmed && (value.Epoch < e.epoch || (value.Epoch == e.epoch && value.LeaderID != e.leader)) {
				value = nil
			} else {
				e.epoch, e.leader, e.confirmed = value.Epoch, value.LeaderID, true
			}
		}
		c.mu.Lock()
		e.value = value
		e.at = time.Now()
		close(e.loading)
		e.loading = nil
		c.mu.Unlock()
		return value
	}
}

func loadControllerQuorum(ctx context.Context, client interface{ Brokers() []*sarama.Broker }, profile string, config *sarama.Config) (string, *controllerQuorumSnapshot) {
	// Контекст ограничивает также ожидание single-flight и общего слота.
	// GetMetadata использует сетевые таймауты принадлежащего HTTP-запросу клиента Sarama.
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	brokers := client.Brokers()
	if len(brokers) == 0 || ctx.Err() != nil {
		return "", nil
	}
	// Выбор транспортного брокера не участвует в назначении роли.
	sort.Slice(brokers, func(i, j int) bool { return brokers[i].ID() < brokers[j].ID() })
	broker := brokers[0]
	if err := broker.Open(config); err != nil && err != sarama.ErrAlreadyConnected {
		return "", nil
	}
	metadata, err := broker.GetMetadata(&sarama.MetadataRequest{Version: 3, Topics: []string{}})
	if err != nil || metadata == nil || metadata.ClusterID == nil || *metadata.ClusterID == "" || ctx.Err() != nil {
		return "", nil
	}
	clusterID := *metadata.ClusterID
	value := overviewControllerQuorum.get(ctx, profile+"\x00"+clusterID, func() (*controllerQuorumSnapshot, error) {
		return readControllerQuorum(ctx, broker.Addr(), clusterID, config)
	})
	if _, revision := kafkaAuthProfileSnapshot(profile); revision == 0 {
		return clusterID, nil
	}
	return clusterID, value
}

var errControllerQuorum = errors.New("достоверные сведения о кворуме контроллеров недоступны")
