import type {
  Agent,
  HerdrClient,
  HerdrClientOptions,
  Pane,
  PaneOutput,
  SpecialKey,
  Tab,
  Workspace,
} from "./domain.js";
import {
  AgentBlockedError,
  AgentNotReadyError,
  HerdrOperationError,
  HerdrTimeoutError,
  TargetNotFoundError,
  UnsupportedOperationError,
} from "./errors.js";
import {
  expectOk,
  mapAgent,
  mapPane,
  mapPaneOutput,
  mapTab,
  mapWorkspace,
  resultItem,
  resultItems,
} from "./mappers.js";
import { specialKeyNames } from "./raw/methods.js";
import type { RawResponse } from "./raw/types.js";
import { SocketTransport } from "./transport/socket.js";

export function createHerdrClient(
  options: HerdrClientOptions = {},
): HerdrClient {
  const transport = new SocketTransport(options);
  const outputLines = options.outputLines ?? 200;
  const request = async (method: string, params: Record<string, unknown>) =>
    unwrap(await transport.request(method, params));
  return {
    async listWorkspaces(): Promise<Workspace[]> {
      return resultItems(await request("workspace.list", {}), "workspaces").map(
        mapWorkspace,
      );
    },
    async listTabs(workspaceId: string): Promise<Tab[]> {
      return resultItems(
        await request("tab.list", { workspace_id: workspaceId }),
        "tabs",
      ).map(mapTab);
    },
    async listPanes(tabId: string): Promise<Pane[]> {
      const tab = mapTab(
        resultItem(await request("tab.get", { tab_id: tabId }), "tab"),
      );
      return resultItems(
        await request("pane.list", { workspace_id: tab.workspaceId }),
        "panes",
      )
        .map(mapPane)
        .filter((pane) => pane.tabId === tabId);
    },
    async readPane(paneId: string): Promise<PaneOutput> {
      return mapPaneOutput(
        resultItem(
          await request("pane.read", {
            pane_id: paneId,
            source: "recent_unwrapped",
            lines: outputLines,
            format: "text",
            strip_ansi: true,
          }),
          "read",
        ),
      );
    },
    async sendText(paneId: string, text: string): Promise<void> {
      expectOk(await request("pane.send_text", { pane_id: paneId, text }));
    },
    async sendKey(paneId: string, key: SpecialKey): Promise<void> {
      expectOk(
        await request("pane.send_keys", {
          pane_id: paneId,
          keys: [specialKeyNames[key]],
        }),
      );
    },
    async listAgents(): Promise<Agent[]> {
      return resultItems(await request("agent.list", {}), "agents").map(
        mapAgent,
      );
    },
    async readAgent(agentId: string): Promise<Agent> {
      return mapAgent(
        resultItem(await request("agent.get", { target: agentId }), "agent"),
      );
    },
    async readAgentOutput(agentId: string): Promise<PaneOutput> {
      return mapPaneOutput(
        resultItem(
          await request("agent.read", {
            target: agentId,
            source: "recent_unwrapped",
            lines: outputLines,
            format: "text",
            strip_ansi: true,
          }),
          "read",
        ),
      );
    },
    async sendPrompt(agentId: string, prompt: string): Promise<Agent> {
      return mapAgent(
        resultItem(
          await request("agent.prompt", { target: agentId, text: prompt }),
          "agent",
        ),
      );
    },
  };
}

function unwrap(response: RawResponse): Record<string, unknown> {
  if ("result" in response) return response.result;
  if (
    response.error.code === "pane_not_found" ||
    response.error.code === "agent_not_found"
  )
    throw new TargetNotFoundError(response.error.message);
  if (response.error.code === "unsupported_event_wait_match")
    throw new UnsupportedOperationError(response.error.message);
  if (response.error.code === "agent_blocked")
    throw new AgentBlockedError(response.error.message);
  if (response.error.code === "agent_not_ready")
    throw new AgentNotReadyError(response.error.message);
  if (response.error.code === "timeout")
    throw new HerdrTimeoutError(response.error.message);
  throw new HerdrOperationError(response.error.message, response.error.code);
}
