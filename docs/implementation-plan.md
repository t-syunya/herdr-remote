# Implementation Plan

## Phase 0: Herdr API spike

Do this before coding the adapter against assumptions.

### Verify

- installed Herdr API schema
- local socket path and lifecycle
- workspace/tab/pane identifiers and relationships
- pane read/output behavior
- text input behavior
- special-key behavior
- agent list/read/prompt behavior if supported by the installed version
- event/subscription behavior if useful
- reconnect/restart/disconnect failure modes

### Deliverable

Create `docs/herdr-api-spike.md` with:

- installed Herdr version
- observed API methods
- example sanitized request/response shapes
- confirmed socket behavior
- incompatibilities with docs or assumptions
- decisions required before adapter implementation

## Phase 1: Monorepo bootstrap

Create the actual packages/apps with pnpm workspace.

Target shape:

```text
apps/
  web/
  server/
packages/
  herdr/
  shared/
```

Keep dependencies minimal.

## Phase 2: `packages/herdr` adapter

Implement from the verified spike.

Suggested order:

1. socket transport
2. raw request/response types
3. error translation
4. workspace/tab/pane domain models and mappers
5. read pane
6. send text
7. special-key mapping
8. agent operations
9. normalization tests

Do not expose raw Herdr types from the package public entrypoint.

## Phase 3: Hono RPC server

Expose only the operations needed by the MVP.

Likely groups:

- session/navigation state
- panes
- agents
- input/actions
- health/status

Use application models returned by `packages/herdr`.

## Phase 4: Mobile web UI

Build the smallest usable one-screen flow.

Required UX:

- tap to choose workspace/tab/pane/agent
- readable output area
- text input and send
- one-tap Enter/Escape/Ctrl+C/arrows
- clear connection/error state
- normalized agent state

Prioritize iPhone ergonomics over desktop density.

## Phase 5: Tailscale access

Expose only the web/backend service over Tailscale.

Validate from the iPhone that the MVP works without Termius.

## Phase 6: MVP hardening

Before declaring MVP complete:

- adapter mapper tests
- status normalization tests
- key mapping tests
- API contract checks
- graceful Herdr-unavailable behavior
- reconnect behavior
- mobile layout check
- typecheck/lint/test/build green

## MVP Definition of Done

From an iPhone connected through Tailscale, without Termius, the user can:

1. open the Herdr Remote UI
2. identify and select the intended Agent/Pane
3. view its output
4. send text
5. send major special keys
6. understand whether the target is working/idle/blocked/done/unknown

## Post-MVP

Only after MVP works end-to-end, consider:

- PWA installation
- realtime WebSocket/SSE updates
- notifications
- custom shortcuts
- prompt templates
- pane split/create/close
- richer workspace controls
- persistent preferences/history if a concrete need emerges
