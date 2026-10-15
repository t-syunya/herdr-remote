export type ActiveTabSnapshot = {
  workspaceId: string;
  tabId: string;
};

export type SavedNavigation = {
  workspaceId: string;
  tabId: string;
};

type NavigationStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const savedNavigationKey = "herdr-remote.navigation.v1";

export function readSavedNavigation(
  storage?: NavigationStorage,
): SavedNavigation | undefined {
  try {
    const value = (storage ?? window.localStorage).getItem(savedNavigationKey);
    if (value === null) return undefined;

    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("workspaceId" in parsed) ||
      !("tabId" in parsed) ||
      typeof parsed.workspaceId !== "string" ||
      parsed.workspaceId.length === 0 ||
      typeof parsed.tabId !== "string" ||
      parsed.tabId.length === 0
    ) {
      return undefined;
    }

    return { workspaceId: parsed.workspaceId, tabId: parsed.tabId };
  } catch {
    return undefined;
  }
}

export function writeSavedNavigation(
  navigation: SavedNavigation | undefined,
  storage?: NavigationStorage,
) {
  try {
    const target = storage ?? window.localStorage;
    if (navigation) {
      target.setItem(savedNavigationKey, JSON.stringify(navigation));
    } else {
      target.removeItem(savedNavigationKey);
    }
  } catch {
    // Storage can be disabled by browser settings; navigation remains usable.
  }
}

export function resolveWorkspaceId(
  workspaces: readonly { id: string }[],
  savedWorkspaceId: string | undefined,
  currentWorkspaceId: string | undefined,
) {
  if (workspaces.some((workspace) => workspace.id === savedWorkspaceId)) {
    return savedWorkspaceId;
  }
  if (workspaces.some((workspace) => workspace.id === currentWorkspaceId)) {
    return currentWorkspaceId;
  }
  return workspaces[0]?.id;
}

export function resolveSavedTabId(
  tabs: readonly { id: string }[],
  savedTabId: string,
  activeTabId: string | undefined,
) {
  if (tabs.some((tab) => tab.id === savedTabId)) return savedTabId;
  if (tabs.some((tab) => tab.id === activeTabId)) return activeTabId;
  return tabs[0]?.id;
}

export function resolveAgentTabId(
  tabs: readonly { id: string; workspaceId: string }[],
  agent: { workspaceId: string; tabId: string },
) {
  if (
    !tabs.some(
      (tab) => tab.id === agent.tabId && tab.workspaceId === agent.workspaceId,
    )
  ) {
    throw new Error(
      "Agent の所属タブが見つかりません。一覧を更新してください。",
    );
  }
  return agent.tabId;
}

export function resolveRefreshedTab(
  tabs: readonly { id: string }[],
  workspaceId: string,
  activeTabId: string | undefined,
  currentTabId: string | undefined,
  previousActiveTab: ActiveTabSnapshot | undefined,
) {
  const activeTabIsAvailable =
    activeTabId !== undefined && tabs.some((tab) => tab.id === activeTabId);
  const activeTabChanged =
    activeTabIsAvailable &&
    (previousActiveTab?.workspaceId !== workspaceId ||
      previousActiveTab.tabId !== activeTabId);
  const tabId =
    activeTabIsAvailable && activeTabChanged
      ? activeTabId
      : tabs.some((tab) => tab.id === currentTabId)
        ? currentTabId
        : activeTabIsAvailable
          ? activeTabId
          : tabs[0]?.id;

  return {
    tabId,
    activeTabChanged,
    activeTabSnapshot: activeTabIsAvailable
      ? { workspaceId, tabId: activeTabId }
      : previousActiveTab,
  };
}
