package main

import (
	"context"
	"errors"
	"net"
	"testing"
)

func TestKafkaPolicyLocalhostRequiresExplicitIPv4AndIPv6Permission(t *testing.T) {
	for _, test := range []struct {
		name, networks string
		allowed        bool
	}{
		{"only-vms", "192.168.56.11/32", false},
		{"only-ipv4", "192.168.56.11/32,127.0.0.1/32", false},
		{"explicit-localhost", "192.168.56.11/32,127.0.0.1/32,::1/128", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			p, err := newKafkaAddressPolicy(test.networks, "9092,9094")
			if err != nil {
				t.Fatal(err)
			}
			p.lookup = func(context.Context, string) ([]net.IPAddr, error) {
				return []net.IPAddr{{IP: net.ParseIP("::1")}, {IP: net.ParseIP("127.0.0.1")}}, nil
			}
			for _, port := range []string{"9092", "9094"} {
				calls := 0
				p.dial = func(_ context.Context, _ string, address string) (net.Conn, error) {
					calls++
					if address != "[::1]:"+port && address != "127.0.0.1:"+port {
						t.Error("адрес не закреплён")
					}
					return nil, errors.New("синтетический отказ, без сетевого соединения")
				}
				_, _ = p.DialContext(context.Background(), "tcp", "localhost:"+port)
				if test.allowed && calls != 2 {
					t.Fatal("разрешённые localhost-адреса не проверены")
				}
				if !test.allowed && calls != 0 {
					t.Fatal("DNS обошёл политику")
				}
			}
		})
	}
}

func TestKafkaPolicyLocalhostPermissionDoesNotAllowOtherDestinations(t *testing.T) {
	p, err := newKafkaAddressPolicy("192.168.56.11/32,127.0.0.1/32,::1/128", "9092,9094")
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	p.dial = func(context.Context, string, string) (net.Conn, error) { calls++; return nil, nil }
	for _, address := range []string{"127.0.0.2:9092", "[::2]:9094", "127.0.0.1:8080", "169.254.169.254:9092", "192.168.56.12:9092"} {
		if _, err := p.DialContext(context.Background(), "tcp", address); err == nil {
			t.Fatal("запрещённый endpoint разрешён")
		}
	}
	p.lookup = func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}, {IP: net.ParseIP("192.0.2.1")}}, nil
	}
	if _, err := p.DialContext(context.Background(), "tcp", "advertised.test:9092"); err == nil {
		t.Fatal("смешанный DNS принят")
	}
	if calls != 0 {
		t.Fatal("запрещённый запрос дошёл до транспорта")
	}
}
