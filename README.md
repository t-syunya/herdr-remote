# herdr-remote

Mobile-first remote control UI for Herdr.

The goal is to operate Herdr running on a Mac from an iPhone over Tailscale without relying on Termius or direct TUI interaction.

## MVP

- Show Workspace / Tab / Pane / Agent lists
- Switch the active target by tapping
- Read Pane / Agent output
- Send text input
- Send common special keys such as Enter, Escape, Ctrl+C, and arrow keys
- Show normalized Agent status
- Access the UI from an iPhone over Tailscale

## Architecture

```text
iPhone / browser
      |
      | Tailscale
      v
apps/web            React + Vite + TypeScript
      |
      | Hono RPC
      v
apps/server         Hono + TypeScript
      |
      v
packages/herdr      Herdr adapter / anti-corruption layer
      |
      | local socket
      v
Herdr
```

Herdr-specific raw API types must not leak outside `packages/herdr`.

## Repository structure

```text
herdr-remote/
├── apps/
│   ├── web/
│   └── server/
├── packages/
│   ├── herdr/
│   └── shared/
├── docs/
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

## Technical decisions

- Monorepo
- pnpm workspace
- No Turborepo for the MVP
- Frontend: React + Vite + TypeScript
- Backend: Hono + TypeScript
- Browser/server API: Hono RPC
- Herdr integration: local Socket API behind an adapter layer
- Remote access: Tailscale only
- No database in the MVP
- No persisted history in the MVP
- Realtime updates and notifications are post-MVP unless required by implementation constraints

See `docs/architecture.md` and `docs/implementation-plan.md` for details.
