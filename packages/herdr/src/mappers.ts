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
const maxOutputLines = 200;
const maxOutputBytes = 256 * 1024;

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
    ...(typeof raw.active_tab_id === "string"
      ? { activeTabId: raw.active_tab_id }
      : {}),
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
  const limited = limitOutputText(string(raw.text, "text"));
  return {
    paneId: string(raw.pane_id, "pane_id"),
    workspaceId: string(raw.workspace_id, "workspace_id"),
    tabId: string(raw.tab_id, "tab_id"),
    text: limited.text,
    truncated: raw.truncated || limited.truncated,
  };
}

function limitOutputText(text: string) {
  let limitedText = text;
  let truncated = false;
  let lineBreaks = 0;

  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text.charCodeAt(index) !== 10) continue;
    lineBreaks += 1;
    if (lineBreaks === maxOutputLines) {
      limitedText = text.slice(index + 1);
      truncated = true;
      break;
    }
  }

  let start = limitedText.length;
  let byteLength = 0;
  while (start > 0) {
    let characterStart = start - 1;
    const lastCodeUnit = limitedText.charCodeAt(characterStart);
    let characterBytes: number;

    if (lastCodeUnit >= 0xdc00 && lastCodeUnit <= 0xdfff) {
      const previousCodeUnit =
        characterStart > 0 ? limitedText.charCodeAt(characterStart - 1) : 0;
      if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
        characterStart -= 1;
        characterBytes = 4;
      } else {
        characterBytes = 3;
      }
    } else if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
      characterBytes = 3;
    } else if (lastCodeUnit <= 0x7f) {
      characterBytes = 1;
    } else if (lastCodeUnit <= 0x7ff) {
      characterBytes = 2;
    } else {
      characterBytes = 3;
    }

    if (byteLength + characterBytes > maxOutputBytes) {
      truncated = true;
      break;
    }
    byteLength += characterBytes;
    start = characterStart;
  }

  if (start > 0) {
    limitedText = limitedText.slice(start);
    truncated = true;
  }

  return { text: limitedText, truncated };
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
