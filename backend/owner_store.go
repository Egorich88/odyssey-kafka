package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
)

var errOwnerStore = errors.New("защищённое хранилище недоступно или повреждено")

type ownerPassword struct {
	Salt []byte `json:"salt"`
	Hash []byte `json:"hash"`
}

// Содержимое файла целиком зашифровано; поля профилей добавляются отдельным блоком.
type ownerData struct {
	Version  int                           `json:"version"`
	Owner    ownerPassword                 `json:"owner"`
	Profiles map[string]storedKafkaProfile `json:"profiles,omitempty"`
}

type ownerStore struct {
	mu   sync.Mutex
	path string
	aead cipher.AEAD
	data ownerData
}

func newOwnerCipher(key []byte) (cipher.AEAD, error) {
	if len(key) != 32 {
		return nil, errOwnerStore
	}
	b, err := aes.NewCipher(key)
	if err != nil {
		return nil, errOwnerStore
	}
	return cipher.NewGCM(b)
}

func ownerStorePaths(dataDir, keyPath string) (string, string, error) {
	dir, err := filepath.Abs(dataDir)
	if err != nil || dataDir == "" || keyPath == "" {
		return "", "", errOwnerStore
	}
	key, err := filepath.Abs(keyPath)
	if err != nil {
		return "", "", errOwnerStore
	}
	rel, err := filepath.Rel(dir, key)
	if err != nil || (rel != ".." && !filepath.IsAbs(rel) && len(rel) > 0 && rel[:min(3, len(rel))] != ".."+string(os.PathSeparator)) {
		return "", "", errors.New("ключ должен находиться вне каталога данных")
	}
	return filepath.Join(dir, "owner.enc"), key, nil
}

func readPrivateFile(path string, limit int64) ([]byte, error) {
	fi, err := os.Lstat(path)
	if err != nil || !fi.Mode().IsRegular() || privatePath(path, false) != nil {
		return nil, errOwnerStore
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, errOwnerStore
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil || int64(len(b)) > limit {
		return nil, errOwnerStore
	}
	return b, nil
}

func openOwnerStore(dataDir, keyPath string) (*ownerStore, error) {
	path, keyPath, err := ownerStorePaths(dataDir, keyPath)
	if err != nil {
		return nil, err
	}
	if privatePath(filepath.Dir(path), true) != nil {
		return nil, errOwnerStore
	}
	key, err := readPrivateFile(keyPath, 32)
	if err != nil {
		return nil, err
	}
	aead, err := newOwnerCipher(key)
	clear(key)
	if err != nil {
		return nil, err
	}
	sealed, err := readPrivateFile(path, 4<<20)
	if err != nil || len(sealed) < aead.NonceSize() {
		return nil, errOwnerStore
	}
	plain, err := aead.Open(nil, sealed[:aead.NonceSize()], sealed[aead.NonceSize():], []byte("odyssey-owner-store-v1"))
	if err != nil {
		return nil, errOwnerStore
	}
	defer clear(plain)
	var data ownerData
	if json.Unmarshal(plain, &data) != nil || data.Version != 1 || len(data.Owner.Salt) != 16 || len(data.Owner.Hash) != 32 {
		return nil, errOwnerStore
	}
	return &ownerStore{path: path, aead: aead, data: data}, nil
}

// Начальная запись использует O_EXCL: существующие данные никогда не заменяются.
func createOwnerStore(dataDir, keyPath string, password []byte) error {
	if !validOwnerPassword(password) {
		return errors.New("пароль должен содержать от 12 до 1024 байт")
	}
	path, keyPath, err := ownerStorePaths(dataDir, keyPath)
	if err != nil {
		return err
	}
	if err = makePrivateDirectory(filepath.Dir(path)); err != nil {
		return errOwnerStore
	}
	if err = privatePath(filepath.Dir(keyPath), true); err != nil {
		return errors.New("каталог ключа должен существовать и иметь ограниченные права")
	}
	key := make([]byte, 32)
	if _, err = rand.Read(key); err != nil {
		return err
	}
	defer clear(key)
	aead, err := newOwnerCipher(key)
	if err != nil {
		return err
	}
	owner, err := hashOwnerPassword(password)
	if err != nil {
		return err
	}
	sealed, err := sealOwnerData(aead, ownerData{Version: 1, Owner: owner})
	if err != nil {
		return err
	}
	// При частичной ошибке файлы остаются для локального разбора; автоматического сброса нет.
	if err = writeExclusivePrivate(keyPath, key); err != nil {
		return errOwnerStore
	}
	return writeExclusivePrivate(path, sealed)
}

func sealOwnerData(aead cipher.AEAD, data ownerData) ([]byte, error) {
	plain, err := json.Marshal(data)
	if err != nil {
		return nil, errOwnerStore
	}
	defer clear(plain)
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	return aead.Seal(nonce, nonce, plain, []byte("odyssey-owner-store-v1")), nil
}

func writeExclusivePrivate(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	if privatePath(path, false) != nil {
		return errOwnerStore
	}
	if _, err = f.Write(data); err != nil {
		return err
	}
	return f.Sync()
}
