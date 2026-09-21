import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api";

type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";
type Workspace = {
  id: string;
  label: string;
  tabCount: number;
  paneCount: number;
  status: AgentStatus;
};
type Tab = {
  id: string;
  workspaceId: string;
  label: string;
  position: number;
  paneCount: number;
  status: AgentStatus;
};
type Pane = {
  id: string;
  workspaceId: string;
  tabId: string;
  title: string;
  status: AgentStatus;
};
type Agent = {
  paneId: string;
  workspaceId: string;
  tabId: string;
  name?: string;
  kind?: string;
  interactiveReady?: boolean;
  status: AgentStatus;
};
type PaneOutput = { text: string; truncated: boolean };
type ApiFailure = { error?: { message?: string } };
type ConnectionStatus = "checking" | "connected" | "unavailable";
type Target = { kind: "pane" | "agent"; paneId: string };
type SpecialKey =
  | "enter"
  | "escape"
  | "ctrlC"
  | "arrowUp"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight";

const specialKeys: ReadonlyArray<{ key: SpecialKey; label: string }> = [
  { key: "enter", label: "Enter" },
  { key: "escape", label: "Esc" },
  { key: "ctrlC", label: "Ctrl+C" },
  { key: "arrowUp", label: "↑" },
  { key: "arrowDown", label: "↓" },
  { key: "arrowLeft", label: "←" },
  { key: "arrowRight", label: "→" },
];

