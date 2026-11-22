#!/bin/sh
set -eu
umask 077
ca=${ODYSSEY_TLS_CA_DIR:-/state/ca}
backend=${ODYSSEY_TLS_BACKEND_DIR:-/state/backend}
frontend=${ODYSSEY_TLS_FRONTEND_DIR:-/state/frontend}
host=${ODYSSEY_PUBLIC_HOST:-localhost}
backend_uid=${ODYSSEY_BACKEND_UID:-1001}
frontend_uid=${ODYSSEY_FRONTEND_UID:-101}
backend_gid=${ODYSSEY_BACKEND_GID:-1001}
frontend_gid=${ODYSSEY_FRONTEND_GID:-101}
fail() { echo 'TLS не подготовлен. Существующие ключи не заменялись; требуется ручная проверка.' >&2; exit 1; }
case "$host" in ''|*[!a-zA-Z0-9.-]*|-*|.*) fail;; esac
[ "${#host}" -le 253 ] || fail
for value in "$backend_uid" "$frontend_uid" "$backend_gid" "$frontend_gid"; do
    case "$value" in ''|*[!0-9]*) fail;; esac
done
for directory in "$ca" "$backend" "$frontend"; do
    [ -d "$directory" ] && [ ! -L "$directory" ] || fail
done
temporary=$(mktemp -d)
trap 'rm -f "$temporary/backend.csr" "$temporary/frontend.csr" "$temporary/key.pub" "$temporary/cert.pub"; rmdir "$temporary"' EXIT

# Любое частичное состояние требует разбора: автоматической ротации/сброса нет.
existing=false
for file in "$ca/ca.key" "$ca/ca.crt" "$backend/server.key" "$backend/server.crt" "$frontend/server.key" "$frontend/server.crt"; do
    if [ -e "$file" ] || [ -L "$file" ]; then existing=true; fi
done
if [ "$existing" = true ]; then
    for file in "$ca/ca.key" "$ca/ca.crt" "$backend/server.key" "$backend/server.crt" "$frontend/server.key" "$frontend/server.crt" "$backend/ca.crt" "$frontend/ca.crt"; do
        [ -f "$file" ] && [ ! -L "$file" ] || fail
    done
    [ "$(stat -c '%a' "$ca")" = 700 ] || fail
    [ "$(stat -c '%u:%g:%a' "$backend")" = "$backend_uid:$backend_gid:700" ] || fail
    [ "$(stat -c '%u:%g:%a' "$frontend")" = "$frontend_uid:$frontend_gid:700" ] || fail
else
    for directory in "$ca" "$backend" "$frontend"; do
        [ -z "$(find "$directory" -mindepth 1 -maxdepth 1 -print -quit)" ] || fail
        chmod 700 "$directory"
    done
    openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -subj '/CN=Odyssey Local CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' -keyout "$ca/ca.key" -out "$ca/ca.crt" >/dev/null 2>&1 || fail
    openssl req -new -newkey rsa:3072 -nodes -sha256 -subj '/CN=backend-service' -addext 'subjectAltName=DNS:backend-service' -addext 'extendedKeyUsage=serverAuth' -keyout "$backend/server.key" -out "$temporary/backend.csr" >/dev/null 2>&1 || fail
    openssl x509 -req -sha256 -days 365 -CA "$ca/ca.crt" -CAkey "$ca/ca.key" -CAcreateserial -copy_extensions copy -in "$temporary/backend.csr" -out "$backend/server.crt" >/dev/null 2>&1 || fail
    case "$host" in *[!0-9.]* ) san="DNS:$host";; *) san="IP:$host";; esac
    openssl req -new -newkey rsa:3072 -nodes -sha256 -subj '/CN=Odyssey frontend' -addext "subjectAltName=$san" -addext 'extendedKeyUsage=serverAuth' -keyout "$frontend/server.key" -out "$temporary/frontend.csr" >/dev/null 2>&1 || fail
    openssl x509 -req -sha256 -days 365 -CA "$ca/ca.crt" -CAkey "$ca/ca.key" -CAcreateserial -copy_extensions copy -in "$temporary/frontend.csr" -out "$frontend/server.crt" >/dev/null 2>&1 || fail
    cp "$ca/ca.crt" "$backend/ca.crt"
    cp "$ca/ca.crt" "$frontend/ca.crt"
    chown "$backend_uid:$backend_gid" "$backend" "$backend/server.key" "$backend/server.crt" "$backend/ca.crt"
    chown "$frontend_uid:$frontend_gid" "$frontend" "$frontend/server.key" "$frontend/server.crt" "$frontend/ca.crt"
fi

for file in "$ca/ca.key" "$backend/server.key" "$frontend/server.key"; do [ "$(stat -c '%a' "$file")" = 600 ] || fail; done
[ "$(stat -c '%u:%g' "$backend/server.key")" = "$backend_uid:$backend_gid" ] || fail
[ "$(stat -c '%u:%g' "$frontend/server.key")" = "$frontend_uid:$frontend_gid" ] || fail
cmp -s "$ca/ca.crt" "$backend/ca.crt" || fail
cmp -s "$ca/ca.crt" "$frontend/ca.crt" || fail
for directory in "$ca" "$backend" "$frontend"; do
    if [ "$directory" = "$ca" ]; then key=ca.key; certificate=ca.crt; else key=server.key; certificate=server.crt; fi
    openssl pkey -in "$directory/$key" -pubout -out "$temporary/key.pub" >/dev/null 2>&1 || fail
    openssl x509 -in "$directory/$certificate" -pubkey -noout > "$temporary/cert.pub" 2>/dev/null || fail
    cmp -s "$temporary/key.pub" "$temporary/cert.pub" || fail
done
openssl verify -CAfile "$ca/ca.crt" -verify_hostname backend-service "$backend/server.crt" >/dev/null 2>&1 || fail
case "$host" in *[!0-9.]* ) openssl verify -CAfile "$ca/ca.crt" -verify_hostname "$host" "$frontend/server.crt" >/dev/null 2>&1 || fail;; *) openssl verify -CAfile "$ca/ca.crt" -verify_ip "$host" "$frontend/server.crt" >/dev/null 2>&1 || fail;; esac
openssl x509 -in "$backend/server.crt" -checkend 86400 -noout >/dev/null || fail
openssl x509 -in "$frontend/server.crt" -checkend 86400 -noout >/dev/null || fail
echo 'TLS подготовлен: ключи находятся только в приватных томах.'
