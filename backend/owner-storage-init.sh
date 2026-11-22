#!/bin/sh
set -eu
umask 077

# Не исправляем права существующих данных автоматически и не читаем секреты.
uid=${ODYSSEY_CONTAINER_UID:-1001}
gid=${ODYSSEY_CONTAINER_GID:-1001}
case "$uid:$gid" in *[!0-9:]*|:|*:|:*) exit 1;; esac
for directory in "${ODYSSEY_DATA_DIR:-/var/lib/odyssey/data}" "$(dirname "${ODYSSEY_KEY_FILE:-/var/lib/odyssey/keys/owner.key}")"; do
    [ -d "$directory" ] && [ ! -L "$directory" ] || { echo 'Ожидается обычный каталог приватного тома' >&2; exit 1; }
    if [ "$(stat -c '%u:%g:%a' "$directory")" = "$uid:$gid:700" ]; then
        continue
    fi
    [ -z "$(find "$directory" -mindepth 1 -maxdepth 1 -print -quit)" ] || { echo 'Существующий непустой том имеет небезопасные права; требуется ручная проверка' >&2; exit 1; }
    chown "$uid:$gid" "$directory"
    chmod 700 "$directory"
done
echo 'Приватные тома владельца готовы; существующие данные сохранены.'
