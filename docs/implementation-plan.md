# Implementation Plan

## Phase 0: Herdr API spike

Do this before coding the adapter against assumptions.

Status (2026-09-18): **完了**。実機 0.8.2 で socket、Pane 入出力、特殊キー、
Agent 読み取り・実 prompt 送信・完了待ち、イベント、停止・再接続を確認済み。
詳細、確認範囲、Phase 2 向けの提案は
[`herdr-api-spike.md`](herdr-api-spike.md) を参照。

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

Status (2026-09-19): **完了**。今回の範囲は TypeScript / React / Vite / Hono の
開発基盤と health RPC の接続確認まで。Herdr アダプターと操作 UI は後続 Phase で実装する。

役割分担: Astra が設計・レビュー、Terra が実装と修正、Luna が lint / format と
必要な検証コマンドの実行を担当する。

確認済み: pnpm install、typecheck、build、lint、format:check、git diff --check。
ブラウザーで health RPC 接続成功と API 停止時のエラー表示を確認した。
Astra の最終レビューで Medium 以上の問題はなかった。
Phase 1 には自動テストスイートを追加していない。境界の回帰テストは Phase 2 以降で追加する。

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
