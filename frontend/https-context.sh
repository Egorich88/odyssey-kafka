#!/bin/sh
set -eu
project=${ODYSSEY_COMPOSE_PROJECT:-}
[ -n "$project" ] || exit 0
case "$project" in *[!a-z0-9_-]*) exit 1;; esac
printf '{"project":"%s"}\n' "$project" > /tmp/odyssey-setup.json
