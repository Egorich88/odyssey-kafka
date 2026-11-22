package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/binary"
	"io"
	"net"
	"time"

	"github.com/IBM/sarama"
)

// В используемой Sarama нет DescribeQuorum. Этот ограниченный транспорт знает
// только Metadata v3, SASL handshake/authenticate и DescribeQuorum v0.
// Он использует готовые настройки профиля и обязательный серверный DialContext.
func readControllerQuorum(ctx context.Context, address, clusterID string, cfg *sarama.Config) (*controllerQuorumSnapshot, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if ctx.Err() != nil {
		return nil, errControllerQuorum
	}
	if cfg == nil || !cfg.Net.Proxy.Enable || (cfg.Net.SASL.Enable && !cfg.Net.TLS.Enable) {
		return nil, errControllerQuorum
	}
	dialer, ok := cfg.Net.Proxy.Dialer.(interface {
		DialContext(context.Context, string, string) (net.Conn, error)
	})
	if !ok {
		return nil, errControllerQuorum
	}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, errControllerQuorum
	}
	defer conn.Close()
	rawConn := conn
	stop := context.AfterFunc(ctx, func() { _ = rawConn.Close() })
	defer stop()
	if deadline, ok := ctx.Deadline(); ok {
		if conn.SetDeadline(deadline) != nil {
			return nil, errControllerQuorum
		}
	}
	if cfg.Net.TLS.Enable {
		if cfg.Net.TLS.Config == nil || cfg.Net.TLS.Config.InsecureSkipVerify {
			return nil, errControllerQuorum
		}
		tlsConfig := cfg.Net.TLS.Config.Clone()
		if tlsConfig.MinVersion < tls.VersionTLS12 {
			tlsConfig.MinVersion = tls.VersionTLS12
		}
		if tlsConfig.ServerName == "" {
			tlsConfig.ServerName, _, err = net.SplitHostPort(address)
			if err != nil {
				return nil, errControllerQuorum
			}
		}
		secured := tls.Client(conn, tlsConfig)
		if secured.HandshakeContext(ctx) != nil {
			return nil, errControllerQuorum
		}
		conn = secured
	}
	w := quorumWire{conn: conn}
	if cfg.Net.SASL.Enable && w.authenticate(cfg) != nil {
		return nil, errControllerQuorum
	}
	// Cluster ID повторно проверяется на том же аутентифицированном соединении,
	// по которому будет прочитан кворум. Metadata.ControllerID не используется.
	metadata, err := w.exchange(3, 3, false, qInt32(nil, 0))
	if err != nil || quorumMetadataClusterID(metadata) != clusterID {
		return nil, errControllerQuorum
	}
	body := []byte{2}
	body = qCompactString(body, "__cluster_metadata")
	body = append(body, 2)
	body = qInt32(body, 0)
	body = append(body, 0, 0, 0)
	response, err := w.exchange(55, 0, true, body)
	if err != nil {
		return nil, errControllerQuorum
	}
	return decodeControllerQuorum(response, clusterID)
}

type quorumWire struct {
	conn        net.Conn
	correlation int32
}

func (w *quorumWire) exchange(key, version int16, flexible bool, body []byte) ([]byte, error) {
	w.correlation++
	request := qInt16(nil, key)
	request = qInt16(request, version)
	request = qInt32(request, w.correlation)
	request = qString(request, "odyssey-controller-quorum")
	if flexible {
		request = append(request, 0)
	}
	request = append(request, body...)
	request = append(qInt32(nil, int32(len(request))), request...)
	if _, err := io.Copy(w.conn, bytes.NewReader(request)); err != nil {
		return nil, errControllerQuorum
	}
	var length [4]byte
	if _, err := io.ReadFull(w.conn, length[:]); err != nil {
		return nil, errControllerQuorum
	}
	size := binary.BigEndian.Uint32(length[:])
	if size < 4 || size > 1<<20 {
		return nil, errControllerQuorum
	}
	response := make([]byte, int(size))
	if _, err := io.ReadFull(w.conn, response); err != nil {
		return nil, errControllerQuorum
	}
	d := quorumDecoder{data: response}
	if d.i32() != w.correlation {
		return nil, errControllerQuorum
	}
	if flexible {
		d.tags()
	}
	if d.err {
		return nil, errControllerQuorum
	}
	return response[d.offset:], nil
}

