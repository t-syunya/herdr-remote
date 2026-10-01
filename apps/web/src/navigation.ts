export type ActiveTabSnapshot = {
  workspaceId: string;
  tabId: string;
};

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
