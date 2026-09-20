import { Hono } from "hono";
import {
  AgentBlockedError,
  AgentNotReadyError,
  HerdrAccessDeniedError,
  HerdrOperationError,
  HerdrTimeoutError,
  HerdrUnavailableError,
  InvalidHerdrResponseError,
  TargetNotFoundError,
  TransportDisconnectedError,
  UnsupportedOperationError,
  createHerdrClient,
} from "@herdr/herdr";
import type { AgentTarget, HerdrClient, SpecialKey } from "@herdr/herdr";

const specialKeys = [
  "enter",
  "escape",
  "ctrlC",
  "arrowUp",
  "arrowDown",
  "arrowLeft",
  "arrowRight",
] as const satisfies readonly SpecialKey[];

type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export function createApp(client: HerdrClient = createHerdrClient()) {
  return new Hono()
    .onError((error, context) => {
      const { status, code, message } = apiError(error);
      return context.json<ApiError>({ error: { code, message } }, status);
    })
    .get("/api/health", (context) => context.json({ status: "ok" as const }))
    .get("/api/status", async (context) => {
      await client.listWorkspaces();
      return context.json({ status: "available" as const });
    })
    .get("/api/workspaces", async (context) =>
      context.json({ workspaces: await client.listWorkspaces() }),
    )
    .get("/api/workspaces/:workspaceId/tabs", async (context) =>
      context.json({
        tabs: await client.listTabs(requiredParam(context, "workspaceId")),
      }),
    )
    .get("/api/tabs/:tabId/panes", async (context) =>
      context.json({
        panes: await client.listPanes(requiredParam(context, "tabId")),
      }),
    )
    .get("/api/panes/:paneId/output", async (context) =>
      context.json({
        output: await client.readPane(requiredParam(context, "paneId")),
      }),
    )
    .post("/api/panes/:paneId/text", async (context) => {
      const body = await jsonBody(context);
      const text = requiredString(body.text, "text");
      await client.sendText(requiredParam(context, "paneId"), text);
      return context.json({ status: "sent" as const });
    })
    .post("/api/panes/:paneId/key", async (context) => {
      const body = await jsonBody(context);
      const key = requiredSpecialKey(body.key);
      await client.sendKey(requiredParam(context, "paneId"), key);
      return context.json({ status: "sent" as const });
    })
    .get("/api/agents", async (context) =>
      context.json({ agents: await client.listAgents() }),
    )
    .get("/api/agents/target", async (context) =>
      context.json({
        agent: await client.readAgent(agentTarget(context.req.query())),
      }),
    )
    .get("/api/agents/output", async (context) =>
      context.json({
        output: await client.readAgentOutput(agentTarget(context.req.query())),
      }),
    )
    .post("/api/agents/prompt", async (context) => {
      const body = await jsonBody(context);
      await client.sendPrompt(
        agentTarget(body),
        requiredString(body.prompt, "prompt"),
      );
      return context.json({ status: "sent" as const });
    });
}

export const app = createApp();

export type AppType = typeof app;

function requiredParam(
  context: { req: { param(name: string): string } },
  name: string,
) {
  return requiredString(context.req.param(name), name);
}

async function jsonBody(context: { req: { json(): Promise<unknown> } }) {
  try {
    const body: unknown = await context.req.json();
    if (isRecord(body)) return body;
  } catch {
    // The common validation path below returns the public API error shape.
  }
  throw new InvalidInputError("JSON オブジェクトを指定してください。");
}

function agentTarget(value: Record<string, unknown>): AgentTarget {
  const paneId = optionalString(value.paneId);
  const name = optionalString(value.name);
  if (
    (paneId === undefined && name === undefined) ||
    (paneId !== undefined && name !== undefined)
  ) {
    throw new InvalidInputError(
      "paneId または name のいずれか一方を指定してください。",
    );
  }
  return paneId === undefined ? { name: name! } : { paneId };
}

function requiredSpecialKey(value: unknown): SpecialKey {
  if (typeof value === "string" && specialKeys.includes(value as SpecialKey)) {
    return value as SpecialKey;
  }
  throw new InvalidInputError("未対応の特殊キーです。");
}

function requiredString(value: unknown, name: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new InvalidInputError(`${name} は空でない文字列で指定してください。`);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, "target");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class InvalidInputError extends Error {}

function apiError(error: unknown): {
  status: 400 | 403 | 404 | 409 | 501 | 502 | 503 | 504;
  code: string;
  message: string;
} {
  if (error instanceof InvalidInputError) {
    return { status: 400, code: "invalid_input", message: error.message };
  }
  if (error instanceof HerdrAccessDeniedError) {
    return {
      status: 403,
      code: "access_denied",
      message: "Herdr へのアクセスが拒否されました。",
    };
  }
  if (error instanceof TargetNotFoundError) {
    return {
      status: 404,
      code: "target_not_found",
      message: "操作対象が見つかりません。",
    };
  }
  if (error instanceof AgentBlockedError) {
    return {
      status: 409,
      code: "agent_blocked",
      message: "Agent は入力待ちのため操作できません。",
    };
  }
  if (error instanceof AgentNotReadyError) {
    return {
      status: 409,
      code: "agent_not_ready",
      message: "Agent はまだ操作できる状態ではありません。",
    };
  }
  if (error instanceof UnsupportedOperationError) {
    return {
      status: 501,
      code: "unsupported_operation",
      message: "Herdr はこの操作をサポートしていません。",
    };
  }
  if (
    error instanceof InvalidHerdrResponseError ||
    error instanceof HerdrOperationError
  ) {
    return {
      status: 502,
      code: "herdr_error",
      message: "Herdr から有効な応答を取得できませんでした。",
    };
  }
  if (
    error instanceof HerdrUnavailableError ||
    error instanceof TransportDisconnectedError
  ) {
    return {
      status: 503,
      code: "herdr_unavailable",
      message: "Herdr に接続できません。",
    };
  }
  if (error instanceof HerdrTimeoutError) {
    return {
      status: 504,
      code: "herdr_timeout",
      message: "Herdr の応答がタイムアウトしました。",
    };
  }
  return {
    status: 502,
    code: "internal_error",
    message: "サーバーで予期しないエラーが発生しました。",
  };
}
