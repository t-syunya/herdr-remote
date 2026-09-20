# `packages/herdr`

Herdr と連携するためのアダプター兼腐敗防止層です。

## 担当する処理

- Herdr のローカルソケット通信
- Herdr の生のメソッド名
- 生のリクエスト・レスポンス型
- 互換性への対応
- 生データから安定したドメインモデルへの変換
- 状態の正規化
- 特殊キーのマッピング
- Herdr 固有のエラーの変換

## 外部に公開してはいけないもの

Herdr の生ペイロードの型を `apps/server`、`apps/web`、`packages/shared` に公開してはいけません。

パッケージの公開 API は、アプリケーション向けの安定したモデルと操作だけを提供します。

## 公開 API

`createHerdrClient()` が安定した `HerdrClient` を返す。主な操作は、ワークスペース・タブ・
ペイン・Agent の一覧と読取、テキスト・特殊キー・Agent prompt の送信である。

接続先はアダプター内部で設定する。既定では `$HOME/.config/herdr/herdr.sock` を使用し、
必要に応じてサーバー環境の `HERDR_SOCKET_PATH` で上書きできる。

通常操作は 1 request / 1 connection で送信し、再送は行わない。送達が不明な入力を
自動で二重送信しないためである。
