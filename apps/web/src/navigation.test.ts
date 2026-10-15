import assert from "node:assert/strict";
import test from "node:test";
import {
  readSavedNavigation,
  resolveAgentTabId,
  resolveSavedTabId,
  resolveRefreshedTab,
  resolveWorkspaceId,
  writeSavedNavigation,
} from "./navigation.js";

const tabs = [{ id: "w1:t1" }, { id: "w1:t2" }];

test("Agentの所属タブを選び、消失や所属不一致では別タブへ戻さない", () => {
  const agent = { workspaceId: "w2", tabId: "w2:t2" };
  const agentTabs = [
    { id: "w2:t1", workspaceId: "w2" },
    { id: "w2:t2", workspaceId: "w2" },
  ];
  assert.equal(resolveAgentTabId(agentTabs, agent), "w2:t2");
  assert.throws(() => resolveAgentTabId([], agent), /所属タブ/);
  assert.throws(
    () => resolveAgentTabId([{ id: "w2:t2", workspaceId: "w1" }], agent),
    /所属タブ/,
  );
  assert.equal(
    resolveRefreshedTab(agentTabs, "w2", "w2:t1", "w2:t2", {
      workspaceId: "w2",
      tabId: "w2:t1",
    }).tabId,
    "w2:t2",
  );
});

test("Herdr 側でアクティブタブが変わったら切替先を選ぶ", () => {
  const result = resolveRefreshedTab(tabs, "w1", "w1:t2", "w1:t1", {
    workspaceId: "w1",
    tabId: "w1:t1",
  });

  assert.equal(result.tabId, "w1:t2");
  assert.equal(result.activeTabChanged, true);
});

test("Herdr 側のタブが変わっていなければWeb側の選択を維持する", () => {
  const result = resolveRefreshedTab(tabs, "w1", "w1:t1", "w1:t2", {
    workspaceId: "w1",
    tabId: "w1:t1",
  });

  assert.equal(result.tabId, "w1:t2");
  assert.equal(result.activeTabChanged, false);
});

test("別Workspaceへ切り替えた場合はそのWorkspaceのアクティブタブを使う", () => {
  const result = resolveRefreshedTab(
    [{ id: "w2:t1" }, { id: "w2:t2" }],
    "w2",
    "w2:t2",
    "w2:t1",
    { workspaceId: "w1", tabId: "w1:t2" },
  );

  assert.equal(result.tabId, "w2:t2");
  assert.equal(result.activeTabChanged, true);
});

test("アクティブタブが一覧にない場合は有効な選択、なければ先頭へ戻す", () => {
  assert.equal(
    resolveRefreshedTab(tabs, "w1", "w1:missing", "w1:t2", {
      workspaceId: "w1",
      tabId: "w1:t1",
    }).tabId,
    "w1:t2",
  );
  assert.equal(
    resolveRefreshedTab(tabs, "w1", undefined, undefined, undefined).tabId,
    "w1:t1",
  );
});

test("保存済みのワークスペースとタブを読み書きし、解除できる", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const navigation = { workspaceId: "w1", tabId: "w1:t2" };

  writeSavedNavigation(navigation, storage);
  assert.deepEqual(readSavedNavigation(storage), navigation);

  writeSavedNavigation(undefined, storage);
  assert.equal(readSavedNavigation(storage), undefined);
});

test("破損した保存値や利用できないStorageを無視する", () => {
  const storage = {
    getItem: () => "{invalid",
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {
      throw new Error("storage disabled");
    },
  };

  assert.equal(readSavedNavigation(storage), undefined);
  assert.doesNotThrow(() =>
    writeSavedNavigation({ workspaceId: "w1", tabId: "w1:t1" }, storage),
  );
  assert.doesNotThrow(() => writeSavedNavigation(undefined, storage));
});

test("保存先が一覧に残っていない場合は有効な選択先へフォールバックする", () => {
  const workspaces = [{ id: "w1" }, { id: "w2" }];
  assert.equal(resolveWorkspaceId(workspaces, "w1", "w2"), "w1");
  assert.equal(resolveWorkspaceId(workspaces, "missing", "w2"), "w2");
  assert.equal(resolveWorkspaceId(workspaces, "missing", "also-missing"), "w1");
  assert.equal(resolveWorkspaceId([], "missing", undefined), undefined);

  assert.equal(resolveSavedTabId(tabs, "w1:t1", "w1:t2"), "w1:t1");
  assert.equal(resolveSavedTabId(tabs, "w1:missing", "w1:t2"), "w1:t2");
  assert.equal(resolveSavedTabId(tabs, "w1:missing", undefined), "w1:t1");
});
