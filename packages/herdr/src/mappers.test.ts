import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import test from "node:test";
import { createHerdrClient } from "./client.js";
import {
  AgentBlockedError,
  HerdrAccessDeniedError,
  HerdrOperationError,
  InvalidHerdrResponseError,
  TransportDisconnectedError,
} from "./errors.js";
import {
  expectOk,
  expectResultType,
  mapAgent,
  mapPaneOutput,
  mapTab,
  mapWorkspace,
  normalizeAgentStatus,
} from "./mappers.js";
import { specialKeyNames } from "./raw/methods.js";
import {
  mapSocketConnectionError,
  SocketTransport,
} from "./transport/socket.js";

async function withSocketPath<T>(
  socketPath: string,
  callback: () => Promise<T>,
) {
  const previous = process.env.HERDR_SOCKET_PATH;
  process.env.HERDR_SOCKET_PATH = socketPath;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.HERDR_SOCKET_PATH;
    else process.env.HERDR_SOCKET_PATH = previous;
  }
}

function requestPayload(chunk: Buffer): {
  id: string;
  params: Record<string, unknown>;
} {
  const request: unknown = JSON.parse(chunk.toString("utf8"));
  assert.equal(typeof request, "object");
  assert.notEqual(request, null);
  assert.equal(Array.isArray(request), false);
  assert.equal(typeof (request as { id?: unknown }).id, "string");
  assert.equal(typeof (request as { params?: unknown }).params, "object");
  return request as { id: string; params: Record<string, unknown> };
}

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

test("必須の数値メタデータが不正な Workspace と Tab を拒否する", () => {
  assert.throws(
    () =>
      mapWorkspace({
        workspace_id: "w1",
        tab_count: "1",
        pane_count: 1,
      }),
    InvalidHerdrResponseError,
  );
  assert.throws(
    () =>
      mapTab({
        tab_id: "w1:t1",
        workspace_id: "w1",
        number: 1,
        pane_count: Number.NaN,
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

test("ソケットの権限エラーを安定エラーへ変換する", () => {
  assert.ok(
    mapSocketConnectionError({ code: "EACCES" }) instanceof
      HerdrAccessDeniedError,
  );
  assert.ok(
    mapSocketConnectionError({ code: "EPERM" }) instanceof
      HerdrAccessDeniedError,
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
    await withSocketPath(socketPath, async () =>
      assert.rejects(
        createHerdrClient().listWorkspaces(),
        InvalidHerdrResponseError,
      ),
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
  const server = createServer((socket) => {
    socket.once("data", (chunk: Buffer) => {
      const response = Buffer.from(
        `${JSON.stringify({
          id: requestPayload(chunk).id,
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
      socket.write(response.subarray(0, splitAt));
      setTimeout(() => socket.end(response.subarray(splitAt)), 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    const workspaces = await withSocketPath(socketPath, () =>
      createHerdrClient().listWorkspaces(),
    );
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
    socket.once("data", (chunk: Buffer) => {
      const request = requestPayload(chunk);
      assert.equal(request.params.target, "w1:p1");
      socket.end(
        `${JSON.stringify({
          id: request.id,
          error: { code: "agent_blocked", message: "agent is blocked" },
        })}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    await withSocketPath(socketPath, async () =>
      assert.rejects(
        createHerdrClient().sendPrompt({ paneId: "w1:p1" }, "continue"),
        AgentBlockedError,
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("未知の Herdr エラーコードを公開しない", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const server = createServer((socket) => {
    socket.once("data", (chunk: Buffer) =>
      socket.end(
        `${JSON.stringify({
          id: requestPayload(chunk).id,
          error: { code: "future_error", message: "operation failed" },
        })}\n`,
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    await withSocketPath(socketPath, async () =>
      assert.rejects(createHerdrClient().listWorkspaces(), (error: unknown) => {
        assert.ok(error instanceof HerdrOperationError);
        assert.equal("code" in error, false);
        return true;
      }),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("Agent 名を明示した操作対象を Herdr に送る", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const server = createServer((socket) => {
    socket.once("data", (chunk: Buffer) => {
      const request = requestPayload(chunk);
      assert.deepEqual(request.params, { target: "worker", text: "continue" });
      socket.end(
        `${JSON.stringify({
          id: request.id,
          result: {
            type: "agent_prompted",
            agent: {
              pane_id: "w1:p1",
              workspace_id: "w1",
              tab_id: "w1:t1",
              name: "worker",
              agent_status: "idle",
            },
          },
        })}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    const agent = await withSocketPath(socketPath, () =>
      createHerdrClient().sendPrompt({ name: "worker" }, "continue"),
    );
    assert.equal(agent.paneId, "w1:p1");
    assert.equal(agent.name, "worker");
    assert.equal("id" in agent, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("ID がない、または不一致のソケット応答を拒否する", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const responses = [
    { result: { type: "workspace_list", workspaces: [] } },
    {
      id: "another-request",
      result: { type: "workspace_list", workspaces: [] },
    },
  ];
  const server = createServer((socket) => {
    socket.once("data", () =>
      socket.end(`${JSON.stringify(responses.shift())}\n`),
    );
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    const transport = new SocketTransport({ socketPath });
    await assert.rejects(
      transport.request("workspace.list", {}),
      InvalidHerdrResponseError,
    );
    await assert.rejects(
      transport.request("workspace.list", {}),
      InvalidHerdrResponseError,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("継続的な部分応答でも総合デッドラインで切断する", async () => {
  const directory = await mkdtemp(`${tmpdir()}/herdr-adapter-test-`);
  const socketPath = `${directory}/herdr.sock`;
  const server = createServer((socket) => {
    socket.once("data", () => {
      const interval = setInterval(() => {
        if (socket.destroyed) clearInterval(interval);
        else socket.write(".");
      }, 1);
      const stop = () => clearInterval(interval);
      socket.once("close", stop);
      socket.once("error", stop);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    await assert.rejects(
      new SocketTransport({ socketPath, requestTimeoutMs: 30 }).request(
        "workspace.list",
        {},
      ),
      TransportDisconnectedError,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
