# herdr-remote

Herdr をスマートフォンから操作するためのリモート UI です。

Mac 上で動く Herdr を、Tailscale 経由で iPhone から操作できるようにします。Termius や TUI の直接操作に頼らず使えることを目指しています。

## MVP

- ワークスペース・タブ・ペイン・エージェントの一覧表示
- タップによる操作対象の切り替え
- ペイン・エージェントの出力の読み取り
- テキストの入力・送信
- Enter、Escape、Ctrl+C、矢印キーなどの特殊キーの送信
- 正規化したエージェント状態の表示
- Tailscale 経由での iPhone からのアクセス

## アーキテクチャ

```text
iPhone / ブラウザー
      |
      | Tailscale
      v
apps/web            React + Vite + TypeScript
      |
      | Hono RPC
      v
apps/server         Hono + TypeScript
      |
      v
packages/herdr      Herdr アダプター / 腐敗防止層
      |
      | ローカルソケット
      v
Herdr
```

Herdr 固有の生 API 型を `packages/herdr` の外へ公開してはいけません。

## リポジトリ構成

```text
herdr-remote/
├── apps/
│   ├── web/
│   └── server/
├── packages/
│   ├── herdr/
│   └── shared/
├── docs/
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

## 技術方針

- モノレポ
- pnpm workspace
- MVP では Turborepo を使用しない
- フロントエンド: React + Vite + TypeScript
- バックエンド: Hono + TypeScript
- ブラウザーとサーバー間の API: Hono RPC
- Herdr との連携: アダプター層を介したローカル Socket API
- リモートアクセス: Tailscale のみ
- MVP ではデータベースを導入しない
- MVP では履歴を永続化しない
- リアルタイム更新と通知は、実装上必要な場合を除き MVP 後に検討する

詳しくは [アーキテクチャ](docs/architecture.md) と [実装計画](docs/implementation-plan.md) を参照してください。

## 開発

Node.js 22.12 以上（または 20.19 以上の 20 系）と pnpm 10 を用意してから、依存関係をインストールする。

```sh
pnpm install
pnpm dev
```

pnpm がローカルにない環境では、リポジトリで固定したバージョンを `npx` 経由で実行できる。

```sh
npx --yes pnpm@10.24.0 install
npx --yes pnpm@10.24.0 dev
```

開発時は Web が `http://127.0.0.1:5173`、Server が `http://127.0.0.1:8787` で起動する。
Vite の開発プロキシが `/api` を Server へ転送する。

### Tailscale 経由で起動

Mac で Tailscale を起動した状態で次を実行する。

```sh
pnpm dev:tailscale
```

Web の待ち受けアドレスが Mac の Tailscale IPv4 アドレス（例: `http://100.x.y.z:5173`）に変わり、
iPhone から同じ URL を開ける。事前に `tailscale` コマンドに PATH が通っている必要がある。
環境変数 `DEV_HOST` を設定すれば、Tailscale 以外のアドレスを明示的に指定することもできる。
Tailscale の IP アドレスは tailnet 内のデバイスからしか到達できないため、
公開インターネットには露出しない。API リクエストは Vite のプロキシ経由で Mac 内の Server（`127.0.0.1:8787`）へ転送され、
Server と Herdr のローカルソケットが直接外部へ公開されることはない。
