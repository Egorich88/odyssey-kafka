package main

import (
	"sync"
	"time"

	"github.com/IBM/sarama"
)

const (
	brokerDiskPollInterval = 30 * time.Second
	brokerDiskSampleTTL    = 90 * time.Second
	brokerDiskInitialWait  = 300 * time.Millisecond
	brokerDiskMaxProfiles  = 64
	brokerDiskParallelism  = 4
)

type brokerDiskUsage struct {
	usedGiB  float64
	totalGiB float64
}

type brokerDiskProfile struct {
	bootstrap string
	revision  uint64
}

type brokerDiskSample struct {
	at    time.Time
	disks map[brokerEndpoint]brokerDiskUsage
}

type brokerDiskReader interface {
	DescribeLogDirs(*sarama.DescribeLogDirsRequest) (*sarama.DescribeLogDirsResponse, error)
}

type brokerDiskCache struct {
	mu      sync.Mutex
	running bool
	samples map[brokerDiskProfile]brokerDiskSample
}

var overviewBrokerDisks = brokerDiskCache{samples: make(map[brokerDiskProfile]brokerDiskSample)}

func (c *brokerDiskCache) get(profile brokerDiskProfile, now time.Time) map[brokerEndpoint]brokerDiskUsage {
	c.mu.Lock()
	defer c.mu.Unlock()
	sample, ok := c.samples[profile]
	if !ok || now.Sub(sample.at) >= brokerDiskSampleTTL {
		return nil
	}
	return sample.disks
}

func (c *brokerDiskCache) refresh(profile brokerDiskProfile, client sarama.Client, statuses map[brokerEndpoint]brokerStatus, closeClient func() error) <-chan struct{} {
	targets := make(map[brokerEndpoint]brokerDiskReader)
	for _, broker := range client.Brokers() {
		endpoint := brokerEndpoint{broker.ID(), broker.Addr()}
		if statuses[endpoint] == brokerOnline {
			targets[endpoint] = broker
		}
	}
	if len(targets) == 0 {
		return nil
	}
	c.mu.Lock()
	now := time.Now()
	if last, exists := c.samples[profile]; c.running || (exists && now.Sub(last.at) < brokerDiskPollInterval) {
		c.mu.Unlock()
		return nil
	}
	c.running = true
	c.mu.Unlock()
	done := make(chan struct{})

	// Продлеваем жизнь существующего клиента, пока читаются данные дисков.
	go func() {
		defer close(done)
		disks := readBrokerDisks(targets)
		_ = closeClient()

		c.mu.Lock()
		defer c.mu.Unlock()
		if _, exists := c.samples[profile]; !exists && len(c.samples) >= brokerDiskMaxProfiles {
			var oldest brokerDiskProfile
			var oldestAt time.Time
			for key, sample := range c.samples {
				if oldestAt.IsZero() || sample.at.Before(oldestAt) {
					oldest = key
					oldestAt = sample.at
				}
			}
			delete(c.samples, oldest)
		}
		c.samples[profile] = brokerDiskSample{at: now, disks: disks}
		c.running = false
	}()
	return done
}

func readBrokerDisks(targets map[brokerEndpoint]brokerDiskReader) map[brokerEndpoint]brokerDiskUsage {
	disks := make(map[brokerEndpoint]brokerDiskUsage, len(targets))
	var wg sync.WaitGroup
	var mu sync.Mutex
	slots := make(chan struct{}, brokerDiskParallelism)
	for endpoint, broker := range targets {
		slots <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-slots }()
			// Пустой массив тем Sarama кодирует как запрос всех партиций.
			// Элемент без партиций запрашивает только сведения о каталогах.
			response, err := broker.DescribeLogDirs(&sarama.DescribeLogDirsRequest{
				Version:        4,
				DescribeTopics: []sarama.DescribeLogDirsRequestTopic{{PartitionIDs: []int32{}}},
			})
			if err != nil {
				return
			}
			if disk, ok := mostUsedKafkaDisk(response); ok {
				mu.Lock()
				disks[endpoint] = disk
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return disks
}

func mostUsedKafkaDisk(response *sarama.DescribeLogDirsResponse) (brokerDiskUsage, bool) {
	if response == nil || response.Version < 4 || response.ErrorCode != sarama.ErrNoError {
		return brokerDiskUsage{}, false
	}

	var disk brokerDiskUsage
	maxFraction := -1.0
	for _, dir := range response.LogDirs {
		if dir.ErrorCode != sarama.ErrNoError || dir.TotalBytes <= 0 ||
			dir.UsableBytes < 0 || dir.UsableBytes > dir.TotalBytes {
			continue
		}
		used := float64(dir.TotalBytes - dir.UsableBytes)
		total := float64(dir.TotalBytes)
		fraction := used / total
		// Каталоги могут находиться на одном томе, поэтому ёмкости не складываем.
		if fraction > maxFraction || (fraction == maxFraction && total > disk.totalGiB*(1<<30)) {
			maxFraction = fraction
			disk = brokerDiskUsage{usedGiB: used / (1 << 30), totalGiB: total / (1 << 30)}
		}
	}
	return disk, maxFraction >= 0
}
