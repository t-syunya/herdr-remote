# Herdr API 実機調査

## 調査状況

2026-09-18 にインストール済み Herdr と実際の Unix domain socket で検証した。
**Phase 0 完了**。Pane 入出力、実 Agent の読み取り・prompt 成功・完了待ち、
状態報告、イベント、停止・再接続を確認した。
追加の実送信はユーザー承認後、専用 Codex Agent で実施した。

アダプターやアプリケーションコードはまだ実装していない。
以下では「実測」「スキーマ」「公式説明」「提案」を区別する。

## 環境

| 項目                        | 確認結果                                                                |
| --------------------------- | ----------------------------------------------------------------------- |
| macOS                       | 26.6.2 / build 25G83                                                    |
| CLI / 稼働サーバー          | Herdr 0.8.2 / protocol 20                                               |
| インストール                | Homebrew。`/opt/homebrew/bin/herdr` → `../Cellar/herdr/0.8.2/bin/herdr` |
| 既存セッションの API socket | `$HOME/.config/herdr/herdr.sock`                                        |
| 実行コンテキスト            | `HERDR_ENV=1`                                                           |
| 検証用 API socket           | `/tmp/herdr-phase0/herdr.sock`                                          |
| 検証用 client socket        | `/tmp/herdr-phase0/herdr-client.sock`（API 接続先に使わない）           |
| 検証用設定                  | `HERDR_CONFIG_PATH=/tmp/herdr-phase0/config.toml`                       |
| 検証用セッション            | `HERDR_SESSION=phase0-spike`                                            |
| スキーマ                    | `schema_version=1`、request method 91 個                                |

`herdr api schema --json` の出力 SHA-256:

```text
c48f1f54ee0150ca27e11fd44455fe94aeadb20fdf4e4a62393ed822a4e5b150
```

`herdr api schema` だけでは JSON にならない。`--json` または `--output PATH` を使う。
取得物は `/tmp/herdr-phase0-schema.json` に保存した一時資料で、リポジトリには含めない。
再調査時はインストール版のスキーマを再取得する。

既存セッションは status、Agent 一覧、Agent 出力の読み取りのみ実施した。
入力、状態報告、作成・終了、停止はすべて今回作成した検証用セッションに限定した。
全検証後に検証用サーバーを停止し、socket の消滅を確認した。
作成した一時資料と検証用セッションの状態ファイルは残している。
専用 Agent 初回起動時の `/private/tmp/herdr-phase0` の信頼確認も承認後に進めた。
この信頼設定は自動で取り消していない。
検証用セッションのログ・永続状態は設定ファイルの指定とは別に
`$HOME/.config/herdr/sessions/phase0-spike/` に作られた。

## スキーマと対応機能

| 項目                    | 結果                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| Workspace / Tab / Pane  | 実サーバーで作成、一覧、参照関係を確認                                          |
| Pane read               | 4 source、行数制限、ANSI を確認                                                 |
| text input              | 日本語・改行を PTY の受信バイトで確認                                           |
| special keys            | Enter / Escape / Ctrl+C / 矢印 4 種を確認                                       |
| Agent list / get / read | 既存 Agent とテスト用の状態報告で確認                                           |
| Agent prompt            | 不在・前景プロセス不一致・blocked の拒否、実 Agent への送信成功・完了待ちを確認 |
| events                  | subscribe の応答・状態変化の配信・wait の制約を確認                             |
| lifecycle               | クライアント切断、停止中の接続失敗、再起動後の再接続を確認                      |

### MVP に関係する生 API のメソッド

