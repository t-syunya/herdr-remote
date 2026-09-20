import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import test from "node:test";
import { createHerdrClient } from "./client.js";
import { AgentBlockedError, InvalidHerdrResponseError } from "./errors.js";
import {
  expectOk,
  expectResultType,
  mapAgent,
  mapPaneOutput,
  normalizeAgentStatus,
} from "./mappers.js";
import { specialKeyNames } from "./raw/methods.js";

test("未知の Agent 状態は unknown に正規化する", () => {
  assert.equal(normalizeAgentStatus("working"), "working");
  assert.equal(normalizeAgentStatus("future-status"), "unknown");
});

test("特殊キーを Herdr の論理キーへ変換する", () => {
  assert.deepEqual(specialKeyNames, {
    enter: "enter",
    escape: "esc",
    ctrlC: "ctrl+c",
    arrowUp: "up",
    arrowDown: "down",
    arrowLeft: "left",
    arrowRight: "right",
  });
});

test("Agent の optional フィールドを安定モデルへ変換する", () => {
  assert.deepEqual(
    mapAgent({
      pane_id: "w1:p1",
      workspace_id: "w1",
      tab_id: "w1:t1",
      agent_status: "idle",
      name: "worker",
      interactive_ready: true,
    }),
    {
      id: "w1:p1",
      paneId: "w1:p1",
      workspaceId: "w1",
      tabId: "w1:t1",
      name: "worker",
      interactiveReady: true,
      status: "idle",
    },
  );
});

test("必須フィールドのない出力を拒否する", () => {
  assert.throws(
    () => mapPaneOutput({ pane_id: "w1:p1", text: "partial" }),
    InvalidHerdrResponseError,
  );
});

test("truncated が boolean でない出力を拒否する", () => {
  assert.throws(
    () =>
      mapPaneOutput({
        pane_id: "w1:p1",
        workspace_id: "w1",
        tab_id: "w1:t1",
        text: "partial",
        truncated: "false",
      }),
    InvalidHerdrResponseError,
  );
});

test("入力の想定外の応答を拒否する", () => {
  assert.throws(
    () => expectOk({ type: "unexpected" }),
    InvalidHerdrResponseError,
  );
});

test("期待しない成功応答種別を拒否する", () => {
  assert.throws(
    () => expectResultType({ type: "future_workspace_list" }, "workspace_list"),
    InvalidHerdrResponseError,
  );
});

test("壊れたソケット応答をアダプター境界で拒否する", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const server = createServer((socket) => {
    socket.once("data", () => socket.end("not-json\n"));
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    await assert.rejects(
      createHerdrClient({ socketPath }).listWorkspaces(),
      InvalidHerdrResponseError,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("分割された UTF-8 応答を壊さずに読み取る", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const response = Buffer.from(
    `${JSON.stringify({
      id: "workspace-list",
      result: {
        type: "workspace_list",
        workspaces: [
          {
            workspace_id: "w1",
            label: "日本語",
            tab_count: 1,
            pane_count: 1,
            agent_status: "idle",
          },
        ],
      },
    })}\n`,
  );
  const splitAt = response.indexOf(Buffer.from("日")) + 1;
  const server = createServer((socket) => {
    socket.once("data", () => {
      socket.write(response.subarray(0, splitAt));
      setTimeout(() => socket.end(response.subarray(splitAt)), 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    const workspaces = await createHerdrClient({ socketPath }).listWorkspaces();
    assert.equal(workspaces[0]?.label, "日本語");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("既知の Agent prompt 拒否を安定エラーへ変換する", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const server = createServer((socket) => {
    socket.once("data", () =>
      socket.end(
        `${JSON.stringify({
          id: "agent-prompt",
          error: { code: "agent_blocked", message: "agent is blocked" },
        })}\n`,
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    await assert.rejects(
      createHerdrClient({ socketPath }).sendPrompt("w1:p1", "continue"),
      AgentBlockedError,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
