# `apps/web`

React + Vite + TypeScript mobile-first UI.

## Responsibilities

- target selection by tap
- output rendering
- text input and send
- one-tap special keys
- normalized connection and agent status presentation

## Boundary rule

This app consumes the Hono RPC client only. It must not know Herdr socket details, raw Herdr method names, or raw Herdr payload types.