| 用途             | method / params                                                | result                                          |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| 接続確認         | `ping`, `{}`                                                   | `type: "pong"`, version, protocol, capabilities |
| Workspace 一覧   | `workspace.list`, `{}`                                         | `type: "workspace_list"`, workspaces            |
| Tab 一覧         | `tab.list`, `{workspace_id}`                                   | `type: "tab_list"`, tabs                        |
| Pane 一覧        | `pane.list`, `{workspace_id}`                                  | `type: "pane_list"`, panes                      |
| Pane 参照        | `pane.get`, `{pane_id}`                                        | スキーマでは `type: "pane_info"`, pane          |
| Pane 出力        | `pane.read`, `{pane_id, source, lines?, format?, strip_ansi?}` | `type: "pane_read"`, read                       |
| テキスト         | `pane.send_text`, `{pane_id, text}`                            | `type: "ok"`                                    |
| キー             | `pane.send_keys`, `{pane_id, keys: string[]}`                  | `type: "ok"`                                    |
| テキスト＋キー   | `pane.send_input`, `{pane_id, text, keys}`                     | `type: "ok"`                                    |
| Agent 一覧       | `agent.list`, `{}`                                             | `type: "agent_list"`, agents                    |
| Agent メタデータ | `agent.get`, `{target}`                                        | `type: "agent_info"`, agent                     |
| Agent 出力       | `agent.read`, `{target, source, lines?, format?, strip_ansi?}` | `type: "pane_read"`, read                       |
| Agent prompt     | `agent.prompt`, `{target, text, wait?}`                        | `type: "agent_prompted"`, agent                 |
| イベント購読     | `events.subscribe`, `{subscriptions}`                          | `type: "subscription_started"` の後にイベント   |
| イベント待ち     | `events.wait`, `{match_event, timeout_ms?}`                    | 条件に制限あり。下記参照                        |

`workspace.get/focus`、`tab.get/focus`、`pane.focus`、`agent.focus/wait`、
`session.snapshot` もスキーマに存在するが、この調査ではすべての成功経路は実行していない。
MVP 外の method 全数について動作保証するものではない。

## 通信方式の実測

- Unix domain stream socket 上で UTF-8 の newline-delimited JSON を送る。
- request は `{id: string, method: string, params: object}`。`jsonrpc` フィールドはない。
- 改行を送るまでは応答しない。JSON 本体と改行を別の write に分けても受信された。
- **通常 request は応答 1 件で EOF になる**。同じ接続へ次の request を書いたところ
  `BrokenPipeError` になった。MVP は通常操作ごとに新しい接続を使う。
- 購読は接続を維持する。通常応答と同じ接続管理にしない。停止時の購読 EOF も確認した。
- 壊れた request の error は `id: ""` になるため、常に request ID が返るとは限らない。
- CLI も同じ API socket に接続する。サンドボックス内での `EPERM` は接続権限の問題で、
  Herdr 停止を意味しなかった。権限を得た実行では正常に接続できた。

実測の request / response（改行は各 JSON の末尾）:

```json
{"id":"p1","method":"ping","params":{}}
{"id":"p1","result":{"type":"pong","version":"0.8.2","protocol":20,"capabilities":{"live_handoff":true,"detached_server_daemon":true}}}
```

以下の識別子・パス・表示文字列を含む例は検証用の値に置換、または任意フィールドを省略した。
秘密情報、既存 Agent のプロンプトや出力は記録しない。

## 識別子と参照関係

実測した作成応答では `workspace.create` の result に `workspace`, `tab`, `root_pane`
が同時に含まれる。返却された ID を後続 request に使った。

```json
{"workspace_id":"w1","number":1,"label":"phase0","focused":true,"pane_count":1,"tab_count":1,"active_tab_id":"w1:t1","agent_status":"unknown"}
{"tab_id":"w1:t1","workspace_id":"w1","number":1,"label":"1","focused":true,"pane_count":1,"agent_status":"unknown"}
{"pane_id":"w1:p1","terminal_id":"term_example","workspace_id":"w1","tab_id":"w1:t1","focused":true,"agent_status":"unknown","revision":1}
```

- ID は文字列の不透明なハンドルとして保持する。表示順の `number` と混同しない。
- `pane.list` の filter は `workspace_id`。`tab_id` filter はスキーマにない。
  `listPanes(tabId)` を実現するには Workspace を解決して一覧を取得し、`tab_id` で絞る。
