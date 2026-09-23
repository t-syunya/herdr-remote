# 実装計画

## Phase 0: Herdr API の実機調査

アダプターを想定だけで実装する前に、必ず実施する。

状況（2026-09-18）: **完了**。実機 0.8.2 でソケット、ペインの入出力、特殊キー、エージェントの読み取り・実際のプロンプト送信・完了待ち、イベント、停止・再接続を確認済み。詳細、確認範囲、Phase 2 向けの提案は [`herdr-api-spike.md`](herdr-api-spike.md) を参照。

### 確認項目

- インストール済み Herdr の API スキーマ
- ローカルソケットのパスとライフサイクル
- ワークスペース・タブ・ペインの識別子と関係
- ペイン出力の読み取り動作
- テキスト入力と特殊キー入力の動作
- インストール済み版が対応するエージェントの一覧・読み取り・プロンプト送信
- 有用であればイベント・購読の動作
- 再接続・再起動・切断時の失敗パターン

### 成果物

`docs/herdr-api-spike.md` に、インストール済み Herdr のバージョン、観測した API メソッド、秘密情報を除いたリクエスト・レスポンスの例、確認済みのソケット動作、ドキュメントや当初の想定との非互換点、アダプター実装前に必要な決定事項を記録する。

## Phase 1: モノレポの基盤構築

pnpm workspace を使ったアプリケーション・パッケージの実体を作成する。

状況（2026-09-19）: **完了**。今回の範囲は TypeScript / React / Vite / Hono の開発基盤と health RPC の接続確認まで。Herdr アダプターと操作 UI は後続 Phase で実装する。

役割分担: Astra が設計・レビュー、Terra が実装と修正、Luna が lint / format と必要な検証コマンドの実行を担当する。

確認済み: pnpm install、typecheck、build、lint、format:check、git diff --check。ブラウザーで health RPC 接続成功と API 停止時のエラー表示を確認した。Astra の最終レビューで Medium 以上の問題はなかった。Phase 1 には自動テストスイートを追加していない。境界の回帰テストは Phase 2 以降で追加する。

目標の構成:

```text
apps/
  web/
  server/
packages/
  herdr/
  shared/
```

依存関係は最小限に保つ。

## Phase 2: `packages/herdr` アダプター

実機調査で確認した内容に基づいて実装する。

状況（2026-09-19）: **完了**。通常操作ごとの Unix socket 接続、raw response の検証、
安定したワークスペース・タブ・ペイン・Agent モデル、入力・特殊キー・Agent prompt 操作、
アプリケーション向けエラー変換を `packages/herdr` に実装した。raw -> domain mapping、
状態・特殊キーの正規化、不正なレスポンスの境界テストも追加した。

推奨順序:

1. ソケットトランスポート
2. 生のリクエスト・レスポンス型
3. エラー変換
4. ワークスペース・タブ・ペインのドメインモデルとマッパー
5. ペイン出力の読み取り
6. テキスト送信
7. 特殊キーのマッピング
8. エージェント操作
9. 正規化のテスト

パッケージの公開エントリーポイントから Herdr の生 API 型を公開してはいけない。

## Phase 3: Hono RPC サーバー

MVP に必要な操作だけを公開する。

状況（2026-09-20）: **完了**。navigation、pane、agent、input、health/status の Hono RPC を
実装した。Server は `@herdr/herdr` の安定した `HerdrClient` のみを参照し、入力検証と
adapter error のアプリケーション向け HTTP エラーへの変換を行う。raw Herdr のメソッド名・
型・socket 詳細は server の契約に含めていない。RPC の正常系、入力検証、Agent target の
排他指定、可用性エラー変換を server の境界テストで確認する。

想定するグループ:

- セッション・ナビゲーション状態
- ペイン
- エージェント
- 入力・操作
- health・状態

`packages/herdr` が返すアプリケーションモデルを使用する。

## Phase 4: モバイル Web UI

最小限で使える 1 画面のフローを作る。

状況（2026-09-21）: **完了**。ワークスペース・タブ・ペイン・Agent のタップ選択、
ペイン／Agent 出力の 4 秒ポーリング、対象に応じた text／prompt の送信、主要特殊キー、
正規化済み Agent 状態、接続／API エラー表示を実装した。iPhone 幅を優先した単一画面で、
Herdr の raw API や socket 詳細は Web 側へ露出していない。

必須の UX:

- タップによるワークスペース・タブ・ペイン・エージェントの選択
- 読みやすい出力領域
- テキストの入力・送信
- Enter / Escape / Ctrl+C / 矢印キーをワンタップで送信
- 明確な接続・エラー状態
- 正規化したエージェント状態

デスクトップ向けの情報密度より、iPhone での操作しやすさを優先する。

## Phase 5: Tailscale 経由のアクセス

Tailscale へ公開するのは web/backend サービスだけにする。Termius を使わず iPhone から MVP が動作することを確認する。

状況（2026-09-21）: **完了**。`pnpm dev:tailscale` を追加し、Vite 開発サーバーを Mac の
Tailscale IPv4 アドレスのみに bind するようにした。iPhone は `http://<Mac の Tailscale IP>:5173`
で UI を開き、API は Vite の開発プロキシ経由で Mac 内の Server（`127.0.0.1:8787`）へ届く。
Server と Herdr のローカルソケットは Tailscale 上に直接公開しておらず、Tailscale IP への
bind 自体が tailnet 内からの到達に限定される。Mac 側で Tailscale IP 経由の Web/API/Herdr
ステータスの疎通と、Server が Tailscale IP で待ち受けていないことを確認した。

## Phase 6: MVP の堅牢化

MVP 完了を宣言する前に、次を確認する。

状況（2026-09-21）: **完了**。adapter の raw -> domain mapping、状態正規化、
特殊キー、異常応答、ソケット切断後の次回操作による再接続を境界テストで確認した。
Hono RPC の正常系・入力検証・可用性エラー変換も確認済み。Herdr の可用性エラーは
browser 向けの 503 に変換され、Web UI の接続不可表示も確認した。390px 幅では
横方向のはみ出しがないモバイルレイアウトを視覚確認した。`test`、`typecheck`、
`lint`、`format:check`、`build` はすべて成功した。

- アダプターマッパーのテスト
- 状態正規化のテスト
- キーマッピングのテスト
- API 契約の確認
- Herdr が利用できない場合の適切な処理
- 再接続の動作
- モバイルレイアウトの確認
- typecheck / lint / test / build の成功

## MVP の完了条件

Tailscale に接続した iPhone から、Termius を使わずに次ができる。

1. Herdr Remote UI を開く
2. 操作対象のエージェントまたはペインを特定して選ぶ
3. 出力を見る
4. テキストを送信する
5. 主要な特殊キーを送信する
6. 対象が `working`、`idle`、`blocked`、`done`、`unknown` のどれかを理解する

## MVP 後

MVP 完了後は機能拡張を中心に進める。優先順位、作業項目、完了条件は
[MVP 後の機能拡張タスク](post-mvp-tasks.md) を参照。

PC の常時起動と現在の起動方法を前提とし、常用向け配信・自動起動などの運用整備は当面の対象外とする。
まず出力閲覧・入力、複数 Agent の管理、ワークスペース・タブ・ペイン操作を改善する。
