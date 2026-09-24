import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";
import { SocketTransport } from "./socket.js";

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