- 検証用 Tab の閉鎖後、その Pane の `pane.get` は `pane_not_found` になった。
- 再起動後も `w1` / `w1:t1` / `w1:p1` は復元されたが、`terminal_id` は変わった。
  この 1 回の復元観測を永続的な ID 保証とみなさない。
- Agent の独立した `agent_id` はない。`target` は Pane ID または Agent 名。
  `agent` フィールドの `codex` 等は種類で、個体 ID ではない。
- 初回 Workspace は `focus:false` 指定でも、唯一の Workspace として `focused:true` だった。

## ペイン出力の読み取り動作

```json
{"id":"read1","method":"pane.read","params":{"pane_id":"w1:p1","source":"recent_unwrapped","lines":200,"format":"text","strip_ansi":true}}
{"id":"read1","result":{"type":"pane_read","read":{"pane_id":"w1:p1","workspace_id":"w1","tab_id":"w1:t1","source":"recent_unwrapped","format":"text","text":"PHASE0_READY\nPHASE0_OUTPUT_END","revision":0,"truncated":false}}}
```

この例の `text` は短縮した検証用出力。

| raw source         | 実測と用途                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| `visible`          | viewport 内のスナップショット。100 行の出力後、先頭マーカーは含まれない |
| `recent`           | scrollback を含む描画行。200 行指定で先頭・末尾マーカーを取得           |
| `recent_unwrapped` | soft wrap を連結した出力。240 文字の長い行で `recent` と差を確認        |
| `detection`        | 検出用の下部スナップショット。この実験では viewport と同じ範囲          |

- 差分や端末フレームではなく `text` のスナップショット。更新時は置換する。
- `lines:5` は末尾側を返し `truncated:true`、`lines:200` は `false` だった。
  空行が末尾に多い状態では、5 行指定の `text` が空文字でも `truncated:true` になった。
- `truncated:false` は、この取得範囲での結果であり、過去の全出力の保持を保証しない。
- デフォルトは `format:"text"`, `strip_ansi:true`。
  色付き出力を `format:"ansi", strip_ansi:false` で取得すると ESC シーケンスを含んだ。
- Python 受信・出力プログラムの検証では、出力が変わっても `read.revision` は 0 のままだった。Pane メタデータの revision とも
  一致しない観測がある。**revision 一致を理由に画面更新を省略しない。**
- Alternate screen の消えた行は通常の scrollback から回復できないとの公式説明がある。
  この制約自体の実験は未実施。履歴の完全取得を MVP の契約にしない。

## 入力動作

### テキスト

`pane.send_text` は日本語 UTF-8 と LF をそのまま PTY に送った。
`日本語 phase0\nsecond` の末尾に Enter の自動追加はなかった。
送信先の raw-mode 受信プログラムでバイト列を確認した。

`pane.send_input` に text と `keys:["enter"]` を渡すと、テスト用コマンドを実行できた。
入力の再試行は二重送信になる可能性があるので、切断時に自動再送しない。

受信プログラムが `ESC[?2004h` で bracketed paste を有効化した場合も、
`pane.send_text` の受信バイトには paste の開始・終了ラッパーが付かなかった。
`pane.send_text` と `agent.prompt` を同じ操作とみなさない。

### 特殊キー

以下は raw mode / 通常カーソルモードで確認した実バイト。アダプターはバイトを自作せず、
Herdr の論理キー名へ変換する。アプリ側の名称は今後定義する。

| UI          | Herdr key | hex        |
| ----------- | --------- | ---------- |
| Enter       | `enter`   | `0d`       |
| Escape      | `esc`     | `1b`       |
| Ctrl+C      | `ctrl+c`  | `03`       |
| Arrow Up    | `up`      | `1b 5b 41` |
| Arrow Down  | `down`    | `1b 5b 42` |
| Arrow Left  | `left`    | `1b 5b 44` |
| Arrow Right | `right`   | `1b 5b 43` |

`keys:["up","phase0-invalid-key"]` は `invalid_key` を返した。
受信ファイルに追加バイトはなく、先頭の有効キーだけが送られることもなかった。
Ctrl+C は raw mode で byte `03` を確認したもので、任意のプロセス停止を保証しない。

