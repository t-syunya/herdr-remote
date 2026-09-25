import assert from "node:assert/strict";
import test from "node:test";

import {
  HerdrUnavailableError,
  type HerdrClient,
  type SpecialKey,
} from "@herdr/herdr";

import { createApp } from "./app.js";

function createClient(): HerdrClient {
  return {
    listWorkspaces: async () => [
      { id: "w1", label: "Main", tabCount: 1, paneCount: 1, status: "idle" },
    ],
    listTabs: async (workspaceId) => [
      {
        id: "t1",
        workspaceId,
        label: "1",
        position: 1,
        paneCount: 1,
        status: "idle",
      },
    ],
    listPanes: async (tabId) => [
      { id: "p1", workspaceId: "w1", tabId, title: "shell", status: "idle" },
    ],
    readPane: async (paneId) => ({
      paneId,
      workspaceId: "w1",
      tabId: "t1",
      text: "output",
      truncated: false,
    }),
    sendText: async () => undefined,
    sendKey: async () => undefined,
    listAgents: async () => [],
    readAgent: async () => ({
      paneId: "p1",
      workspaceId: "w1",
      tabId: "t1",
      status: "idle",
    }),
    readAgentOutput: async () => ({
      paneId: "p1",
      workspaceId: "w1",
      tabId: "t1",
      text: "output",
      truncated: false,
    }),
    sendPrompt: async () => ({
      paneId: "p1",
      workspaceId: "w1",
      tabId: "t1",
      status: "working",
    }),
  };
}

test("ナビゲーションとペイン出力を安定したモデルで返す", async () => {
  const app = createApp(createClient());

  const workspaces = await app.request("/api/workspaces");
  assert.equal(workspaces.status, 200);
  assert.deepEqual(await workspaces.json(), {
    workspaces: [
      { id: "w1", label: "Main", tabCount: 1, paneCount: 1, status: "idle" },
    ],
  });

  const output = await app.request("/api/panes/p1/output");
  assert.equal(output.status, 200);
  assert.equal((await output.json()).output.text, "output");
});

test("入力を検証して adapter に渡す", async () => {
  let sent: { paneId: string; key: SpecialKey } | undefined;
  const client = createClient();
  client.sendKey = async (paneId, key) => {
    sent = { paneId, key };
  };
  const app = createApp(client);

  const response = await app.request("/api/panes/p1/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "ctrlC" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(sent, { paneId: "p1", key: "ctrlC" });

  const optionArrowUp = await app.request("/api/panes/p1/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "optionArrowUp" }),
  });
  assert.equal(optionArrowUp.status, 200);
  assert.deepEqual(sent, { paneId: "p1", key: "optionArrowUp" });

  const invalid = await app.request("/api/panes/p1/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "deleteEverything" }),
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: { code: "invalid_input", message: "未対応の特殊キーです。" },
  });
});

test("agent target は paneId と name の一方だけを受け付ける", async () => {
  const app = createApp(createClient());
  const response = await app.request(
    "/api/agents/target?paneId=p1&name=worker",
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_input",
      message: "paneId または name のいずれか一方を指定してください。",
    },
  });
});

test("adapter の可用性エラーを browser 向けエラーへ変換する", async () => {
  const client = createClient();
  client.listWorkspaces = async () => {
    throw new HerdrUnavailableError("socket ENOENT");
  };
  const app = createApp(client);

  const response = await app.request("/api/status");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: "herdr_unavailable", message: "Herdr に接続できません。" },
  });
});
