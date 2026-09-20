import type {
  Agent,
  AgentStatus,
  Pane,
  PaneOutput,
  Tab,
  Workspace,
} from "./domain.js";
import { InvalidHerdrResponseError } from "./errors.js";
type RawRecord = Record<string, unknown>;
function record(value: unknown, context: string): RawRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new InvalidHerdrResponseError(`${context} の形式が不正です。`);
  return value as RawRecord;
}
function string(value: unknown, context: string): string {
  if (typeof value !== "string")
    throw new InvalidHerdrResponseError(`${context} がありません。`);
  return value;
}
function number(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new InvalidHerdrResponseError(`${context} の形式が不正です。`);
  return value;
}
export function normalizeAgentStatus(value: unknown): AgentStatus {
  return value === "idle" ||
    value === "working" ||
    value === "blocked" ||
    value === "done"
    ? value
    : "unknown";
}
export function mapWorkspace(value: unknown): Workspace {
  const raw = record(value, "workspace");
  return {
    id: string(raw.workspace_id, "workspace_id"),
    label: typeof raw.label === "string" ? raw.label : "",
    tabCount: number(raw.tab_count, "tab_count"),
    paneCount: number(raw.pane_count, "pane_count"),
    status: normalizeAgentStatus(raw.agent_status),
  };
}
export function mapTab(value: unknown): Tab {
  const raw = record(value, "tab");
  return {
    id: string(raw.tab_id, "tab_id"),
    workspaceId: string(raw.workspace_id, "workspace_id"),
    label: typeof raw.label === "string" ? raw.label : "",
    position: number(raw.number, "number"),
    paneCount: number(raw.pane_count, "pane_count"),
    status: normalizeAgentStatus(raw.agent_status),
  };
}
export function mapPane(value: unknown): Pane {
  const raw = record(value, "pane");
  const id = string(raw.pane_id, "pane_id");
  return {
    id,
    workspaceId: string(raw.workspace_id, "workspace_id"),
    tabId: string(raw.tab_id, "tab_id"),
    title: typeof raw.title === "string" ? raw.title : id,
    status: normalizeAgentStatus(raw.agent_status),
  };
}
export function mapAgent(value: unknown): Agent {
  const raw = record(value, "agent");
  const paneId = string(raw.pane_id, "pane_id");
  return {
    paneId,
    workspaceId: string(raw.workspace_id, "workspace_id"),
    tabId: string(raw.tab_id, "tab_id"),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.agent === "string" ? { kind: raw.agent } : {}),
    ...(typeof raw.interactive_ready === "boolean"
      ? { interactiveReady: raw.interactive_ready }
      : {}),
    status: normalizeAgentStatus(raw.agent_status),
  };
}
export function mapPaneOutput(value: unknown): PaneOutput {
  const raw = record(value, "pane read");
  if (typeof raw.truncated !== "boolean")
    throw new InvalidHerdrResponseError("truncated の形式が不正です。");
  return {
    paneId: string(raw.pane_id, "pane_id"),
    workspaceId: string(raw.workspace_id, "workspace_id"),
    tabId: string(raw.tab_id, "tab_id"),
    text: string(raw.text, "text"),
    truncated: raw.truncated,
  };
}
export function resultItems(result: RawRecord, key: string): unknown[] {
  if (!Array.isArray(result[key]))
    throw new InvalidHerdrResponseError(`${key} の形式が不正です。`);
  return result[key];
}
export function resultItem(result: RawRecord, key: string): unknown {
  if (!(key in result))
    throw new InvalidHerdrResponseError(`${key} がありません。`);
  return result[key];
}

export function expectOk(result: RawRecord): void {
  expectResultType(result, "ok");
}

export function expectResultType(
  result: RawRecord,
  expectedType: string,
): RawRecord {
  if (result.type !== expectedType)
    throw new InvalidHerdrResponseError("Herdr の応答種別が不正です。");
  return result;
}