## エージェントの動作

実際の既存セッションには 4 Agent があり、`idle`, `blocked`, `done` を観測した。
既存 Agent への `agent.read` が `result.type:"pane_read"` と `read` を返すことを確認した。
入力や focus 変更は行っていない。

テスト用 Pane には `pane.report_agent` で合成状態を報告し、`agent.list/get/read` の
処理と `idle`, `working`, `blocked`, `unknown` を確認した。
これは実際の AI プロセスの状態遷移や画面検出精度の検証とは区別する。

省略した AgentInfo の例:

```json
{
  "terminal_id": "term_example",
  "agent": "codex",
  "agent_status": "idle",
  "workspace_id": "w1",
  "tab_id": "w1:t1",
  "pane_id": "w1:p1",
  "focused": true,
  "state_change_seq": 1,
  "revision": 1
}
```

`name`, `title`, `display_agent`, `interactive_ready` 等は省略され得る。
スキーマ上の任意フィールドを必須扱いしない。

| raw status           | アプリの正規化案 | 注意                                                |
| -------------------- | ---------------- | --------------------------------------------------- |
| `idle`               | `idle`           | 入力待ち                                            |
| `working`            | `working`        | 作業中                                              |
| `blocked`            | `blocked`        | 承認や質問等の対話が必要                            |
| `done`               | `done`           | 公式説明では、非表示の間に作業終了した未確認の idle |
| `unknown` / 未知の値 | `unknown`        | 完了とは解釈しない                                  |

公式説明では focus 操作が `done` を既読の `idle` に変え、read は既読にしない。
リモート UI 内の選択と Herdr の focus 操作をどう結びつけるかは実装前に決める。

### プロンプトの確認範囲

- Agent のいない Pane: `agent_not_found`。
- 状態報告だけで Agent として登録した Python 受信プロセス: `agent_not_ready`。
  前景プロセスの同一性を検査しており、報告だけでは送信できない。受信バイトも増えなかった。
- 合成 `blocked` 状態: `agent_blocked`。受信バイトは増えなかった。
- 実 Agent では、2 行の prompt が 1 回の入力として表示され、期待する回答が返った。
  追加の Enter 送信は不要だった。`wait` が完了状態を返すことも確認した。

専用 Agent `phase0-check`（Codex CLI 0.154.0）を検証用 Pane に起動した。
初回のディレクトリ信頼確認中は `agent.start` が `agent_not_ready`
（blocked during startup）を返した。確認後は `interactive_ready:true`, `idle` になった。

実送信 request:

Unix socket の通信例は、1 行が 1 つの JSON メッセージとなる。

<!-- prettier-ignore -->
```json
{"id":"phase0-real-prompt","method":"agent.prompt","params":{"target":"phase0-check","text":"This is a transport verification. Do not use tools or modify files.\nReply with exactly: PHASE0_OK","wait":{"timeout_ms":60000}}}
```

約 6.31 秒後の応答（表示文字列・terminal ID を置換、一部の任意フィールドを省略）:

応答も同じく、1 行が 1 つの JSON メッセージとなる。

<!-- prettier-ignore -->
```json
{"id":"phase0-real-prompt","result":{"type":"agent_prompted","agent":{"terminal_id":"term_example","name":"phase0-check","agent":"codex","agent_status":"idle","workspace_id":"w1","tab_id":"w1:t1","pane_id":"w1:p1","focused":true,"interactive_ready":true,"state_change_seq":5,"revision":44}}}
```

送信前の `state_change_seq` は 3、完了後は 5。`agent.read` で prompt 本文とは
別の回答行 `PHASE0_OK` を確認した。実 Agent では revision も増えたが、
前述の Python プログラムの観測があるため、すべての Pane で増えるとは仮定しない。

複数行入力と自動送信の成功は実測済み。実 Agent 内部の bracketed paste の
正確なバイト列は捕捉していない。`agent_prompt_stalled` の再現と異常系の網羅は
Phase 2 の追加検証対象。wait は個々のターンを識別する保証ではなく、
公式 CLI 説明上、既に working なら進行中ターンの終了でも成立し得る。

