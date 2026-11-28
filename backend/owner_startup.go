package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

func ownerFromEnvironment() (*ownerAuth, error) {
	s, err := openOwnerStore(os.Getenv("ODYSSEY_DATA_DIR"), os.Getenv("ODYSSEY_KEY_FILE"))
	if err != nil {
		return nil, err
	}
	return newOwnerAuth(s, os.Getenv("ODYSSEY_PUBLIC_ORIGIN"))
}

func ownerCommand(args []string) (bool, error) {
	if len(args) == 0 {
		return false, nil
	}
	if len(args) != 1 || args[0] != "owner-init" {
		return true, errors.New("поддерживается только локальная команда owner-init")
	}
	if receipt := os.Getenv("ODYSSEY_HTTPS_RECEIPT"); receipt != "" {
		info, err := os.Stat(receipt)
		if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			return true, errors.New("сначала завершите настройку HTTPS / complete HTTPS setup first")
		}
	}
	// Пароль не принимается в аргументах или переменных окружения.
	restore, err := hideOwnerInput()
	if err != nil {
		return true, err
	}
	defer restore()
	fmt.Fprintln(os.Stderr, "Введите пароль владельца (не менее 12 байт):")
	r := bufio.NewReader(io.LimitReader(os.Stdin, 2050))
	password, err := r.ReadString('\n')
	if err != nil && err != io.EOF {
		return true, errors.New("не удалось прочитать пароль")
	}
	password = strings.TrimSuffix(strings.TrimSuffix(password, "\n"), "\r")
	b := []byte(password)
	defer clear(b)
	err = createOwnerStore(os.Getenv("ODYSSEY_DATA_DIR"), os.Getenv("ODYSSEY_KEY_FILE"), b)
	if err != nil {
		return true, err
	}
	fmt.Fprintln(os.Stderr, "Владелец создан. Повторная регистрация запрещена.")
	return true, nil
}