async function messageFor(response: Response, fallback: string) {
  try {
    return ((await response.json()) as ApiFailure).error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function App() {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [tabId, setTabId] = useState<string>();
  const [target, setTarget] = useState<Target>();
  const [output, setOutput] = useState<PaneOutput>();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const navigationRequestId = useRef(0);
  const outputRequestId = useRef(0);

  const refreshNavigation = useCallback(async () => {
    const requestId = ++navigationRequestId.current;
    setIsRefreshing(true);
    try {
      const statusResponse = await api.api.status.$get();
      if (!statusResponse.ok)
        throw new Error(
          await messageFor(statusResponse, "Herdr に接続できません。"),
        );
      const workspacesResponse = await api.api.workspaces.$get();
      if (!workspacesResponse.ok)
        throw new Error(
          await messageFor(
            workspacesResponse,
            "ワークスペースを取得できません。",
          ),
        );
      const nextWorkspaces = (
        (await workspacesResponse.json()) as { workspaces: Workspace[] }
      ).workspaces;
      const nextWorkspaceId = nextWorkspaces.some(
        (workspace) => workspace.id === workspaceId,
      )
        ? workspaceId
        : nextWorkspaces[0]?.id;
      let nextTabs: Tab[] = [];
      let nextPanes: Pane[] = [];
      if (nextWorkspaceId) {
        const tabsResponse = await api.api.workspaces[":workspaceId"].tabs.$get(
          { param: { workspaceId: nextWorkspaceId } },
        );
        if (!tabsResponse.ok)
          throw new Error(
            await messageFor(tabsResponse, "タブを取得できません。"),
          );
        nextTabs = ((await tabsResponse.json()) as { tabs: Tab[] }).tabs;
        const nextTabId = nextTabs.some((tab) => tab.id === tabId)
          ? tabId
          : nextTabs[0]?.id;
        if (nextTabId) {
          const panesResponse = await api.api.tabs[":tabId"].panes.$get({
            param: { tabId: nextTabId },
          });
          if (!panesResponse.ok)
            throw new Error(
              await messageFor(panesResponse, "ペインを取得できません。"),
            );
          nextPanes = ((await panesResponse.json()) as { panes: Pane[] }).panes;
        }
      }
      const agentsResponse = await api.api.agents.$get();
      if (!agentsResponse.ok)
        throw new Error(
          await messageFor(agentsResponse, "Agent を取得できません。"),
        );
      if (requestId !== navigationRequestId.current) return;
      setWorkspaces(nextWorkspaces);
      setTabs(nextTabs);
      setPanes(nextPanes);
      setAgents(((await agentsResponse.json()) as { agents: Agent[] }).agents);
      setWorkspaceId(nextWorkspaceId);
      setTabId(
        nextTabs.some((tab) => tab.id === tabId) ? tabId : nextTabs[0]?.id,
      );
      setConnectionStatus("connected");
      setError(undefined);
    } catch (cause) {
      if (requestId !== navigationRequestId.current) return;
      setConnectionStatus("unavailable");
      setError(
        cause instanceof Error ? cause.message : "接続を確認できません。",
      );
    } finally {
      if (requestId === navigationRequestId.current) setIsRefreshing(false);
    }
  }, [tabId, workspaceId]);

  const refreshOutput = useCallback(async () => {
    const requestId = ++outputRequestId.current;
    if (!target) {
      setOutput(undefined);
      return;
    }
    try {
      const response =
        target.kind === "agent"
          ? await api.api.agents.output.$get({
              query: { paneId: target.paneId },
            })
          : await api.api.panes[":paneId"].output.$get({
              param: { paneId: target.paneId },
            });
      if (!response.ok)
        throw new Error(await messageFor(response, "出力を取得できません。"));
      const nextOutput = (await response.json()) as { output: PaneOutput };
      if (requestId !== outputRequestId.current) return;
      setOutput(nextOutput.output);
      setError(undefined);
    } catch (cause) {
      if (requestId !== outputRequestId.current) return;
      setError(
        cause instanceof Error ? cause.message : "出力を取得できません。",
      );
    }
  }, [target]);

  useEffect(() => {
    void refreshNavigation();
  }, [refreshNavigation]);
  useEffect(() => {
    void refreshOutput();
  }, [refreshOutput]);
  useEffect(() => {
    const interval = window.setInterval(() => void refreshOutput(), 4000);
    return () => window.clearInterval(interval);
  }, [refreshOutput]);

  async function selectWorkspace(nextWorkspaceId: string) {
    const requestId = ++navigationRequestId.current;
    ++outputRequestId.current;
    setWorkspaceId(nextWorkspaceId);
    setTabId(undefined);
    setTarget(undefined);
    setOutput(undefined);
    try {
      const response = await api.api.workspaces[":workspaceId"].tabs.$get({
        param: { workspaceId: nextWorkspaceId },
      });
      if (!response.ok)
        throw new Error(await messageFor(response, "タブを取得できません。"));
      const nextTabs = ((await response.json()) as { tabs: Tab[] }).tabs;
      if (requestId !== navigationRequestId.current) return;
      setTabs(nextTabs);
      setPanes([]);
      setTabId(nextTabs[0]?.id);
      setError(undefined);
    } catch (cause) {
      if (requestId !== navigationRequestId.current) return;
      setError(
        cause instanceof Error ? cause.message : "タブを取得できません。",
      );
    }
  }

  async function selectTab(nextTabId: string) {
    const requestId = ++navigationRequestId.current;
    ++outputRequestId.current;
    setTabId(nextTabId);
    setTarget(undefined);
    setOutput(undefined);
    try {
      const response = await api.api.tabs[":tabId"].panes.$get({
        param: { tabId: nextTabId },
      });
      if (!response.ok)
        throw new Error(await messageFor(response, "ペインを取得できません。"));
      const nextPanes = (await response.json()) as { panes: Pane[] };
      if (requestId !== navigationRequestId.current) return;
      setPanes(nextPanes.panes);
      setError(undefined);
    } catch (cause) {
      if (requestId !== navigationRequestId.current) return;
      setError(
        cause instanceof Error ? cause.message : "ペインを取得できません。",
      );
    }
  }

  function selectTarget(nextTarget: Target) {
    ++outputRequestId.current;
    setTarget(nextTarget);
    setOutput(undefined);
  }

  async function sendText() {
    if (!target || input.length === 0) return;
    setIsSending(true);
    try {
      const response =
        target.kind === "agent"
          ? await api.api.agents.prompt.$post({
              json: { paneId: target.paneId, prompt: input },
            })
          : await api.api.panes[":paneId"].text.$post(
              {
                param: { paneId: target.paneId },
              },
              {
                init: {
                  body: JSON.stringify({ text: input }),
                  headers: { "content-type": "application/json" },
                },
              },
            );
      if (!response.ok)
        throw new Error(await messageFor(response, "送信できません。"));
      setInput("");
      setError(undefined);
      void refreshOutput();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "送信できません。");
    } finally {
      setIsSending(false);
    }
  }

  async function sendKey(key: SpecialKey) {
    if (!target) return;
    setIsSending(true);
    try {
      const response = await api.api.panes[":paneId"].key.$post(
        {
          param: { paneId: target.paneId },
        },
        {
          init: {
            body: JSON.stringify({ key }),
            headers: { "content-type": "application/json" },
          },
        },
      );
      if (!response.ok)
        throw new Error(await messageFor(response, "キーを送信できません。"));
      setError(undefined);
      void refreshOutput();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "キーを送信できません。",
      );
    } finally {
      setIsSending(false);
    }
  }

  const selectedAgent =
    target?.kind === "agent"
      ? agents.find((agent) => agent.paneId === target.paneId)
      : undefined;
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">REMOTE CONTROL</p>
          <h1>Herdr Remote</h1>
        </div>
        <button
          className="refresh-button"
          onClick={() => void refreshNavigation()}
          type="button"
        >
          {isRefreshing ? "更新中" : "更新"}
        </button>
      </header>
      <p
        className={`connection connection--${connectionStatus}`}
        aria-live="polite"
      >
        {connectionStatus === "checking" && "Herdr を確認中"}
        {connectionStatus === "connected" && "Herdr に接続中"}
        {connectionStatus === "unavailable" && "Herdr に接続できません"}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="selection-panel" aria-label="操作対象を選択">
        <label>
          ワークスペース
          <select
            value={workspaceId ?? ""}
            onChange={(event) => void selectWorkspace(event.target.value)}
          >
            <option value="" disabled>
              選択してください
            </option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.label}
              </option>
            ))}
          </select>
        </label>
        <div className="tab-list" aria-label="タブ">
          {tabs.map((tab) => (
            <button
              className={tab.id === tabId ? "selected" : ""}
              key={tab.id}
              onClick={() => void selectTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="target-list" aria-label="ペイン">
          {panes.map((pane) => (
            <button
              className={
                target?.kind === "pane" && target.paneId === pane.id
                  ? "target selected"
                  : "target"
              }
              key={pane.id}
              onClick={() => selectTarget({ kind: "pane", paneId: pane.id })}
              type="button"
            >
              <span>{pane.title}</span>
              <Status status={pane.status} />
            </button>
          ))}
        </div>
      </section>
      <section className="agents" aria-label="Agent">
        <h2>Agent</h2>
        <div className="target-list">
          {agents.map((agent) => (
            <button
              className={
                target?.kind === "agent" && target.paneId === agent.paneId
                  ? "target selected"
                  : "target"
              }
              key={agent.paneId}
              onClick={() =>
                selectTarget({ kind: "agent", paneId: agent.paneId })
              }
              type="button"
            >
              <span>{agent.name ?? agent.kind ?? "名前のない Agent"}</span>
              <Status status={agent.status} />
            </button>
          ))}
          {agents.length === 0 && (
            <p className="empty">Agent は見つかりません。</p>
          )}
        </div>
      </section>
      <section className="output-panel" aria-label="出力">
        <div className="section-heading">
          <h2>出力</h2>
          {selectedAgent && <Status status={selectedAgent.status} />}
        </div>
        {!target && (
          <p className="empty">ペインまたは Agent を選択してください。</p>
        )}
        {target && !output && <p className="empty">出力を読み込んでいます。</p>}
        {output && <pre>{output.text || "（出力はありません）"}</pre>}
        {output?.truncated && (
          <p className="hint">表示は直近の出力に省略されています。</p>
        )}
      </section>
      <section className="controls" aria-label="入力">
        <label htmlFor="command">
          {target?.kind === "agent" ? "Agent へのプロンプト" : "テキストを送信"}
        </label>
        <textarea
          disabled={!target || isSending}
          id="command"
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            target ? "入力してください" : "先に操作対象を選択してください"
          }
          value={input}
        />
        <button
          className="send-button"
          disabled={!target || input.length === 0 || isSending}
          onClick={() => void sendText()}
          type="button"
        >
          {isSending ? "送信中…" : "送信"}
        </button>
        <div className="key-grid" aria-label="特殊キー">
          {specialKeys.map(({ key, label }) => (
            <button
              disabled={!target || isSending}
              key={key}
              onClick={() => void sendKey(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function Status({ status }: { status: AgentStatus }) {
  const labels: Record<AgentStatus, string> = {
    idle: "待機中",
    working: "作業中",
    blocked: "対応待ち",
    done: "完了",
    unknown: "不明",
  };
  return <span className={`status status--${status}`}>{labels[status]}</span>;
}
