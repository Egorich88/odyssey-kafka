package main

import (
	"reflect"
	"testing"
)

// Проверяем разбор одного и нескольких bootstrap-адресов Kafka.
func TestParseBootstrapServers(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  []string
	}{
		{"один брокер", "192.168.56.11:9092", []string{"192.168.56.11:9092"}},
		{"несколько брокеров", "192.168.56.11:9092,192.168.56.12:9092,192.168.56.13:9092", []string{"192.168.56.11:9092", "192.168.56.12:9092", "192.168.56.13:9092"}},
		{"пробелы и пустые элементы", "  kafka-01:9092 , , kafka-02:9092  ", []string{"kafka-01:9092", "kafka-02:9092"}},
		{"пустая строка", "", []string{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := parseBootstrapServers(tc.input); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("parseBootstrapServers(%q) = %v, ожидалось %v", tc.input, got, tc.want)
			}
		})
	}
}
