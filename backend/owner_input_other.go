//go:build !linux && !windows

package main

import "errors"

func hideOwnerInput() (func(), error) {
	return nil, errors.New("безопасный ввод пароля реализован для Linux и Windows")
}
