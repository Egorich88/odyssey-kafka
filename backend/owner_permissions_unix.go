//go:build !windows

package main

import "os"

func privatePath(path string, directory bool) error {
	fi, err := os.Lstat(path)
	if err != nil || fi.Mode()&os.ModeSymlink != 0 || fi.IsDir() != directory || fi.Mode().Perm()&0077 != 0 {
		return errOwnerStore
	}
	return nil
}

func makePrivateDirectory(path string) error {
	if err := os.Mkdir(path, 0700); err != nil && !os.IsExist(err) {
		return err
	}
	return privatePath(path, true)
}
