package main

import (
	"golang.org/x/sys/unix"
	"os"
)

func hideOwnerInput() (func(), error) {
	fd := int(os.Stdin.Fd())
	t, err := unix.IoctlGetTermios(fd, unix.TCGETS)
	if err == unix.ENOTTY {
		return func() {}, nil
	}
	if err != nil {
		return nil, err
	}
	quiet := *t
	quiet.Lflag &^= unix.ECHO
	if err = unix.IoctlSetTermios(fd, unix.TCSETS, &quiet); err != nil {
		return nil, err
	}
	return func() { _ = unix.IoctlSetTermios(fd, unix.TCSETS, t) }, nil
}
