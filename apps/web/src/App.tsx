import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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
type OutputAnchor = {
  line: string;
  before: string[];
  after: string[];
  offset: number;
};
type SpecialKey =
  | "enter"
  | "escape"
  | "ctrlC"
  | "arrowUp"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight"
  | "optionArrowUp";

class HerdrUnavailableRequestError extends Error {}
class TargetNotFoundRequestError extends Error {}
class RequestOutcomeUnknownError extends Error {}

function isRequestTimeout(cause: unknown) {
  return cause instanceof DOMException && cause.name === "TimeoutError";
}

function isConnectionFailure(cause: unknown) {
  return cause instanceof TypeError || isRequestTimeout(cause);
}

function errorMessage(cause: unknown, fallback: string) {
  if (isRequestTimeout(cause))
    return "通信がタイムアウトしました。接続状態を確認してください。";
  return cause instanceof Error ? cause.message : fallback;
}

function outputLines(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLElement>("[data-output-line]"),
  );
}

function captureOutputAnchor(element: HTMLElement): OutputAnchor | undefined {
  const rows = outputLines(element);
  const scrollTop = element.scrollTop;
  const scrollportTop = element.getBoundingClientRect().top + element.clientTop;
  const index = rows.findIndex((row) => {
    const top = row.getBoundingClientRect().top - scrollportTop + scrollTop;
    return top + row.getBoundingClientRect().height > scrollTop;
  });
  if (index < 0) return undefined;

  const lines = rows.map((row) => row.textContent ?? "");
  const top =
    rows[index].getBoundingClientRect().top - scrollportTop + scrollTop;
  return {
    line: lines[index],
    before: lines.slice(Math.max(0, index - 2), index),
    after: lines.slice(index + 1, index + 3),
    offset: scrollTop - top,
  };
}

function findOutputAnchorIndex(lines: string[], anchor: OutputAnchor) {
  let bestIndex = -1;
  let bestScore = 0;
  let tied = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== anchor.line) continue;
    let score = 0;
    for (let distance = 1; distance <= anchor.before.length; distance += 1) {
      if (
        lines[index - distance] ===
        anchor.before[anchor.before.length - distance]
      ) {
        score += 1;
      }
    }
    for (let distance = 1; distance <= anchor.after.length; distance += 1) {
      if (lines[index + distance] === anchor.after[distance - 1]) score += 1;
    }
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  }
  if (anchor.before.length === 0 && anchor.after.length === 0) {
    return lines.filter((line) => line === anchor.line).length === 1
      ? lines.indexOf(anchor.line)
      : -1;
  }
  return bestScore > 0 && !tied ? bestIndex : -1;
}

const specialKeys: ReadonlyArray<{ key: SpecialKey; label: string }> = [
  { key: "enter", label: "Enter" },
  { key: "escape", label: "Esc" },
  { key: "ctrlC", label: "Ctrl+C" },
  { key: "arrowUp", label: "↑" },
  { key: "arrowDown", label: "↓" },
  { key: "arrowLeft", label: "←" },
  { key: "arrowRight", label: "→" },
  { key: "optionArrowUp", label: "⌥↑" },
];

