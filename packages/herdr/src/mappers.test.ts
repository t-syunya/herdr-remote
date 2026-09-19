import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import test from "node:test";
import { createHerdrClient } from "./client.js";
import { InvalidHerdrResponseError } from "./errors.js";
import { mapAgent, mapPaneOutput, normalizeAgentStatus } from "./mappers.js";
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
