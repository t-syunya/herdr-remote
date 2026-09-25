#!/bin/sh

set -eu

"$@" &
child_pid=$!

stop_child() {
  trap - INT TERM
  kill -TERM "$child_pid" 2>/dev/null || true
  wait "$child_pid" || true
  exit 0
}

trap stop_child INT TERM
wait "$child_pid"
