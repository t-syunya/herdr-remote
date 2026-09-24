.PHONY: up down

COMPOSE ?= docker compose
DEV_HOST ?= $(shell tailscale ip -4 2>/dev/null | awk -F. 'NF == 4 && $$1 == 100 && $$2 >= 64 && $$2 <= 127 { print; exit }')
HERDR_SOCKET_PATH ?= $(HOME)/.config/herdr/herdr.sock
HERDR_RELAY_PORT ?= 18787
RELAY_PID_FILE := /tmp/herdr-remote-socket-relay.pid
RELAY_TOKEN_FILE := /tmp/herdr-remote-socket-relay.token
RELAY_CONFIG_FILE := /tmp/herdr-remote-socket-relay.conf
WEB_PROXY_PID_FILE := /tmp/herdr-remote-web-proxy.pid

export DEV_HOST HERDR_SOCKET_PATH HERDR_RELAY_PORT

up:
	@set -e; \
	if [ -z "$(DEV_HOST)" ]; then echo "Tailscale is unavailable; set DEV_HOST to the Tailscale IP."; exit 1; fi; \
	if [ -f "$(RELAY_PID_FILE)" ] && \
		ps -p "$$(cat "$(RELAY_PID_FILE)")" -o command= | grep -Fq 'packages/herdr/src/transport/relay.mjs'; then \
		pid="$$(cat "$(RELAY_PID_FILE)")"; \
		if printf '%s\n%s\n' "$$HERDR_SOCKET_PATH" "$$HERDR_RELAY_PORT" | cmp -s - "$(RELAY_CONFIG_FILE)"; then \
			token="$$(cat "$(RELAY_TOKEN_FILE)")"; \
		else \
			kill "$$pid"; \
			for attempt in 1 2 3 4 5; do \
				if ! kill -0 "$$pid" 2>/dev/null; then break; fi; \
				sleep 1; \
			done; \
			if kill -0 "$$pid" 2>/dev/null; then echo "Could not stop the existing Herdr relay (PID $$pid)."; exit 1; fi; \
			token="$$(openssl rand -hex 32)"; \
			(umask 077; printf '%s\n' "$$token" > "$(RELAY_TOKEN_FILE)"); \
			HERDR_RELAY_TOKEN="$$token" nohup node packages/herdr/src/transport/relay.mjs > /tmp/herdr-remote-socket-relay.log 2>&1 </dev/null & \
			echo $$! > "$(RELAY_PID_FILE)"; \
			(umask 077; printf '%s\n%s\n' "$$HERDR_SOCKET_PATH" "$$HERDR_RELAY_PORT" > "$(RELAY_CONFIG_FILE)"); \
		fi; \
	else \
		token="$$(openssl rand -hex 32)"; \
		(umask 077; printf '%s\n' "$$token" > "$(RELAY_TOKEN_FILE)"); \
		HERDR_RELAY_TOKEN="$$token" nohup node packages/herdr/src/transport/relay.mjs > /tmp/herdr-remote-socket-relay.log 2>&1 </dev/null & \
		echo $$! > "$(RELAY_PID_FILE)"; \
		(umask 077; printf '%s\n%s\n' "$$HERDR_SOCKET_PATH" "$$HERDR_RELAY_PORT" > "$(RELAY_CONFIG_FILE)"); \
	fi; \
	sleep 1; \
	if ! kill -0 "$$(cat "$(RELAY_PID_FILE)")" 2>/dev/null; then cat /tmp/herdr-remote-socket-relay.log; exit 1; fi; \
	HERDR_RELAY_TOKEN="$$token" $(COMPOSE) up -d --build; \
	if [ -f "$(WEB_PROXY_PID_FILE)" ] && \
		ps -p "$$(cat "$(WEB_PROXY_PID_FILE)")" -o command= | grep -Fq 'scripts/tailscale-web-proxy.mjs'; then \
		echo "Tailscale web proxy is already running (PID $$(cat "$(WEB_PROXY_PID_FILE)"))."; \
	else \
		DEV_HOST="$(DEV_HOST)" nohup node scripts/tailscale-web-proxy.mjs > /tmp/herdr-remote-web-proxy.log 2>&1 </dev/null & \
		echo $$! > "$(WEB_PROXY_PID_FILE)"; \
	fi; \
	sleep 1; \
	if ! kill -0 "$$(cat "$(WEB_PROXY_PID_FILE)")" 2>/dev/null; then cat /tmp/herdr-remote-web-proxy.log; exit 1; fi

down:
	@HERDR_RELAY_TOKEN="$$(cat "$(RELAY_TOKEN_FILE)")" $(COMPOSE) down --remove-orphans
	@if [ -f "$(WEB_PROXY_PID_FILE)" ]; then \
		pid="$$(cat "$(WEB_PROXY_PID_FILE)")"; \
		if ps -p "$$pid" -o command= | grep -Fq 'scripts/tailscale-web-proxy.mjs'; then kill "$$pid"; fi; \
	fi
	@if [ -f "$(RELAY_PID_FILE)" ]; then \
		pid="$$(cat "$(RELAY_PID_FILE)")"; \
		if ps -p "$$pid" -o command= | grep -Fq 'packages/herdr/src/transport/relay.mjs'; then kill "$$pid"; fi; \
	fi
