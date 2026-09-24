import { connect, createServer, isIP } from "node:net";

const host = process.env.DEV_HOST;
const port = Number(process.env.WEB_PORT ?? "5173");
const targetHost = "127.0.0.1";
const targetPort = Number(process.env.WEB_TARGET_PORT ?? "5174");
const sockets = new Set();

const octets = host?.split(".").map(Number);
if (
  !host ||
  isIP(host) !== 4 ||
  !octets ||
  octets[0] !== 100 ||
  octets[1] < 64 ||
  octets[1] > 127
) {
  throw new Error("DEV_HOST must be the Mac's Tailscale IP address.");
}

const server = createServer((client) => {
  const upstream = connect(targetPort, targetHost);
  sockets.add(client);
  sockets.add(upstream);
  client.on("close", () => sockets.delete(client));
  upstream.on("close", () => sockets.delete(upstream));
  client.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
  upstream.on("close", () => client.destroy());
  client.pipe(upstream);
  upstream.pipe(client);
});

server.on("error", (error) => {
  console.error(`Tailscale web proxy failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Tailscale web proxy listening on ${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const socket of sockets) socket.destroy();
    server.close(() => process.exit(0));
  });
}
