package main

import (
	"context"
	"errors"
	"net"
	"strconv"
	"strings"
	"time"
)

var errKafkaAddress = errors.New("адрес Kafka запрещён серверной политикой")

type kafkaAddressPolicy struct {
	networks []*net.IPNet
	ports    map[string]bool
	lookup   func(context.Context, string) ([]net.IPAddr, error)
	dial     func(context.Context, string, string) (net.Conn, error)
}

func newKafkaAddressPolicy(networks, ports string) (*kafkaAddressPolicy, error) {
	p := &kafkaAddressPolicy{ports: make(map[string]bool), lookup: net.DefaultResolver.LookupIPAddr, dial: (&net.Dialer{Timeout: 5 * time.Second}).DialContext}
	for _, cidr := range strings.Split(networks, ",") {
		if strings.TrimSpace(cidr) == "" {
			continue
		}
		_, network, err := net.ParseCIDR(strings.TrimSpace(cidr))
		if err != nil {
			return nil, errKafkaAddress
		}
		p.networks = append(p.networks, network)
	}
	for _, port := range strings.Split(ports, ",") {
		port = strings.TrimSpace(port)
		if port == "" {
			continue
		}
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return nil, errKafkaAddress
		}
		p.ports[strconv.Itoa(n)] = true
	}
	return p, nil
}

func (p *kafkaAddressPolicy) allowsIP(ip net.IP) bool {
	if p == nil || ip.IsUnspecified() || ip.IsMulticast() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return false
	}
	for _, network := range p.networks {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func (p *kafkaAddressPolicy) validateEndpoint(address string) error {
	host, port, err := net.SplitHostPort(address)
	if p == nil || err != nil || host == "" || !p.ports[port] || strings.ContainsAny(host, "%/@\\ \t\r\n") {
		return errKafkaAddress
	}
	if ip := net.ParseIP(host); ip != nil && !p.allowsIP(ip) {
		return errKafkaAddress
	}
	if len(p.networks) == 0 {
		return errKafkaAddress
	}
	return nil
}

func (p *kafkaAddressPolicy) validateBootstrap(bootstrap string) error {
	parts := strings.Split(bootstrap, ",")
	if len(parts) > 32 {
		return errKafkaAddress
	}
	for _, part := range parts {
		if p.validateEndpoint(strings.TrimSpace(part)) != nil {
			return errKafkaAddress
		}
	}
	return nil
}

func (p *kafkaAddressPolicy) Dial(network, address string) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return p.DialContext(ctx, network, address)
}

// Проверяем и закрепляем фактический IP при каждом соединении, в том числе
// для advertised endpoints. Повторного разрешения имени в Dial нет.
func (p *kafkaAddressPolicy) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return nil, errKafkaAddress
	}
	if p.validateEndpoint(address) != nil {
		return nil, errKafkaAddress
	}
	host, port, _ := net.SplitHostPort(address)
	ips, err := p.lookup(ctx, host)
	if err != nil || len(ips) == 0 || len(ips) > 32 {
		return nil, errKafkaAddress
	}
	for _, ip := range ips {
		if !p.allowsIP(ip.IP) || ip.Zone != "" {
			return nil, errKafkaAddress
		}
	}
	allRefused := true
	var lastRefused error
	for _, ip := range ips {
		conn, err := p.dial(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		if observedBrokerStatus(nil, err) != brokerOffline {
			allRefused = false
		} else {
			lastRefused = err
		}
		if ctx.Err() != nil {
			allRefused = false
			break
		}
	}
	if allRefused && lastRefused != nil {
		return nil, lastRefused
	}
	return nil, errors.New("не удалось подключиться к разрешённому адресу Kafka")
}
