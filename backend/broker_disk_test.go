package main

import (
	"testing"
	"time"

	"github.com/IBM/sarama"
)

type brokerDiskStub struct {
	request  *sarama.DescribeLogDirsRequest
	response *sarama.DescribeLogDirsResponse
}

func (stub *brokerDiskStub) DescribeLogDirs(request *sarama.DescribeLogDirsRequest) (*sarama.DescribeLogDirsResponse, error) {
	stub.request = request
	return stub.response, nil
}

func TestBrokerDiskRequestsOnlyDirectoriesAndKeepsBrokerIdentity(t *testing.T) {
	const gib = 1 << 30
	first := brokerEndpoint{id: 1, address: "broker-a.test:9093"}
	second := brokerEndpoint{id: 2, address: "broker-b.test:9093"}
	a := &brokerDiskStub{response: &sarama.DescribeLogDirsResponse{Version: 4, LogDirs: []sarama.DescribeLogDirsResponseDirMetadata{
		{TotalBytes: 100 * gib, UsableBytes: 50 * gib},
		{TotalBytes: 10 * gib, UsableBytes: 2 * gib},
		{TotalBytes: 200 * gib, UsableBytes: 0, ErrorCode: sarama.ErrKafkaStorageError},
	}}}
	b := &brokerDiskStub{response: &sarama.DescribeLogDirsResponse{Version: 4, LogDirs: []sarama.DescribeLogDirsResponseDirMetadata{
		{TotalBytes: 100 * gib, UsableBytes: 100 * gib},
	}}}
	disks := readBrokerDisks(map[brokerEndpoint]brokerDiskReader{first: a, second: b})
	if disks[first] != (brokerDiskUsage{8, 10}) || disks[second] != (brokerDiskUsage{0, 100}) {
		t.Fatalf("Данные по брокерам: %+v", disks)
	}
	for _, stub := range []*brokerDiskStub{a, b} {
		request := stub.request
		if request == nil || request.Version != 4 || len(request.DescribeTopics) != 1 || len(request.DescribeTopics[0].PartitionIDs) != 0 {
			t.Fatalf("Запрошены лишние данные: %+v", request)
		}
	}
}

func TestBrokerDiskRejectsUnavailableCapacity(t *testing.T) {
	for _, response := range []*sarama.DescribeLogDirsResponse{
		nil,
		{Version: 3, LogDirs: []sarama.DescribeLogDirsResponseDirMetadata{{TotalBytes: 10}}},
		{Version: 4, ErrorCode: sarama.ErrClusterAuthorizationFailed},
		{Version: 4, LogDirs: []sarama.DescribeLogDirsResponseDirMetadata{{TotalBytes: -1, UsableBytes: -1}}},
	} {
		if disk, ok := mostUsedKafkaDisk(response); ok {
			t.Fatalf("Недоступный диск ошибочно принят: %+v", disk)
		}
	}
}

func TestBrokerDiskCacheIsScopedToProfileAndExpires(t *testing.T) {
	now := time.Now()
	profile := brokerDiskProfile{bootstrap: "a.test:9093,b.test:9093", revision: 1}
	cache := brokerDiskCache{samples: map[brokerDiskProfile]brokerDiskSample{
		profile: {at: now, disks: map[brokerEndpoint]brokerDiskUsage{{id: 1}: {usedGiB: 1, totalGiB: 10}}},
	}}
	if len(cache.get(profile, now)) != 1 {
		t.Fatal("Свежий снимок отсутствует")
	}
	if cache.get(brokerDiskProfile{bootstrap: profile.bootstrap, revision: 2}, now) != nil ||
		cache.get(profile, now.Add(brokerDiskSampleTTL)) != nil {
		t.Fatal("Кеш отдал снимок старого профиля или просроченный снимок")
	}
}