async function messageFor(response: Response, fallback: string) {
  try {
    return ((await response.json()) as ApiFailure).error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function isSameTarget(left: Target | undefined, right: Target | undefined) {
  return left?.kind === right?.kind && left?.paneId === right?.paneId;
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
  const [sendEnterAfterPaneText, setSendEnterAfterPaneText] = useState(true);
  const [navigationError, setNavigationError] = useState<string>();
  const [outputError, setOutputError] = useState<string>();
  const [agentsError, setAgentsError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [copyError, setCopyError] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastOutputAt, setLastOutputAt] = useState<number>();
  const [isOutputStale, setIsOutputStale] = useState(false);
  const [isAtOutputEnd, setIsAtOutputEnd] = useState(true);
  const navigationRequestId = useRef(0);
  const outputRequestId = useRef(0);
  const agentsRequestId = useRef(0);
  const targetRef = useRef<Target | undefined>(undefined);
  const workspaceIdRef = useRef<string | undefined>(undefined);
  const tabIdRef = useRef<string | undefined>(undefined);
  const isPolling = useRef(false);
  const outputElement = useRef<HTMLPreElement>(null);
  const wasAtOutputEnd = useRef(true);
  const outputAnchor = useRef<OutputAnchor | undefined>(undefined);
  const connectionStatusRef = useRef<ConnectionStatus>("checking");

  const markConnected = useCallback(() => {
    const recovered = connectionStatusRef.current === "unavailable";
    connectionStatusRef.current = "connected";
    setConnectionStatus("connected");
    return recovered;
  }, []);

  const markUnavailable = useCallback(() => {
    connectionStatusRef.current = "unavailable";
    setConnectionStatus("unavailable");
  }, []);

  const clearTarget = useCallback(() => {
    ++outputRequestId.current;
    targetRef.current = undefined;
    setTarget(undefined);
    setOutput(undefined);
    setLastOutputAt(undefined);
    setIsOutputStale(false);
    setInput("");
    setOutputError(undefined);
    setActionError(undefined);
    setCopyError(undefined);
    outputAnchor.current = undefined;
  }, []);

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
        (workspace) => workspace.id === workspaceIdRef.current,
      )
        ? workspaceIdRef.current
        : nextWorkspaces[0]?.id;
      let nextTabs: Tab[] = [];
      let nextPanes: Pane[] = [];
      let nextTabId: string | undefined;
      if (nextWorkspaceId) {
        const tabsResponse = await api.api.workspaces[":workspaceId"].tabs.$get(
          { param: { workspaceId: nextWorkspaceId } },
        );
        if (!tabsResponse.ok)
          throw new Error(
            await messageFor(tabsResponse, "タブを取得できません。"),
          );
        nextTabs = ((await tabsResponse.json()) as { tabs: Tab[] }).tabs;
        nextTabId = nextTabs.some((tab) => tab.id === tabIdRef.current)
          ? tabIdRef.current
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
      const agentRequestId = ++agentsRequestId.current;
      const agentsResponse = await api.api.agents.$get();
      if (!agentsResponse.ok)
        throw new Error(
          await messageFor(agentsResponse, "Agent を取得できません。"),
        );
      const nextAgents = (await agentsResponse.json()) as { agents: Agent[] };
      if (requestId !== navigationRequestId.current) return;
      setWorkspaces(nextWorkspaces);
      setTabs(nextTabs);
      setPanes(nextPanes);
      const currentTarget = targetRef.current;
      if (agentRequestId === agentsRequestId.current) {
        setAgents(nextAgents.agents);
        if (
          currentTarget?.kind === "agent" &&
          !nextAgents.agents.some(
            (agent) => agent.paneId === currentTarget.paneId,
          )
        ) {
          clearTarget();
        }
      }
      if (
        currentTarget?.kind === "pane" &&
        !nextPanes.some((pane) => pane.id === currentTarget.paneId)
      ) {
        clearTarget();
      }
      setWorkspaceId(nextWorkspaceId);
      workspaceIdRef.current = nextWorkspaceId;
      setTabId(nextTabId);
      tabIdRef.current = nextTabId;
      markConnected();
      setNavigationError(undefined);
    } catch (cause) {
      if (requestId !== navigationRequestId.current) return;
      markUnavailable();
      setNavigationError(errorMessage(cause, "接続を確認できません。"));
    } finally {
      if (requestId === navigationRequestId.current) setIsRefreshing(false);
    }
  }, [clearTarget, markConnected, markUnavailable]);

  const refreshOutput = useCallback(async () => {
    if (!target) {
      setOutput(undefined);
      return;
    }
    if (!isSameTarget(target, targetRef.current)) return;
    const requestId = ++outputRequestId.current;
    try {
      const response =
        target.kind === "agent"
          ? await api.api.agents.output.$get(
              {
                query: { paneId: target.paneId },
              },
              { init: { signal: AbortSignal.timeout(15000) } },
            )
          : await api.api.panes[":paneId"].output.$get(
              {
                param: { paneId: target.paneId },
              },
              { init: { signal: AbortSignal.timeout(15000) } },
            );
      if (!response.ok)
        throw response.status === 404
          ? new TargetNotFoundRequestError(
              await messageFor(response, "操作対象が見つかりません。"),
            )
          : response.status === 503 || response.status === 504
            ? new HerdrUnavailableRequestError(
                await messageFor(
                  response,
                  response.status === 504
                    ? "Herdr の応答がタイムアウトしました。"
                    : "Herdr に接続できません。",
                ),
              )
            : new Error(await messageFor(response, "出力を取得できません。"));
      const nextOutput = (await response.json()) as { output: PaneOutput };
      if (requestId !== outputRequestId.current) return;
      setOutput(nextOutput.output);
      setLastOutputAt(Date.now());
      setIsOutputStale(false);
      setOutputError(undefined);
      if (markConnected()) void refreshNavigation();
    } catch (cause) {
      if (requestId !== outputRequestId.current) return;
      if (
        cause instanceof HerdrUnavailableRequestError ||
        isConnectionFailure(cause)
      ) {
        markUnavailable();
      }
      if (cause instanceof TargetNotFoundRequestError) clearTarget();
      setOutputError(errorMessage(cause, "出力を取得できません。"));
    }
  }, [clearTarget, markConnected, markUnavailable, refreshNavigation, target]);

  useEffect(() => {
    if (!lastOutputAt) return;
    const delay = Math.max(0, lastOutputAt + 12000 - Date.now());
    const timeout = window.setTimeout(() => setIsOutputStale(true), delay);
    return () => window.clearTimeout(timeout);
  }, [lastOutputAt]);

  useLayoutEffect(() => {
    const element = outputElement.current;
    if (!element || !output) return;
    if (wasAtOutputEnd.current) {
      element.scrollTop = element.scrollHeight;
    } else {
      const rows = outputLines(element);
      const lines = rows.map((row) => row.textContent ?? "");
      const anchor = outputAnchor.current;
      const index = anchor ? findOutputAnchorIndex(lines, anchor) : -1;
      const row = index >= 0 ? rows[index] : undefined;
      if (row && anchor) {
        const scrollportTop =
          element.getBoundingClientRect().top + element.clientTop;
        const top =
          row.getBoundingClientRect().top - scrollportTop + element.scrollTop;
        element.scrollTop = top + anchor.offset;
      } else {
        element.scrollTop = 0;
      }
    }
    const atEnd =
      element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    wasAtOutputEnd.current = atEnd;
    outputAnchor.current = captureOutputAnchor(element);
    setIsAtOutputEnd(atEnd);
  }, [output]);

  const refreshAgents = useCallback(async () => {
    const requestId = ++agentsRequestId.current;
    try {
      const response = await api.api.agents.$get();
      if (!response.ok)
        throw response.status === 503 || response.status === 504
          ? new HerdrUnavailableRequestError(
              await messageFor(
                response,
                response.status === 504
                  ? "Herdr の応答がタイムアウトしました。"
                  : "Herdr に接続できません。",
              ),
            )
          : new Error(await messageFor(response, "Agent を取得できません。"));
      const nextAgents = (await response.json()) as { agents: Agent[] };
      if (requestId !== agentsRequestId.current) return;
      setAgents(nextAgents.agents);
      const currentTarget = targetRef.current;
      if (
        currentTarget?.kind === "agent" &&
        !nextAgents.agents.some(
          (agent) => agent.paneId === currentTarget.paneId,
        )
      ) {
        clearTarget();
      }
      setAgentsError(undefined);
      if (markConnected()) void refreshNavigation();
    } catch (cause) {
      if (requestId !== agentsRequestId.current) return;
      if (
        cause instanceof HerdrUnavailableRequestError ||
        isConnectionFailure(cause)
      ) {
        markUnavailable();
      }
      setAgentsError(errorMessage(cause, "Agent を取得できません。"));
    }
  }, [clearTarget, markConnected, markUnavailable, refreshNavigation]);

  const refreshAll = useCallback(() => {
    void refreshNavigation();
    void refreshOutput();
    void refreshAgents();
  }, [refreshAgents, refreshNavigation, refreshOutput]);

  useEffect(() => {
    void refreshNavigation();
  }, [refreshNavigation]);
  useEffect(() => {
    void refreshOutput();
  }, [refreshOutput]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateViewportHeight = () => {
      if (viewport.scale !== 1) return;
      document.documentElement.style.setProperty(
        "--visual-viewport-height",
        `${viewport.height}px`,
      );
    };
    updateViewportHeight();
    viewport.addEventListener("resize", updateViewportHeight);
    viewport.addEventListener("scroll", updateViewportHeight);
    return () => {
      viewport.removeEventListener("resize", updateViewportHeight);
      viewport.removeEventListener("scroll", updateViewportHeight);
      document.documentElement.style.removeProperty("--visual-viewport-height");
    };
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isPolling.current) return;
      isPolling.current = true;
      void Promise.all([refreshOutput(), refreshAgents()]).finally(() => {
        isPolling.current = false;
      });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refreshAgents, refreshOutput]);
  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    const refreshWhenRestored = (event: PageTransitionEvent) => {
      if (event.persisted) refreshAll();
    };
    window.addEventListener("online", refreshAll);
    window.addEventListener("pageshow", refreshWhenRestored);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("online", refreshAll);
      window.removeEventListener("pageshow", refreshWhenRestored);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refreshAll]);

  async function selectWorkspace(nextWorkspaceId: string) {
    const requestId = ++navigationRequestId.current;
    setIsRefreshing(false);
    workspaceIdRef.current = nextWorkspaceId;
    tabIdRef.current = undefined;
    setWorkspaceId(nextWorkspaceId);
    setTabId(undefined);
    clearTarget();
    setTabs([]);
    setPanes([]);
    try {
      const response = await api.api.workspaces[":workspaceId"].tabs.$get({
        param: { workspaceId: nextWorkspaceId },
      });
      if (requestId !== navigationRequestId.current) return;
      if (!response.ok) {
        if (response.status === 503 || response.status === 504)
          markUnavailable();
        throw new Error(await messageFor(response, "タブを取得できません。"));
      }
      const nextTabs = ((await response.json()) as { tabs: Tab[] }).tabs;
      const nextTabId = nextTabs[0]?.id;
      let nextPanes: Pane[] = [];
      if (nextTabId) {
        const panesResponse = await api.api.tabs[":tabId"].panes.$get({
          param: { tabId: nextTabId },
        });
        if (requestId !== navigationRequestId.current) return;
        if (!panesResponse.ok) {
          if (panesResponse.status === 503 || panesResponse.status === 504)
            markUnavailable();
          throw new Error(
            await messageFor(panesResponse, "ペインを取得できません。"),
          );
        }
        nextPanes = ((await panesResponse.json()) as { panes: Pane[] }).panes;
      }
      if (requestId !== navigationRequestId.current) return;
      setTabs(nextTabs);
      setPanes(nextPanes);
      setTabId(nextTabId);
      tabIdRef.current = nextTabId;
      setNavigationError(undefined);
    } catch (cause) {
      if (requestId !== navigationRequestId.current) return;
      if (isConnectionFailure(cause)) markUnavailable();
      setNavigationError(errorMessage(cause, "タブを取得できません。"));
    }
  }

  async function selectTab(nextTabId: string) {
    const requestId = ++navigationRequestId.current;
    setIsRefreshing(false);
    tabIdRef.current = nextTabId;
    setTabId(nextTabId);
    clearTarget();
    setPanes([]);
    try {
      const response = await api.api.tabs[":tabId"].panes.$get({
        param: { tabId: nextTabId },
      });
      if (requestId !== navigationRequestId.current) return;
      if (!response.ok) {
        if (response.status === 503 || response.status === 504)
          markUnavailable();
        throw new Error(await messageFor(response, "ペインを取得できません。"));
      }
      const nextPanes = (await response.json()) as { panes: Pane[] };
      if (requestId !== navigationRequestId.current) return;
      setPanes(nextPanes.panes);
      setNavigationError(undefined);
    } catch (cause) {
      if (requestId !== navigationRequestId.current) return;
      if (isConnectionFailure(cause)) markUnavailable();
      setNavigationError(errorMessage(cause, "ペインを取得できません。"));
    }
  }

  function selectTarget(nextTarget: Target) {
    ++outputRequestId.current;
    if (!isSameTarget(targetRef.current, nextTarget)) setInput("");
    targetRef.current = nextTarget;
    setTarget(nextTarget);
    setOutput(undefined);
    setLastOutputAt(undefined);
    setIsOutputStale(false);
    outputAnchor.current = undefined;
    wasAtOutputEnd.current = true;
    setIsAtOutputEnd(true);
    setOutputError(undefined);
    setActionError(undefined);
    setCopyError(undefined);
  }

  async function sendText() {
    if (!target || input.length === 0) return;
    setIsSending(true);
    try {
      if (target.kind === "agent") {
        const response = await api.api.agents.prompt.$post(
          {
            json: { paneId: target.paneId, prompt: input },
          },
          { init: { signal: AbortSignal.timeout(60000) } },
        );
        if (!response.ok) {
          const message = await messageFor(response, "送信できません。");
          if (response.status === 503 || response.status === 504) {
            markUnavailable();
            throw new RequestOutcomeUnknownError(message);
          }
          throw new Error(message);
        }
      } else {
        const response = await api.api.panes[":paneId"].text.$post(
          {
            param: { paneId: target.paneId },
            json: { text: input },
          },
          { init: { signal: AbortSignal.timeout(15000) } },
        );
        if (!response.ok) {
          const message = await messageFor(response, "送信できません。");
          if (response.status === 503 || response.status === 504) {
            markUnavailable();
            throw new RequestOutcomeUnknownError(message);
          }
          throw new Error(message);
        }

        // Clear accepted text before sending Enter so a partial failure cannot
        // cause an accidental duplicate when the user retries.
        setInput("");
        if (sendEnterAfterPaneText) {
          try {
            await sendPaneKey(target.paneId, "enter");
          } catch (cause) {
            if (
              cause instanceof RequestOutcomeUnknownError ||
              isConnectionFailure(cause)
            ) {
              markUnavailable();
              setActionError(
                "本文は送信済みです。Enterの送信結果を確認できないため、出力を確認してください。",
              );
            } else {
              setActionError(
                "本文は送信済みですが、Enterを送信できませんでした。",
              );
            }
            void refreshOutput();
            return;
          }
        }
      }
      setInput("");
      setActionError(undefined);
      void refreshOutput();
    } catch (cause) {
      if (
        cause instanceof HerdrUnavailableRequestError ||
        cause instanceof RequestOutcomeUnknownError ||
        isConnectionFailure(cause)
      ) {
        markUnavailable();
      }
      setActionError(
        cause instanceof RequestOutcomeUnknownError ||
          isConnectionFailure(cause)
          ? "送信結果を確認できません。出力を確認してから再送してください。"
          : cause instanceof Error
            ? cause.message
            : "送信できません。",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function sendPaneKey(paneId: string, key: SpecialKey) {
    const response = await api.api.panes[":paneId"].key.$post(
      { param: { paneId }, json: { key } },
      { init: { signal: AbortSignal.timeout(15000) } },
    );
    if (!response.ok) {
      const message = await messageFor(response, "キーを送信できません。");
      if (
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        throw new RequestOutcomeUnknownError(message);
      }
      throw new Error(message);
    }
  }

  async function sendKey(key: SpecialKey) {
    if (!target) return;
    setIsSending(true);
    try {
      const response = await api.api.panes[":paneId"].key.$post(
        {
          param: { paneId: target.paneId },
          json: { key },
        },
        { init: { signal: AbortSignal.timeout(15000) } },
      );
      if (!response.ok) {
        const message = await messageFor(response, "キーを送信できません。");
        if (response.status === 503 || response.status === 504) {
          markUnavailable();
          throw new RequestOutcomeUnknownError(message);
        }
        throw new Error(message);
      }
      setActionError(undefined);
      void refreshOutput();
    } catch (cause) {
      if (
        cause instanceof HerdrUnavailableRequestError ||
        cause instanceof RequestOutcomeUnknownError ||
        isConnectionFailure(cause)
      ) {
        markUnavailable();
      }
      setActionError(
        cause instanceof RequestOutcomeUnknownError ||
          isConnectionFailure(cause)
          ? "キーの送信結果を確認できません。出力を確認してから操作してください。"
          : cause instanceof Error
            ? cause.message
            : "キーを送信できません。",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output.text);
      } else {
        const temporary = document.createElement("textarea");
        temporary.value = output.text;
        temporary.setAttribute("readonly", "");
        temporary.style.position = "fixed";
        temporary.style.opacity = "0";
        document.body.append(temporary);
        temporary.select();
        const copied = document.execCommand("copy");
        temporary.remove();
        if (!copied) throw new Error("copy failed");
      }
      setCopyError(undefined);
    } catch {
      setCopyError("コピーできませんでした。");
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
        <button className="refresh-button" onClick={refreshAll} type="button">
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
      {(actionError ??
        copyError ??
        navigationError ??
        outputError ??
        agentsError) && (
        <p className="error" role="alert">
          {actionError ??
            copyError ??
            navigationError ??
            outputError ??
            agentsError}
        </p>
      )}
      <section className="selection-panel" aria-label="操作対象を選択">
        <label>
          ワークスペース
          <select
            disabled={isSending}
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
              disabled={isSending}
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
              disabled={isSending}
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
              disabled={isSending}
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
          <div className="output-actions">
            {selectedAgent && <Status status={selectedAgent.status} />}
            <button
              type="button"
              disabled={!output}
              onClick={() => void copyOutput()}
            >
              コピー
            </button>
            <button
              type="button"
              disabled={!output || isAtOutputEnd}
              onClick={() => {
                if (outputElement.current)
                  outputElement.current.scrollTop =
                    outputElement.current.scrollHeight;
                wasAtOutputEnd.current = true;
                outputAnchor.current = undefined;
                setIsAtOutputEnd(true);
              }}
            >
              最新へ
            </button>
          </div>
        </div>
        {!target && (
          <p className="empty">ペインまたは Agent を選択してください。</p>
        )}
        {target && !output && <p className="empty">出力を読み込んでいます。</p>}
        {output && (
          <pre
            ref={outputElement}
            onScroll={(event) => {
              const element = event.currentTarget;
              const atEnd =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                32;
              wasAtOutputEnd.current = atEnd;
              outputAnchor.current = captureOutputAnchor(element);
              setIsAtOutputEnd(atEnd);
            }}
          >
            {(output.text || "（出力はありません）")
              .split("\n")
              .map((line, index) => (
                <span className="output-line" data-output-line key={index}>
                  {line}
                </span>
              ))}
          </pre>
        )}
        {output && lastOutputAt && (
          <p className="hint">
            最終更新: {new Date(lastOutputAt).toLocaleTimeString("ja-JP")}
            {isOutputStale ? " · 古い出力を表示中" : ""}
          </p>
        )}
        {output?.truncated && (
          <p className="hint">表示は直近の出力に省略されています。</p>
        )}
      </section>
      <section className="controls" aria-label="入力">
        <p className="destination">
          送信先:{" "}
          {target
            ? target.kind === "agent"
              ? `Agent ${selectedAgent?.name ?? selectedAgent?.kind ?? target.paneId}（プロンプト）`
              : `ペイン ${panes.find((pane) => pane.id === target.paneId)?.title ?? target.paneId}（テキスト）`
            : "未選択"}
        </p>
        <label htmlFor="command">
          {target?.kind === "agent"
            ? "Agent に送るプロンプト"
            : "ペインに送るテキスト"}
        </label>
        <textarea
          aria-describedby="command-hint"
          disabled={!target || isSending}
          enterKeyHint="enter"
          id="command"
          lang="ja"
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            target ? "入力してください" : "先に操作対象を選択してください"
          }
          rows={4}
          value={input}
        />
        <p className="hint composer-hint" id="command-hint">
          入力中はEnterで改行できます。送信は下のボタンを押してください。
        </p>
        {target?.kind === "pane" && (
          <label className="send-enter-option">
            <input
              checked={sendEnterAfterPaneText}
              disabled={isSending}
              onChange={(event) =>
                setSendEnterAfterPaneText(event.target.checked)
              }
              type="checkbox"
            />
            送信後に Enter を送る
          </label>
        )}
        <button
          className="send-button"
          disabled={!target || input.length === 0 || isSending}
          onClick={() => void sendText()}
          type="button"
        >
          {isSending
            ? "送信中…"
            : target?.kind === "agent"
              ? "プロンプトを送信"
              : sendEnterAfterPaneText
                ? "テキストを送信して Enter"
                : "テキストを送信"}
        </button>
        <div className="key-grid" aria-label="特殊キー">
          {specialKeys.map(({ key, label }) => (
            <button
              aria-label={
                key === "optionArrowUp"
                  ? "Option + 上矢印（質問に回答）"
                  : label
              }
              disabled={!target || isSending}
              key={key}
              onClick={() => void sendKey(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hint key-hint">
          選択式の質問: ⌥↑で回答を開く → ↑/↓で選ぶ → Enterで確定
        </p>
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
