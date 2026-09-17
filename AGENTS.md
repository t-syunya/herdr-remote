# AGENTS.md

This repository is primarily implemented and maintained with Codex.

## Mission

Build a mobile-first remote UI for Herdr so that Herdr running on a Mac can be operated from an iPhone over Tailscale without direct TUI interaction.

The finished product is expected to grow into a practical control surface, but the first milestone is intentionally a thin MVP.

## Non-negotiable architecture rules

1. `packages/herdr` is the only layer allowed to depend on Herdr's raw API shape.
2. Raw Herdr response types, method names, socket details, and version-specific quirks must not leak into `apps/server` or `apps/web`.
3. `packages/herdr` acts as an adapter / anti-corruption layer and exposes stable application-oriented models and operations.
4. `apps/server` exposes application operations through Hono RPC and should depend on the stable `packages/herdr` API, not Herdr internals.
5. `apps/web` consumes the Hono RPC client and should not know Herdr transport details.
6. Keep the MVP small. Do not add a database, persistent history, notification system, or broad infrastructure unless a concrete requirement forces it.
7. Remote access is intended to stay inside Tailscale. Do not design around public Internet exposure.

## Selected stack

- Monorepo
- pnpm workspace
- No Turborepo for MVP
- React + Vite + TypeScript for `apps/web`
- Hono + TypeScript for `apps/server`
- Hono RPC between web and server
- Herdr local Socket API behind `packages/herdr`
- Tailscale for remote access

## Intended package boundaries

```text
apps/web
  -> Hono RPC client

apps/server
  -> application routes / RPC
  -> depends on packages/herdr

packages/herdr
  -> stable public interface
  -> domain models
  -> mappers / normalization
  -> raw Herdr API types and methods
  -> local socket transport

packages/shared
  -> only Herdr-independent shared utilities or domain types
```

Do not put Herdr raw types into `packages/shared`.

## Expected `packages/herdr` shape

A reasonable starting structure is:

```text
packages/herdr/src/
├── index.ts
├── client.ts
├── domain/
│   ├── workspace.ts
│   ├── tab.ts
│   ├── pane.ts
│   └── agent.ts
├── raw/
│   ├── types.ts
│   └── methods.ts
├── transport/
│   └── socket.ts
├── mappers/
│   ├── workspace.ts
│   ├── pane.ts
│   └── agent.ts
└── errors.ts
```

Exact file layout may change if implementation evidence supports a better structure. Preserve the boundary, not the filenames.

## Stable interface direction

The adapter should expose operations in application language, for example:

- `listWorkspaces()`
- `listTabs(workspaceId)`
- `listPanes(tabId)`
- `readPane(paneId)`
- `sendText(paneId, text)`
- `sendKey(paneId, key)`
- `listAgents()`
- `readAgent(agentId)`
- `sendPrompt(agentId, prompt)`

Do not assume these exact signatures are final until the Herdr API spike is complete.

## Normalization policy

The app should depend on our own stable domain models.

Example idea:

```ts
export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown"
```

If Herdr changes its raw representation, update the adapter mapping instead of changing app code whenever practical.

## MVP UI

The first usable mobile UI should prioritize:

- target selection by tap
- readable output
- text input and send
- one-tap special keys
- normalized agent state

Special-key controls should include at least:

- Enter
- Escape
- Ctrl+C
- Arrow Up
- Arrow Down
- Arrow Left
- Arrow Right

Prefer a simple single-screen mobile workflow over desktop-style terminal chrome.

## Realtime behavior

Start with the simplest reliable mechanism. Polling is acceptable for the MVP.

Do not introduce WebSocket/SSE only because they are architecturally attractive. Add realtime transport when there is a measured UX requirement or when the Herdr event model makes it materially simpler.

## Required first implementation step

Before implementing the adapter against assumptions, perform a Herdr API spike on a real machine.

Verify at minimum:

- installed Herdr API schema
- actual socket path / connection behavior
- workspace/tab/pane identifiers
- pane read behavior
- text input behavior
- special-key behavior
- agent list/read/prompt behavior if available
- events/subscription behavior if relevant
- restart/disconnect/error behavior

Record any differences between documentation and the installed version in `docs/herdr-api-spike.md`.

## Error handling

Translate raw transport/API failures into application-level errors where practical.

Examples:

- Herdr unavailable
- invalid target
- unsupported operation
- transport disconnected
- malformed response

Do not expose raw socket errors directly to the browser as the public API contract.

## Testing expectations

Focus tests on boundaries that protect the architecture:

- raw -> domain mapping
- status normalization
- special-key mapping
- malformed/unknown Herdr responses
- Hono RPC contract around adapter operations

Avoid tests that merely duplicate framework behavior.

## Change discipline

When implementing a task:

1. Read `README.md`, `docs/architecture.md`, and `docs/implementation-plan.md`.
2. Check whether the task changes any established architectural boundary.
3. If Herdr behavior is uncertain, verify instead of inventing.
4. Make the smallest complete change.
5. Run relevant lint/typecheck/test/build commands before finishing.
6. Summarize what changed, what was verified, and any assumptions that remain.

## Scope guardrails

Do not silently add:

- a database
- authentication beyond the Tailscale trust boundary
- public Internet exposure
- a generalized agent platform
- background notification infrastructure
- Turborepo
- unrelated UI frameworks

These may be added later, but only as explicit decisions.