## イベント

実測した購読:

```json
{"id":"subscribe","method":"events.subscribe","params":{"subscriptions":[{"type":"pane.agent_status_changed","pane_id":"w1:p1"}]}}
{"id":"subscribe","result":{"type":"subscription_started"}}
{"data":{"agent":"codex","agent_status":"working","pane_id":"w1:p1","workspace_id":"w1"},"event":"pane.agent_status_changed"}
```

購読メッセージは request ID を持たない。`subscription_event` と一般の `event` は
別スキーマであり、上記の dot 区切りと `pane_agent_status_changed` を混同しない。
`pane.created` 購読では、開始前から存在していた Pane の `pane_created` イベントも届いた。
購読直後のメッセージを新規作成と決めつけない。

`events.wait` はスキーマに `pane_exited` 等が載るが、実際には
`unsupported_event_wait_match`（現在は pane agent status のみ）で拒否された。
`match_event.event:"pane_agent_status_changed"` で成立しない状態を 100 ms 待つと
`timeout` が返った。

MVP は polling で進める提案。購読や wait を MVP の必須機能にしない。

## 障害時とライフサイクルの動作

| 条件                                  | 実測                                             |
| ------------------------------------- | ------------------------------------------------ |
| 存在しない／閉鎖済み Pane             | `pane_not_found`、request ID は保持              |
| Agent 不在                            | `agent_not_found`                                |
| Agent の前景不一致                    | `agent_not_ready`                                |
| Agent が blocked                      | `agent_blocked`                                  |
| 無効なキー                            | `invalid_key`、部分入力なし                      |
| 未知の method                         | `invalid_request`、`id:""`                       |
| 壊れた JSON / id 欠落                 | `invalid_request`、`id:""`                       |
| raw source に `recent-unwrapped`      | `invalid_request`。正しい値は `recent_unwrapped` |
| 未対応の wait 条件                    | `unsupported_event_wait_match`                   |
| wait の時間切れ                       | `timeout`                                        |
| JSON を途中まで送ってクライアント切断 | 後続の新規 `ping` は成功                         |
| 検証サーバー停止完了後                | socket が消え、新規接続は `ENOENT`               |
| 検証サーバー再起動後                  | 同一パスで新規 `ping`、一覧取得が成功            |

```json
{"id":"bad-target","error":{"code":"pane_not_found","message":"pane w999:p999 not found"}}
{"id":"","error":{"code":"invalid_request","message":"invalid request: missing field `id` at line 1 column 29"}}
```

`server.stop` の `ok` 受信は停止完了と同時ではない。直後にはまだ接続できる時間があり、
その後サーバープロセスが終了して socket が消えた。再起動時は Pane の terminal ID が変わり、
合成 Agent 状態は `unknown` へ戻った。

アダプターの提案:

- `ENOENT` / 接続拒否 → `HerdrUnavailable`。権限不足は診断上区別する。
- 応答前 EOF / 接続切断 → `TransportDisconnected`。
- `pane_not_found`, `agent_not_found` → `TargetNotFound`。
- 未対応操作 → `UnsupportedOperation`。`invalid_request` を一律に未対応と扱わない。
- 壊れた応答、必須フィールド欠落、予期しない result → `InvalidHerdrResponse`。
- `agent_blocked`, `agent_not_ready`, `timeout` は汎用接続エラーに潰さず、
  利用者が判断できるアプリ側エラーを Phase 2 で定義する。
- 読み取りは次回 polling で再接続可能。入力は送達不明なら再送せず利用者に伝える。
- timeout、応答サイズ上限、JSON 検証をアダプターに実装する。
  壊れた「サーバー応答」の処理は本調査では未実装で、Phase 2 の transport テスト対象。

## ドキュメント・当初の想定との差異

