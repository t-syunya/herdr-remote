import { homedir } from "node:os";
import { connect } from "node:net";
import { createHmac, randomUUID } from "node:crypto";
import {
  HerdrAccessDeniedError,
  HerdrUnavailableError,
  InvalidHerdrResponseError,
  TransportDisconnectedError,
} from "../errors.js";
import type { RawRequest, RawResponse } from "../raw/types.js";

const defaultTimeoutMs = 10_000;
const maxResponseBytes = 4 * 1024 * 1024;

export class SocketTransport {
  readonly socketPath: string;
  readonly requestTimeoutMs: number;
  readonly relayHost?: string;
  readonly relayPort?: number;
  readonly relayToken?: string;

  constructor(
    options: { socketPath?: string; requestTimeoutMs?: number } = {},
  ) {
    this.socketPath =
      options.socketPath ??
      process.env.HERDR_SOCKET_PATH ??
      `${homedir()}/.config/herdr/herdr.sock`;
    this.relayHost = process.env.HERDR_RELAY_HOST;
    const relayPort = process.env.HERDR_RELAY_PORT;
    this.relayPort = relayPort ? Number(relayPort) : undefined;
    this.relayToken = process.env.HERDR_RELAY_TOKEN;
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultTimeoutMs;
  }

  request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<RawResponse> {
    const request: RawRequest = { id: randomUUID(), method, params };
    return new Promise((resolve, reject) => {
      const socket =
        this.relayHost && this.relayPort && this.relayToken
          ? connect(this.relayPort, this.relayHost)
          : connect(this.socketPath);
      const usesRelay = Boolean(
        this.relayHost && this.relayPort && this.relayToken,
      );
      const payload = `${JSON.stringify(request)}\n`;
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      let settled = false;
      let relayChallenge = Buffer.alloc(0);
      let awaitingRelayChallenge = usesRelay;
      const finish = (callback: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(deadline);
          socket.destroy();
          callback();
        }
      };
      const deadline = setTimeout(
        () =>
          finish(() =>
            reject(
              new TransportDisconnectedError(
                "Herdr からの応答がタイムアウトしました。",
              ),
            ),
          ),
        this.requestTimeoutMs,
      );
      socket.setTimeout(this.requestTimeoutMs);
      socket.on("connect", () => {
        if (!usesRelay) socket.write(payload);
      });
      const collectResponse = (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxResponseBytes) {
          finish(() =>
            reject(
              new InvalidHerdrResponseError(
                "Herdr の応答が許容サイズを超えました。",
              ),
            ),
          );
          return;
        }
        chunks.push(chunk);
      };
      socket.on("data", (chunk: Buffer) => {
        if (awaitingRelayChallenge) {
          relayChallenge = Buffer.concat([relayChallenge, chunk]);
          const newline = relayChallenge.indexOf(10);
          if (newline < 0) {
            if (relayChallenge.length > 128) {
              finish(() =>
                reject(new InvalidHerdrResponseError("中継の応答が不正です。")),
              );
            }
            return;
          }
          awaitingRelayChallenge = false;

          const challenge = relayChallenge
            .subarray(0, newline)
            .toString("utf8");
          if (!/^[a-f0-9]{64}$/.test(challenge) || !this.relayToken) {
            finish(() =>
              reject(new InvalidHerdrResponseError("中継の応答が不正です。")),
            );
            return;
          }
          const pendingResponse = relayChallenge.subarray(newline + 1);
          socket.write(
            `${createHmac("sha256", this.relayToken).update(challenge).digest("hex")}\n${payload}`,
          );
          if (pendingResponse.length) collectResponse(pendingResponse);
          return;
        } else collectResponse(chunk);
      });
      socket.on("timeout", () =>
        finish(() =>
          reject(
            new TransportDisconnectedError(
              "Herdr からの応答がタイムアウトしました。",
            ),
          ),
        ),
      );
      socket.on("error", (error: NodeJS.ErrnoException) =>
        finish(() => reject(mapSocketConnectionError(error))),
      );
      socket.on("end", () =>
        finish(() => {
          if (receivedBytes === 0) {
            reject(
              new TransportDisconnectedError(
                "Herdr から応答される前に接続が切断されました。",
              ),
            );
            return;
          }
          try {
            resolve(
              parseResponse(Buffer.concat(chunks).toString("utf8"), request.id),
            );
          } catch (error) {
            reject(error);
          }
        }),
      );
    });
  }
}

function parseResponse(payload: string, requestId: string): RawResponse {
  const lines = payload.trim().split("\n");
  if (lines.length !== 1 || !lines[0])
    throw new InvalidHerdrResponseError("Herdr の応答が不正です。");
  try {
    const parsed: unknown = JSON.parse(lines[0]);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("not an object");
    const response = parsed as Record<string, unknown>;
    if (response.id !== requestId)
      throw new InvalidHerdrResponseError("Herdr の応答 ID が不正です。");
    if (
      typeof response.result === "object" &&
      response.result !== null &&
      !Array.isArray(response.result)
    )
      return {
        id: response.id,
        result: response.result as Record<string, unknown>,
      };
    if (
      typeof response.error === "object" &&
      response.error !== null &&
      !Array.isArray(response.error)
    ) {
      const error = response.error as Record<string, unknown>;
      if (typeof error.code === "string" && typeof error.message === "string")
        return {
          id: response.id,
          error: { code: error.code, message: error.message },
        };
    }
  } catch {
    throw new InvalidHerdrResponseError("Herdr の応答を解析できません。");
  }
  throw new InvalidHerdrResponseError("Herdr の応答形式が不正です。");
}

export function mapSocketConnectionError(error: NodeJS.ErrnoException): Error {
  if (error.code === "ENOENT" || error.code === "ECONNREFUSED")
    return new HerdrUnavailableError("Herdr に接続できません。", {
      cause: error,
    });
  if (error.code === "EACCES" || error.code === "EPERM")
    return new HerdrAccessDeniedError(
      "Herdr のソケットへアクセスできません。",
      {
        cause: error,
      },
    );
  return new TransportDisconnectedError("Herdr との接続が切断されました。", {
    cause: error,
  });
}
