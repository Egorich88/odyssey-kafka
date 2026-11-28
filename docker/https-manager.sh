#!/bin/sh
# Вызывается локальным Docker CLI. Входные файлы монтируются только для чтения.
set -eu
umask 077
state=${ODYSSEY_TLS_STATE:-/state}
input=${ODYSSEY_TLS_INPUT:-/input}
frontend_owner=${ODYSSEY_FRONTEND_OWNER:-101:101}
cd "$state/frontend"
work=$(mktemp -d)
trap 'rm -f "$work/request" "$work/extensions" "$work/key.pub" "$work/cert.pub" "$work/peer" "$work/served" "$work/expected"; rmdir "$work"' EXIT
host=${ODYSSEY_PUBLIC_HOST:-localhost}
lock="$state/frontend/.activation"
if [ "$1" = pending ]; then
    if [ -f "$lock/id" ]; then cat "$lock/id"; fi
    exit 0
fi
id=${2:-}
case "$id" in ''|*[!0-9a-f]*) exit 2;; esac
[ "${#id}" = 32 ]
slot="candidate-$id"
owned() { [ "$(cat "$lock/id")" = "$id" ]; }
switch_to() { ln -s "$1" ".link-$id" && mv -Tf ".link-$id" live; }
case "$1" in
prepare)
    mkdir ".txn-$id"
    printf %s "$id" > ".txn-$id/id"
    readlink live > ".txn-$id/previous"
    ln -sn ".txn-$id" "$lock"
    mkdir "$slot"
    case "$3" in
      local)
        [ "$host" = localhost ]
        openssl req -new -newkey rsa:3072 -nodes -sha256 -subj '/CN=Odyssey localhost' -keyout "$slot/server.key" -out "$work/request" >/dev/null 2>&1
        printf '%s\n' 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' 'extendedKeyUsage=serverAuth' 'basicConstraints=critical,CA:FALSE' > "$work/extensions"
        openssl x509 -req -in "$work/request" -CA "$state/ca/ca.crt" -CAkey "$state/ca/ca.key" -set_serial "0x$id" -days 365 -sha256 -extfile "$work/extensions" -out "$slot/server.crt"
        cp "$state/ca/ca.crt" "$slot/trust.pem";;
      custom|letsencrypt)
        cp "$input/cert.pem" "$slot/server.crt"
        cp "$input/key.pem" "$slot/server.key"
        if [ -f "$input/ca.pem" ]; then cp "$input/ca.pem" "$slot/trust.pem"; else cp /etc/ssl/certs/ca-certificates.crt "$slot/trust.pem"; fi;;
      *) exit 2;;
    esac
    openssl pkey -passin pass: -in "$slot/server.key" -pubout >"$work/key.pub"
    openssl x509 -in "$slot/server.crt" -pubkey -noout >"$work/cert.pub"
    cmp -s "$work/key.pub" "$work/cert.pub"
    openssl x509 -in "$slot/server.crt" -checkend 86400 -noout
    case "$host" in *[!0-9.]* ) flag=-verify_hostname;; *) flag=-verify_ip;; esac
    case "$flag" in -verify_ip) san_type="IP Address:";; *) san_type="DNS:";; esac
    openssl x509 -in "$slot/server.crt" -ext subjectAltName -noout | grep -Fq "$san_type"
    openssl verify -purpose sslserver "$flag" "$host" -CAfile "$slot/trust.pem" -untrusted "$slot/server.crt" "$slot/server.crt"
    chmod 600 "$slot/server.key"
    chown -R "$frontend_owner" "$slot"
    printf %s "$3" > "$lock/type"
    switch_to "$slot";;
rollback)
    owned
    # Подтверждение могло сохраниться до обрыва связи с CLI.
    if [ -f "$state/public/active.json" ]; then
        grep -Fq "\"generation\":\"$id\"" "$state/public/active.json" && exit 0
    fi
    if [ -e live ] && [ "$(readlink live)" = "$slot" ]; then switch_to "$(cat "$lock/previous")"; fi;;
finish)
    owned
    [ "$(readlink live)" = "$slot" ]
    # Проверяется сертификат реального обработчика TLS после reload.
    case "$host" in *[!0-9.]* ) flag=-verify_hostname;; *) flag=-verify_ip;; esac
    timeout 10 openssl s_client -connect "${ODYSSEY_TLS_PEER:-frontend-service:8443}" -servername "$host" "$flag" "$host" -verify_return_error -CAfile "$slot/trust.pem" </dev/null >"$work/peer" 2>/dev/null
    openssl x509 -in "$work/peer" -outform DER >"$work/served"
    openssl x509 -in "$slot/server.crt" -outform DER >"$work/expected"
    cmp -s "$work/served" "$work/expected"
    expires=$(openssl x509 -in "$slot/server.crt" -enddate -noout | cut -d= -f2-)
    origin=${ODYSSEY_PUBLIC_ORIGIN:?}
    if [ "$origin" != "https://$host" ]; then
        port=${origin##*:}
        case "$port" in ''|*[!0-9]*) exit 2;; esac
        [ "$origin" = "https://$host:$port" ]
    fi
    printf '{"type":"%s","expires":"%s","origin":"%s","generation":"%s"}\n' "$(cat "$lock/type")" "$expires" "$origin" "$id" > "$state/public/next"
    chmod 644 "$state/public/next"
    mv "$state/public/next" "$state/public/active.json";;
unlock)
    owned
    rm "$lock";;
*) exit 2;;
esac