比較元:
[公式 Socket API](https://herdr.dev/docs/socket-api/)、
[公式 CLI reference](https://herdr.dev/docs/cli-reference/)、
インストール版 `herdr --skill` / `herdr api schema --json`。
公式サイトは更新されるため、実機 0.8.2 の観測を優先する。

1. リポジトリの `listPanes(tabId)` は raw API の直接対応ではない。Workspace 一覧から絞る必要がある。
2. Agent の個体 ID は独立した `agent_id` ではない。名前と Pane ID を扱う必要がある。
3. 通常 request を persistent connection で多重化する前提は成立しなかった。
4. CLI の `recent-unwrapped` と raw の `recent_unwrapped` は異なる。
5. 公式 Socket API の汎用エラー例は `not_found` だが、今回の Pane 不在は `pane_not_found`。
6. スキーマの `events.wait` 条件は実装より広い。
7. revision の存在だけでは変更検知に利用できると判断できない。
8. `agent.prompt` には前景プロセス検査があり、単なる text 送信の別名ではない。
9. `agent.read` の成功 result は `agent_read` ではなく `pane_read`。メタデータは `agent.get` で取得する。
10. unknown method の実エラーに `pane.graphics.stream` が列挙されたが、
    bundled request schema の 91 method には含まれていない。MVP 外なので使用しない。

## 実機調査に基づくアダプターの設計方針

Phase 2 向けの提案。公開 API の実装・変更をこの調査で確定するものではない。

1. Raw method、socket path、source 名、response shape は `packages/herdr` だけが扱う。
2. 通常操作は 1 request / 1 connection。接続先は明示設定を受け、ブラウザーに公開しない。
3. 起動時に `ping` と既知の最小応答 shape を検証する。将来版互換を protocol 番号だけで断定しない。
4. `PaneOutput` は text と truncated を中心にし、revision を更新の唯一の根拠にしない。
5. 初期出力は plain text の `recent_unwrapped`、固定上限行数、polling とする案。
6. 特殊キーはアプリ独自 enum → Herdr 論理キー名の明示マッピング。
7. `sendText` と「入力＋Enter」と `sendPrompt` を区別し、送信の自動再試行は避ける。
8. Agent メタデータ取得と Agent 出力取得は別操作。Agent の Pane でプロセスが
   入れ替わり得るため、Pane ID を永続 Agent identity として扱わない。
9. 既知の 5 status は明示変換し、未知の値は `unknown` に落とす。
10. 再接続後は対象一覧を再取得する。Herdr の focus 変更は読み取りと分けて扱う。

## 再確認手順と残項目

同名の検証セッションや `/tmp/herdr-phase0` が既にある場合は再利用せず、
新しい専用名と一時ディレクトリを用意する。

1. `herdr --version` / `herdr status server` / `herdr api schema --json` を確認する。
2. 専用の `HERDR_CONFIG_PATH`, `HERDR_SOCKET_PATH`, `HERDR_SESSION` を指定して
   `herdr server` を起動し、表示される API socket が検証先であることを確認する。
3. `workspace.create` の返却 ID を保存し、以後すべての入力でその Pane ID を明示する。
4. Pane 内で Python の `tty.setraw(0)` + `os.read(0, 4096)` による受信プログラムを動かし、
   日本語・改行・各特殊キーのバイトをファイルに記録する。終了時は termios を復元する。
5. 色付き文字・240 文字の長い行・100 行の連番を出し、source と lines を変えて比較する。
6. 専用 Pane のみで合成状態を報告し、Agent の参照・拒否応答・イベントを確認する。
7. 専用サーバーの socket へ `server.stop` を送り、終了を待ってから接続失敗を確認する。
   同じ設定で再起動し、ID と terminal ID を比較する。終了時も専用サーバーだけを停止する。

残項目:

- Agent の bracketed paste 実バイト、`agent_prompt_stalled` の再現（必要に応じて追加検証）。
- 成功応答途中の切断、壊れたサーバー応答、timeout のアダプター検証（Phase 2）。
- Alternate screen、application cursor mode、長大出力の性能（必要に応じて追加検証）。
- リモート UI の選択を Herdr focus と連動させるか、Agent 操作の公開型（実装前の設計判断）。
