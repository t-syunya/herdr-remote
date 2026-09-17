# Architecture

## Goal

Provide a mobile-first control surface for Herdr running on a Mac and reachable from an iPhone over Tailscale.

The primary UX problem is that direct terminal/TUI control from a phone is awkward: tapping terminal tabs is unreliable and modifier-key combinations are cumbersome.

The product therefore treats Herdr as a backend rather than trying to reproduce the Herdr TUI remotely.

## System overview

```text
iPhone / Safari or PWA
        |
        | Tailscale
        v
apps/web
React + Vite + TypeScript
        |
        | Hono RPC
        v
apps/server
Hono + TypeScript
        |
        | stable adapter API
        v
packages/herdr
        |
        | local Herdr socket protocol
        v
Herdr
```

## Responsibility boundaries

### `apps/web`

Responsible for mobile UX only.

- workspace/tab/pane/agent selection
- output rendering
- text input
- special-key buttons
- application-level status presentation

It must not understand Herdr socket messages or raw Herdr response types.

### `apps/server`

Responsible for the application-facing backend contract.

- Hono RPC routes
- input validation
- mapping adapter errors to application/API errors
- composition of use cases when more than one adapter call is needed

It must not parse Herdr raw payloads.

### `packages/herdr`

This package is the anti-corruption layer between the app and Herdr.

It owns:

- local socket transport
- raw Herdr request/response shapes
- Herdr operation names
- version-specific compatibility behavior
- raw -> stable domain mapping
- status normalization
- special-key mapping
- adapter-level errors

Its public exports should be deliberately small and stable.

### `packages/shared`

Use only for genuinely Herdr-independent code shared by web/server.

Do not use it as a dumping ground for raw API types.

## Domain model direction

Application code should depend on normalized models such as:

```ts
export type AgentStatus =
  | "idle"
  | "working"
  | "blocked"
  | "done"
  | "unknown"

export type Pane = {
  id: string
  title: string
}
```

The exact fields should be finalized after the real Herdr API spike.

## Adapter interface direction

Likely operations include:

```ts
interface HerdrClient {
  listWorkspaces(): Promise<Workspace[]>
  listTabs(workspaceId: string): Promise<Tab[]>
  listPanes(tabId: string): Promise<Pane[]>
  readPane(paneId: string): Promise<PaneOutput>
  sendText(paneId: string, text: string): Promise<void>
  sendKey(paneId: string, key: SpecialKey): Promise<void>
  listAgents(): Promise<Agent[]>
  readAgent(agentId: string): Promise<Agent>
  sendPrompt(agentId: string, prompt: string): Promise<void>
}
```

These are design targets, not claims about Herdr's raw API.

## API boundary

`apps/server` will expose Hono RPC so that the React client can infer server API types directly.

The browser/server contract should use application-oriented models. Raw Herdr payloads must never become the browser contract.

## Runtime/data choices

For MVP:

- no database
- no persisted history
- no generalized event store
- no public Internet deployment
- polling is acceptable for output/state refresh

Post-MVP candidates:

- PWA installation
- WebSocket or SSE realtime updates
- notifications for blocked/done state
- custom shortcut buttons
- saved prompt templates
- pane lifecycle controls
- richer workspace switching

## Security model

The Herdr local socket remains local to the Mac.

Only the web/backend service should be reachable through Tailscale. The system must not expose the Herdr socket directly to the network or assume public Internet access.

Because control operations are effectively terminal-control capabilities, the externally reachable surface should remain minimal.

## Error model

Normalize technical failures into application-level categories, for example:

- `HerdrUnavailable`
- `TargetNotFound`
- `UnsupportedOperation`
- `TransportDisconnected`
- `InvalidHerdrResponse`

The exact representation can be refined during implementation, but raw socket exceptions should stay behind `packages/herdr`.

## Compatibility principle

When a Herdr upgrade changes raw field names, operation names, or response structure, prefer changing only:

- `packages/herdr/raw`
- `packages/herdr/transport`
- `packages/herdr/mappers`

Keep `apps/server` and `apps/web` unchanged whenever the user-visible capability remains the same.
