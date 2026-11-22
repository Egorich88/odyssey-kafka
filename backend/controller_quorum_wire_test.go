package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"errors"
	"io"
	"math/big"
	"net"
	"testing"
	"time"

	"github.com/IBM/sarama"
	"github.com/xdg-go/scram"
)

type quorumPipeDialer struct{ serve func(net.Conn) }

func (p quorumPipeDialer) Dial(network, address string) (net.Conn, error) {
	return p.DialContext(context.Background(), network, address)
}
func (p quorumPipeDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	a, b := net.Pipe()
	go p.serve(b)
	return a, nil
}

func quorumTestTLS(t *testing.T) (tls.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), DNSNames: []string{"broker.test"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth}}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(parsed)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, pool
}

// Сервер на net.Pipe не открывает TCP-сокеты и не использует настоящий Kafka.
func quorumTestServer(conn net.Conn, cluster, mechanism string, randomController int32, conversation *scram.ServerConversation) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	for {
		var length [4]byte
		if _, err := io.ReadFull(conn, length[:]); err != nil {
			return
		}
		size := binary.BigEndian.Uint32(length[:])
		if size > 1<<20 {
			return
		}
		request := make([]byte, size)
		if _, err := io.ReadFull(conn, request); err != nil {
			return
		}
		d := quorumDecoder{data: request}
		api, version, corr := d.i16(), d.i16(), d.i32()
		_ = d.str()
		if api == 55 {
			d.tags()
		}
		var body []byte
		switch api {
		case 17:
			if version != 1 || d.str() != mechanism {
				return
			}
			body = qInt16(nil, 0)
			body = qInt32(body, 1)
			body = qString(body, mechanism)
		case 36:
			if version != 1 {
				return
			}
			message := d.take(int(d.i32()))
			var answer string
			var err error
			if conversation != nil {
				answer, err = conversation.Step(string(message))
			} else if !bytes.Equal(message, []byte("\x00user\x00synthetic-password")) {
				err = errors.New("auth")
			}
			code := int16(0)
			if err != nil {
				code = 58
			}
			body = qInt16(nil, code)
			body = qInt16(body, -1)
			body = append(qInt32(body, int32(len(answer))), answer...)
			body = append(body, make([]byte, 8)...)
		case 3:
			if version != 3 || d.i32() != 0 {
				return
			}
			body = qInt32(nil, 0)
			body = qInt32(body, 0)
			body = qString(body, cluster)
			body = qInt32(body, randomController)
			body = qInt32(body, 0)
		case 55:
			if version != 0 || d.count() != 1 || d.compactString() != "__cluster_metadata" || d.count() != 1 || d.i32() != 0 {
				return
			}
			d.tags()
			d.tags()
			d.tags()
			if d.err || d.offset != len(request) {
				return
			}
			body = append([]byte{0}, quorumResponse(2, 5, []int32{1, 2, 3}, []int32{7})...)
		default:
			return
		}
		response := append(qInt32(nil, corr), body...)
		response = append(qInt32(nil, int32(len(response))), response...)
		if _, err := io.Copy(conn, bytes.NewReader(response)); err != nil {
			return
		}
	}
}

func TestControllerQuorumTransportAuthentication(t *testing.T) {
	for _, mode := range []string{"PLAINTEXT", "MTLS", "PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"} {
		t.Run(mode, func(t *testing.T) {
			cert, roots := quorumTestTLS(t)
			cfg := sarama.NewConfig()
			cfg.Net.Proxy.Enable = true
			var conversation *scram.ServerConversation
			if mode != "PLAINTEXT" {
				cfg.Net.TLS.Enable = true
				cfg.Net.TLS.Config = &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
			}
			mechanism := ""
			if mode == "MTLS" {
				cfg.Net.TLS.Config.Certificates = []tls.Certificate{cert}
			}
			if mode == "PLAIN" || mode == "SCRAM-SHA-256" || mode == "SCRAM-SHA-512" {
				mechanism = mode
				cfg.Net.SASL.Enable = true
				cfg.Net.SASL.Mechanism = sarama.SASLMechanism(mode)
				cfg.Net.SASL.User = "user"
				cfg.Net.SASL.Password = "synthetic-password"
				if mode != "PLAIN" {
					hash := scram.SHA256
					if mode == "SCRAM-SHA-512" {
						hash = scram.SHA512
					}
					cfg.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient { return &odysseySCRAMClient{hashGenerator: hash} }
					client, err := hash.NewClient("user", "synthetic-password", "")
					if err != nil {
						t.Fatal(err)
					}
					stored := client.GetStoredCredentials(scram.KeyFactors{Salt: "synthetic-salt", Iters: 4096})
					server, err := hash.NewServer(func(user string) (scram.StoredCredentials, error) {
						if user != "user" {
							return scram.StoredCredentials{}, errors.New("auth")
						}
						return stored, nil
					})
					if err != nil {
						t.Fatal(err)
					}
					conversation = server.NewConversation()
				}
			}
			cfg.Net.Proxy.Dialer = quorumPipeDialer{serve: func(conn net.Conn) {
				if cfg.Net.TLS.Enable {
					serverCfg := &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}
					if mode == "MTLS" {
						serverCfg.ClientAuth = tls.RequireAndVerifyClientCert
						serverCfg.ClientCAs = roots
					}
					conn = tls.Server(conn, serverCfg)
				}
				quorumTestServer(conn, "cluster-A", mechanism, 7, conversation)
			}}
			q, err := readControllerQuorum(context.Background(), "broker.test:9092", "cluster-A", cfg)
			if err != nil || q.role("cluster-A", 2) != "active" || q.role("cluster-A", 7) != "broker" {
				t.Fatalf("%s: %v", mode, err)
			}
		})
	}
}

func TestControllerQuorumTransportFailsClosed(t *testing.T) {
	cert, _ := quorumTestTLS(t)
	for _, failure := range []string{"cluster", "certificate", "sasl-without-tls", "timeout", "oversize", "cancel", "policy"} {
		t.Run(failure, func(t *testing.T) {
			cfg := sarama.NewConfig()
			cfg.Net.Proxy.Enable = true
			cfg.Net.Proxy.Dialer = quorumPipeDialer{serve: func(conn net.Conn) {
				if failure == "certificate" {
					conn = tls.Server(conn, &tls.Config{Certificates: []tls.Certificate{cert}})
				}
				if failure == "timeout" {
					defer conn.Close()
					var b [4096]byte
					for {
						if _, err := conn.Read(b[:]); err != nil {
							return
						}
					}
				}
				if failure == "oversize" {
					defer conn.Close()
					var b [4096]byte
					_, _ = conn.Read(b[:])
					_, _ = conn.Write(qInt32(nil, (1<<20)+1))
					return
				}
				quorumTestServer(conn, "other-cluster", "", 3, nil)
			}}
			if failure == "certificate" {
				cfg.Net.TLS.Enable = true
				cfg.Net.TLS.Config = &tls.Config{RootCAs: x509.NewCertPool(), MinVersion: tls.VersionTLS12}
			}
			if failure == "sasl-without-tls" {
				cfg.Net.SASL.Enable = true
			}
			if failure == "policy" {
				cfg.Net.Proxy.Dialer = (*kafkaAddressPolicy)(nil)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
			defer cancel()
			if failure == "cancel" {
				cancel()
			}
			if q, err := readControllerQuorum(ctx, "broker.test:9092", "cluster-A", cfg); q != nil || err != errControllerQuorum {
				t.Fatalf("небезопасный fallback: %v", err)
			}
		})
	}
}
