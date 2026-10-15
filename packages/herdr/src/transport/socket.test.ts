import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SocketTransport } from "./socket.js";
import { InvalidHerdrResponseError } from "../errors.js";

test("validates raw control characters and retains large escaped output", async () => {
  const socketPath = join(tmpdir(), `herdr-${randomUUID()}.sock`);
  let encodedText = "";
  let truncated: unknown = false;
  const server = createServer((socket) => {
    let incoming = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      incoming += chunk;
      if (!incoming.includes("\n")) return;
      const request = JSON.parse(incoming.trim()) as { id: string };
      socket.end(
        `{"id":${JSON.stringify(request.id)},"result":{"read":{"text":"${encodedText}","truncated":${JSON.stringify(truncated)}}}}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const transport = new SocketTransport({ socketPath, requestTimeoutMs: 3000 });
  try {
    for (const character of ["\n", "\t", "\u0000", "\u0001"]) {
      encodedText = `A${character}B`;
      await assert.rejects(
        transport.request("pane.read", {}),
        InvalidHerdrResponseError,
      );
      encodedText = JSON.stringify(`A${character}B`).slice(1, -1);
      const response = await transport.request("pane.read", {});
      assert.equal(
        (response.result.read as { text: string }).text,
        `A${character}B`,
      );
    }
    encodedText = JSON.stringify(`${'"'.repeat(700_000)}TAIL`).slice(1, -1);
    const response = await transport.request("pane.read", {});
    const read = response.result.read as { text: string; truncated: boolean };
    assert.ok(read.text.endsWith('"TAIL'));
    assert.ok(read.text.length <= 512 * 1024);
    assert.equal(read.truncated, true);
    truncated = "invalid";
    const malformed = await transport.request("pane.read", {});
    assert.equal(
      (malformed.result.read as { truncated: unknown }).truncated,
      "invalid",
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("accepts a relay challenge split before its newline", async () => {
  const token = randomBytes(32).toString("hex");
  const challenge = randomBytes(32).toString("hex");
  const server = createServer((socket) => {
    socket.write(challenge);
    setTimeout(() => socket.write("\n"), 20);

    let incoming = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      incoming = Buffer.concat([incoming, chunk]);
      const newline = incoming.indexOf(10);
      if (newline < 0) return;

      const proof = incoming.subarray(0, newline).toString("utf8");
      const expected = createHmac("sha256", token)
        .update(challenge)
        .digest("hex");
      assert.equal(proof, expected);

      const requestLine = incoming
        .subarray(newline + 1)
        .toString("utf8")
        .trim();
      const request = JSON.parse(requestLine) as { id: string };
      socket.end(`${JSON.stringify({ id: request.id, result: {} })}\n`);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const previous = {
    host: process.env.HERDR_RELAY_HOST,
    port: process.env.HERDR_RELAY_PORT,
    token: process.env.HERDR_RELAY_TOKEN,
  };

  process.env.HERDR_RELAY_HOST = "127.0.0.1";
  process.env.HERDR_RELAY_PORT = String(address.port);
  process.env.HERDR_RELAY_TOKEN = token;

  try {
    const response = await new SocketTransport().request("probe", {});
    assert.deepEqual(response.result, {});
  } finally {
    if (previous.host === undefined) delete process.env.HERDR_RELAY_HOST;
    else process.env.HERDR_RELAY_HOST = previous.host;
    if (previous.port === undefined) delete process.env.HERDR_RELAY_PORT;
    else process.env.HERDR_RELAY_PORT = previous.port;
    if (previous.token === undefined) delete process.env.HERDR_RELAY_TOKEN;
    else process.env.HERDR_RELAY_TOKEN = previous.token;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("keeps the newest output from a response larger than 16 MiB", async () => {
  const socketPath = join(tmpdir(), `herdr-${randomUUID()}.sock`);
  const server = createServer((socket) => {
    let incoming = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      incoming += chunk;
      const newline = incoming.indexOf("\n");
      if (newline < 0) return;
      const request = JSON.parse(incoming.slice(0, newline)) as { id: string };
      socket.end(
        `${JSON.stringify({
          id: request.id,
          result: {
            type: "pane_read",
            read: {
              pane_id: "pane-1",
              workspace_id: "workspace-1",
              tab_id: "tab-1",
              source: "recent_unwrapped",
              format: "text",
              text: `${"x".repeat(17 * 1024 * 1024)}TAIL`,
              revision: 1,
              truncated: false,
            },
          },
        })}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    const response = await new SocketTransport({ socketPath }).request(
      "pane.read",
      {},
    );
    const result = response.result.read as { text: string; truncated: boolean };
    assert.ok(result.text.length < 600 * 1024);
    assert.ok(result.text.endsWith("TAIL"));
    assert.equal(result.truncated, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("preserves Herdr errors returned by output read methods", async () => {
  const socketPath = join(tmpdir(), `herdr-${randomUUID()}.sock`);
  const server = createServer((socket) => {
    let incoming = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      incoming += chunk;
      const newline = incoming.indexOf("\n");
      if (newline < 0) return;
      const request = JSON.parse(incoming.slice(0, newline)) as { id: string };
      socket.end(
        `${JSON.stringify({
          id: request.id,
          error: { code: "pane_not_found", message: "Pane not found" },
        })}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    const response = await new SocketTransport({ socketPath }).request(
      "pane.read",
      {},
    );
    assert.deepEqual(response, {
      id: response.id,
      error: { code: "pane_not_found", message: "Pane not found" },
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
