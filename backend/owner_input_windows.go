package main

import (
	"golang.org/x/sys/windows"
	"os"
)

func hideOwnerInput() (func(), error) {
	h := windows.Handle(os.Stdin.Fd())
	var mode uint32
	if err := windows.GetConsoleMode(h, &mode); err != nil {
		if fi, e := os.Stdin.Stat(); e == nil && fi.Mode()&os.ModeCharDevice == 0 {
			return func() {}, nil
		}
		return nil, err
	}
	if err := windows.SetConsoleMode(h, mode&^windows.ENABLE_ECHO_INPUT); err != nil {
		return nil, err
	}
	return func() { _ = windows.SetConsoleMode(h, mode) }, nil
}
