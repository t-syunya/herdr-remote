export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export type Workspace = {
  id: string;
  label: string;
  tabCount: number;
  paneCount: number;
  status: AgentStatus;
};
export type Tab = {
  id: string;
  workspaceId: string;
  label: string;
  position: number;
  paneCount: number;
  status: AgentStatus;
};
export type Pane = {
  id: string;
  workspaceId: string;
  tabId: string;
  title: string;
  status: AgentStatus;
};
export type PaneOutput = {
  paneId: string;
  workspaceId: string;
  tabId: string;
  text: string;
  truncated: boolean;
};
export type Agent = {
  id: string;
  paneId: string;
  workspaceId: string;
  tabId: string;
  name?: string;
  kind?: string;
  interactiveReady?: boolean;
  status: AgentStatus;
};

export type SpecialKey =
  | "enter"
  | "escape"
  | "ctrlC"
  | "arrowUp"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight";
export type HerdrClientOptions = {
  socketPath?: string;
  requestTimeoutMs?: number;
  outputLines?: number;
};

export interface HerdrClient {
  listWorkspaces(): Promise<Workspace[]>;
  listTabs(workspaceId: string): Promise<Tab[]>;
  listPanes(tabId: string): Promise<Pane[]>;
  readPane(paneId: string): Promise<PaneOutput>;
  sendText(paneId: string, text: string): Promise<void>;
  sendKey(paneId: string, key: SpecialKey): Promise<void>;
  listAgents(): Promise<Agent[]>;
  readAgent(agentId: string): Promise<Agent>;
  readAgentOutput(agentId: string): Promise<PaneOutput>;
  sendPrompt(agentId: string, prompt: string): Promise<Agent>;
}
