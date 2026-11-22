package main

import (
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

// На Windows chmod недостаточно: проверяем DACL для пользователя процесса и SYSTEM.
func privatePath(path string, directory bool) error {
	fi, err := os.Lstat(path)
	if err != nil || fi.Mode()&os.ModeSymlink != 0 || fi.IsDir() != directory {
		return errOwnerStore
	}
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return errOwnerStore
	}
	acl, _, err := sd.DACL()
	if err != nil || acl == nil {
		return errOwnerStore
	}
	u, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return errOwnerStore
	}
	for i := uint32(0); i < uint32(acl.AceCount); i++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if windows.GetAce(acl, i, &ace) != nil || ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
			return errOwnerStore
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if !sid.Equals(u.User.Sid) && !sid.IsWellKnown(windows.WinLocalSystemSid) {
			return errOwnerStore
		}
	}
	if acl.AceCount == 0 {
		return errOwnerStore
	}
	return nil
}

func makePrivateDirectory(path string) error {
	u, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return errOwnerStore
	}
	sd, err := windows.SecurityDescriptorFromString("D:P(A;OICI;FA;;;" + u.User.Sid.String() + ")(A;OICI;FA;;;SY)")
	if err != nil {
		return errOwnerStore
	}
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return errOwnerStore
	}
	err = windows.CreateDirectory(p, &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd})
	if err != nil && err != windows.ERROR_ALREADY_EXISTS {
		return err
	}
	return privatePath(path, true)
}
