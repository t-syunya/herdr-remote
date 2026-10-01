import assert from "node:assert/strict";
import test from "node:test";
import { resolveRefreshedTab } from "./navigation.js";

const tabs = [{ id: "w1:t1" }, { id: "w1:t2" }];

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
