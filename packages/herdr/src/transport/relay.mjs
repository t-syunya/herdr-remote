import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { connect, createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const socketPath =
  process.env.HERDR_SOCKET_PATH || join(homedir(), ".config/herdr/herdr.sock");
const host = "127.0.0.1";
const port = Number(process.env.HERDR_RELAY_PORT ?? "18787");
const token = process.env.HERDR_RELAY_TOKEN;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("HERDR_RELAY_PORT must be a valid TCP port.");
}
if (!token) throw new Error("HERDR_RELAY_TOKEN is required.");

const server = createServer((client) => {
  let authenticated = false;
  let header = Buffer.alloc(0);
  let herdr;
  const challenge = randomBytes(32).toString("hex");

  client.on("error", () => herdr?.destroy());
  client.on("close", () => herdr?.destroy());
  client.setTimeout(5_000, () => client.destroy());
  client.write(`${challenge}\n`);

  client.on("data", (chunk) => {
    if (authenticated) return;
    header = Buffer.concat([header, chunk]);
    const newline = header.indexOf(10);
    if (newline < 0) {
      if (header.length > 1024) client.destroy();
      return;
    }

    const presentedProof = header.subarray(0, newline).toString("utf8");
    const expected = createHmac("sha256", token).update(challenge).digest();
    const actual = Buffer.from(presentedProof, "hex");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      client.destroy();
      return;
    }

    authenticated = true;
    client.setTimeout(0);
    const pendingRequest = header.subarray(newline + 1);
    client.pause();
    herdr = connect(socketPath);
    herdr.on("error", () => client.destroy());
    herdr.on("connect", () => {
      if (pendingRequest.length) herdr.write(pendingRequest);
      client.pipe(herdr);
      herdr.pipe(client);
      client.resume();
    });
  });
});

server.on("error", (error) => {
  console.error(`Herdr socket relay failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Herdr socket relay listening on ${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
