package main

import (
	"errors"
	"net"
	"runtime"
	"sync"
	"syscall"

	"github.com/IBM/sarama"
)

type brokerStatus string

const (
	brokerUnknown brokerStatus = "unknown"
	brokerOnline  brokerStatus = "online"
	brokerOffline brokerStatus = "offline"
)

type brokerEndpoint struct {
	id      int32
	address string
}

type groupListingBroker interface {
	ID() int32
	Addr() string
	Open(*sarama.Config) error
	ListGroups(*sarama.ListGroupsRequest) (*sarama.ListGroupsResponse, error)
}

// Повторяет существующее создание Admin Client, сохраняя доступ к его брокерам.
func newBrokerStatusAdmin(bootstrap string, withDisk bool) (sarama.ClusterAdmin, sarama.Client, uint64, error) {
	config, revision := kafkaConfigAndRevision(bootstrap)
	if withDisk {
		// Sarama требует этот предел для DescribeLogDirs v4 и использует
		// ApiVersions для согласования доступных версий запросов.
		config.Version = sarama.V3_3_0_0
	}
	client, err := sarama.NewClient(kafkaProfileBrokers(bootstrap), config)
	if err != nil {
		return nil, nil, revision, err
	}
	admin, err := sarama.NewClusterAdminFromClient(client)
	if err != nil {
		_ = client.Close()
		return nil, nil, revision, err
	}
	return admin, client, revision, nil
}

func listObservedGroups(client sarama.Client) (map[string]string, map[brokerEndpoint]brokerStatus, error) {
	brokers := client.Brokers()
	targets := make([]groupListingBroker, len(brokers))
	for i, broker := range brokers {
		targets[i] = broker
	}
	return listGroupsByBroker(targets, client.Config())
}

func listGroupsVersion(version sarama.KafkaVersion) int16 {
	switch {
	case version.IsAtLeast(sarama.V3_8_0_0):
		return 5
	case version.IsAtLeast(sarama.V2_6_0_0):
		return 4
	case version.IsAtLeast(sarama.V2_4_0_0):
		return 3
	case version.IsAtLeast(sarama.V2_0_0_0):
		return 2
	case version.IsAtLeast(sarama.V0_11_0_0):
		return 1
	default:
		return 0
	}
}

func observedBrokerStatus(response *sarama.ListGroupsResponse, err error) brokerStatus {
	if err == nil && response != nil && response.Err == sarama.ErrNoError {
		return brokerOnline
	}
	var op *net.OpError
	if errors.As(err, &op) && op.Op == "dial" {
		// Winsock возвращает собственный код отказа TCP-подключения.
		const wsaConnectionRefused = syscall.Errno(10061)
		if errors.Is(op.Err, syscall.ECONNREFUSED) ||
			(runtime.GOOS == "windows" && errors.Is(op.Err, wsaConnectionRefused)) {
			return brokerOffline
		}
	}
	return brokerUnknown
}

// Заменяет тот же обход ListConsumerGroups в Sarama. Каждому известному
// брокеру отправляется один штатный ListGroups, дополнительных проб нет.
func listGroupsByBroker(brokers []groupListingBroker, config *sarama.Config) (map[string]string, map[brokerEndpoint]brokerStatus, error) {
	version := listGroupsVersion(config.Version)
	type result struct {
		endpoint brokerEndpoint
		response *sarama.ListGroupsResponse
		err      error
	}
	results := make(chan result, len(brokers))
	var wg sync.WaitGroup
	for _, broker := range brokers {
		wg.Add(1)
		go func(broker groupListingBroker) {
			defer wg.Done()
			_ = broker.Open(config)
			response, err := broker.ListGroups(&sarama.ListGroupsRequest{Version: version})
			results <- result{brokerEndpoint{broker.ID(), broker.Addr()}, response, err}
		}(broker)
	}
	wg.Wait()
	close(results)

	groups := make(map[string]string)
	statuses := make(map[brokerEndpoint]brokerStatus, len(brokers))
	var firstErr error
	for item := range results {
		statuses[item.endpoint] = observedBrokerStatus(item.response, item.err)
		if item.err != nil && firstErr == nil {
			firstErr = item.err
		}
		if item.response != nil {
			for group, protocol := range item.response.Groups {
				groups[group] = protocol
			}
		}
	}
	return groups, statuses, firstErr
}

func applyBrokerStatuses(brokers []HealthBrokerInfo, statuses map[brokerEndpoint]brokerStatus) (online, offline int) {
	for i := range brokers {
		broker := &brokers[i]
		status := statuses[brokerEndpoint{broker.ID, broker.Address}]
		if status == "" {
			status = brokerUnknown
		}
		broker.BrokerStatus = status
		broker.Online = status == brokerOnline
		switch status {
		case brokerOnline:
			online++
		case brokerOffline:
			offline++
		}
	}
	return online, offline
}
