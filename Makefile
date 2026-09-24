.PHONY: up down

COMPOSE ?= docker compose
DEV_HOST ?= $(shell tailscale ip -4 2>/dev/null | head -n 1)
HERDR_SOCKET_PATH ?= $(HOME)/.config/herdr/herdr.sock
HERDR_RELAY_PORT ?= 18787
RELAY_PID_FILE := /tmp/herdr-remote-socket-relay.pid
RELAY_TOKEN_FILE := /tmp/herdr-remote-socket-relay.token

export DEV_HOST HERDR_SOCKET_PATH HERDR_RELAY_PORT

up:
	@set -e; \
	if [ -f "$(RELAY_PID_FILE)" ] && \
		ps -p "$$(cat "$(RELAY_PID_FILE)")" -o command= | grep -Fq 'scripts/herdr-socket-relay.mjs'; then \
		token="$$(cat "$(RELAY_TOKEN_FILE)")"; \
	else \
		token="$$(openssl rand -hex 32)"; \
		(umask 077; printf '%s\n' "$$token" > "$(RELAY_TOKEN_FILE)"); \
		HERDR_RELAY_TOKEN="$$token" nohup node scripts/herdr-socket-relay.mjs > /tmp/herdr-remote-socket-relay.log 2>&1 </dev/null & \
		echo $$! > "$(RELAY_PID_FILE)"; \
	fi; \
	sleep 1; \
	if ! kill -0 "$$(cat "$(RELAY_PID_FILE)")" 2>/dev/null; then cat /tmp/herdr-remote-socket-relay.log; exit 1; fi; \
	HERDR_RELAY_TOKEN="$$token" $(COMPOSE) up -d --build

down:
	@HERDR_RELAY_TOKEN="$$(cat "$(RELAY_TOKEN_FILE)")" $(COMPOSE) down --remove-orphans
	@if [ -f "$(RELAY_PID_FILE)" ]; then \
		pid="$$(cat "$(RELAY_PID_FILE)")"; \
		if ps -p "$$pid" -o command= | grep -Fq 'scripts/herdr-socket-relay.mjs'; then kill "$$pid"; fi; \
	fi
