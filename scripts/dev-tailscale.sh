#!/bin/sh
set -eu

host="${DEV_HOST:-$(tailscale ip -4 2>/dev/null | head -n 1 || true)}"

if [ -z "$host" ]; then
  echo "Tailscale の IPv4 アドレスを取得できませんでした。Tailscale が起動しているか確認してください。" >&2
  exit 1
fi

echo "Web を http://$host:5173 で待ち受けます。iPhone から同じ URL を開いてください。"
DEV_HOST="$host" pnpm dev