func (w *quorumWire) authenticate(cfg *sarama.Config) error {
	mechanism := cfg.Net.SASL.Mechanism
	if mechanism != sarama.SASLTypePlaintext && mechanism != sarama.SASLTypeSCRAMSHA256 && mechanism != sarama.SASLTypeSCRAMSHA512 {
		return errControllerQuorum
	}
	response, err := w.exchange(17, 1, false, qString(nil, string(mechanism)))
	if err != nil {
		return errControllerQuorum
	}
	d := quorumDecoder{data: response}
	if d.i16() != 0 {
		return errControllerQuorum
	}
	count := d.i32()
	if count < 0 || count > 128 {
		return errControllerQuorum
	}
	found := false
	for i := int32(0); i < count; i++ {
		if d.str() == string(mechanism) {
			found = true
		}
	}
	if d.err || !found {
		return errControllerQuorum
	}
	if mechanism == sarama.SASLTypePlaintext {
		_, err = w.saslStep([]byte(cfg.Net.SASL.AuthIdentity + "\x00" + cfg.Net.SASL.User + "\x00" + cfg.Net.SASL.Password))
		return err
	}
	if cfg.Net.SASL.SCRAMClientGeneratorFunc == nil {
		return errControllerQuorum
	}
	client := cfg.Net.SASL.SCRAMClientGeneratorFunc()
	if client == nil || client.Begin(cfg.Net.SASL.User, cfg.Net.SASL.Password, cfg.Net.SASL.AuthIdentity) != nil {
		return errControllerQuorum
	}
	challenge := ""
	for step := 0; step < 8; step++ {
		message, err := client.Step(challenge)
		if err != nil {
			return errControllerQuorum
		}
		if client.Done() {
			return nil
		}
		response, err := w.saslStep([]byte(message))
		if err != nil {
			return errControllerQuorum
		}
		challenge = string(response)
	}
	return errControllerQuorum
}
func (w *quorumWire) saslStep(message []byte) ([]byte, error) {
	response, err := w.exchange(36, 1, false, append(qInt32(nil, int32(len(message))), message...))
	if err != nil {
		return nil, errControllerQuorum
	}
	d := quorumDecoder{data: response}
	code := d.i16()
	_ = d.str()
	payload := d.take(int(d.i32()))
	_ = d.i64()
	if d.err || code != 0 || d.offset != len(response) {
		return nil, errControllerQuorum
	}
	return payload, nil
}

// Декодеры ограничены длиной сообщения, числом узлов и тегов. Текст ошибок
// Kafka и SASL-токены никогда не возвращаются в HTTP или журналы.
type quorumDecoder struct {
	data   []byte
	offset int
	err    bool
}

func (d *quorumDecoder) take(n int) []byte {
	if n < 0 || n > len(d.data)-d.offset {
		d.err = true
		return nil
	}
	b := d.data[d.offset : d.offset+n]
	d.offset += n
	return b
}
func (d *quorumDecoder) i16() int16 {
	b := d.take(2)
	if len(b) != 2 {
		return -1
	}
	return int16(binary.BigEndian.Uint16(b))
}
func (d *quorumDecoder) i32() int32 {
	b := d.take(4)
	if len(b) != 4 {
		return -1
	}
	return int32(binary.BigEndian.Uint32(b))
}
func (d *quorumDecoder) i64() int64 {
	b := d.take(8)
	if len(b) != 8 {
		return -1
	}
	return int64(binary.BigEndian.Uint64(b))
}
func (d *quorumDecoder) uvar() uint64 {
	if d.err {
		return 0
	}
	value, n := binary.Uvarint(d.data[d.offset:])
	if n <= 0 {
		d.err = true
		return 0
	}
	d.offset += n
	return value
}
func (d *quorumDecoder) str() string {
	n := d.i16()
	if n == -1 {
		return ""
	}
	return string(d.take(int(n)))
}
func (d *quorumDecoder) compactString() string {
	n := d.uvar()
	if n == 0 || n > 1<<20 {
		d.err = true
		return ""
	}
	return string(d.take(int(n - 1)))
}
func (d *quorumDecoder) count() int {
	n := d.uvar()
	if n == 0 || n > 1025 {
		d.err = true
		return 0
	}
	return int(n - 1)
}
func (d *quorumDecoder) tags() {
	n := d.uvar()
	if n > 1024 {
		d.err = true
		return
	}
	for i := uint64(0); i < n; i++ {
		_ = d.uvar()
		size := d.uvar()
		if size > 1<<20 {
			d.err = true
			return
		}
		d.take(int(size))
	}
}
func qInt16(b []byte, n int16) []byte   { return binary.BigEndian.AppendUint16(b, uint16(n)) }
func qInt32(b []byte, n int32) []byte   { return binary.BigEndian.AppendUint32(b, uint32(n)) }
func qString(b []byte, s string) []byte { return append(qInt16(b, int16(len(s))), []byte(s)...) }
func qCompactString(b []byte, s string) []byte {
	return append(binary.AppendUvarint(b, uint64(len(s)+1)), []byte(s)...)
}

func quorumMetadataClusterID(response []byte) string {
	d := quorumDecoder{data: response}
	_ = d.i32()
	n := d.i32()
	if n < 0 || n > 1024 {
		return ""
	}
	for i := int32(0); i < n; i++ {
		_ = d.i32()
		_ = d.str()
		_ = d.i32()
		_ = d.str()
	}
	id := d.str()
	if d.err {
		return ""
	}
	return id
}
func decodeControllerQuorum(response []byte, clusterID string) (*controllerQuorumSnapshot, error) {
	d := quorumDecoder{data: response}
	if d.i16() != 0 || d.count() != 1 || d.compactString() != "__cluster_metadata" || d.count() != 1 || d.i32() != 0 || d.i16() != 0 {
		return nil, errControllerQuorum
	}
	q := &controllerQuorumSnapshot{ClusterID: clusterID, LeaderID: d.i32(), Epoch: d.i32(), Source: "describe_quorum"}
	_ = d.i64()
	for n := d.count(); n > 0; n-- {
		q.VoterIDs = append(q.VoterIDs, d.i32())
		_ = d.i64()
		d.tags()
	}
	for n := d.count(); n > 0; n-- {
		_ = d.i32()
		_ = d.i64()
		d.tags()
	}
	d.tags()
	d.tags()
	d.tags()
	if d.err || d.offset != len(response) || q.role(clusterID, q.LeaderID) != "active" {
		return nil, errControllerQuorum
	}
	return q, nil
}
