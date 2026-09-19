# アーキテクチャ

## 目的

Mac で動作する Herdr を、Tailscale 経由で iPhone から操作するためのモバイルファーストなコントロール画面を提供する。

主な UX 上の課題は、スマートフォンからターミナル/TUI を直接操作しにくいことにある。ターミナルタブのタップは信頼性に欠け、修飾キーの組み合わせも扱いづらい。

そのため本プロダクトでは、Herdr TUI をリモートで再現しようとするのではなく、Herdr をバックエンドとして扱う。

## システム概要

```text
iPhone / Safari または PWA
        |
        | Tailscale
        v
apps/web
React + Vite + TypeScript
        |
        | Hono RPC
        v
apps/server
Hono + TypeScript
        |
        | 安定したアダプター API
        v
packages/herdr
        |
        | ローカル Herdr ソケットプロトコル
        v
Herdr
```

## 責務の境界

### `apps/web`

モバイル UX のみを担う。

- ワークスペース/タブ/ペイン/エージェントの選択
- 出力の描画
- テキスト入力
- 特殊キーボタン
- アプリケーションレベルのステータス表示

Herdr のソケットメッセージや生の Herdr レスポンス型を理解してはならない。

### `apps/server`

アプリケーション向けバックエンド契約を担う。

- Hono RPC ルート
- 入力値の検証
- アダプターエラーからアプリケーション/API エラーへのマッピング
- 複数のアダプター呼び出しが必要なユースケースの組み立て

Herdr の生のペイロードをパースしてはならない。

### `packages/herdr`

このパッケージはアプリケーションと Herdr の間に置く腐敗防止層である。

以下を所有する。

- ローカルソケットトランスポート
- 生の Herdr リクエスト/レスポンスの形式
- Herdr の操作名
- バージョン固有の互換性処理
- raw -> 安定したドメインモデルへのマッピング
- ステータスの正規化
- 特殊キーのマッピング
- アダプターレベルのエラー

公開する export は意図的に小さく、安定的に保つ。

### `packages/shared`

web/server で共有する、真に Herdr 非依存のコードにのみ使用する。

生の API 型を置くための場所として使ってはならない。

## ドメインモデルの方針

アプリケーションコードは、次のような正規化済みモデルに依存する。

```ts
export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export type Pane = {
  id: string;
  title: string;
};
```

正確なフィールドは、実機での Herdr API スパイク後に確定する。

## アダプターインターフェースの方針

想定する操作は次のとおり。

```ts
interface HerdrClient {
  listWorkspaces(): Promise<Workspace[]>;
  listTabs(workspaceId: string): Promise<Tab[]>;
  listPanes(tabId: string): Promise<Pane[]>;
  readPane(paneId: string): Promise<PaneOutput>;
  sendText(paneId: string, text: string): Promise<void>;
  sendKey(paneId: string, key: SpecialKey): Promise<void>;
  listAgents(): Promise<Agent[]>;
  readAgent(agentId: string): Promise<Agent>;
  sendPrompt(agentId: string, prompt: string): Promise<void>;
}
```

これらは設計上の目標であり、Herdr の生 API に関する主張ではない。

## API 境界

`apps/server` は Hono RPC を公開し、React クライアントがサーバー API 型を直接推論できるようにする。

ブラウザーとサーバーの契約には、アプリケーション指向のモデルを用いる。生の Herdr ペイロードがブラウザーとの契約になってはならない。

## ランタイム/データに関する方針

MVP では以下を採用する。

- データベースを持たない
- 履歴を永続化しない
- 汎用イベントストアを持たない
- パブリックインターネットへのデプロイを行わない
- 出力/状態の更新にはポーリングを許容する

MVP 後の候補:

- PWA のインストール
- WebSocket または SSE によるリアルタイム更新
- blocked/done 状態の通知
- カスタムショートカットボタン
- 保存済みプロンプトテンプレート
- ペインのライフサイクル制御
- より充実したワークスペース切り替え

## セキュリティモデル

Herdr のローカルソケットは Mac 内にとどめる。

Tailscale 経由で到達可能にするのは web/backend サービスだけとする。Herdr ソケットを直接ネットワークへ公開したり、パブリックインターネットからのアクセスを前提にしたりしてはならない。

操作には実質的にターミナル制御の能力があるため、外部から到達可能な範囲は最小限に保つ。

## エラーモデル

技術的な失敗は、可能な範囲でアプリケーションレベルの分類へ正規化する。例:

- `HerdrUnavailable`
- `TargetNotFound`
- `UnsupportedOperation`
- `TransportDisconnected`
- `InvalidHerdrResponse`

正確な表現は実装中に改善できるが、生のソケット例外は `packages/herdr` の内部に閉じ込める。

## 互換性の原則

Herdr のアップグレードにより生のフィールド名、操作名、レスポンス構造が変わった場合は、次の箇所だけを変更することを優先する。

- `packages/herdr/raw`
- `packages/herdr/transport`
- `packages/herdr/mappers`

ユーザーに見える機能が同じである限り、`apps/server` と `apps/web` は変更しない。
