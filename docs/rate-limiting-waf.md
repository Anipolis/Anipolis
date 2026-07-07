# レート制限とCloudflare WAFルール適用手順（S2対応）

## 背景

アプリのレート制限は `src/lib/server/rate-limit.ts` の**インメモリ固定ウィンドウ方式**で実装されている。これは単一インスタンス内の連投・スパム・安価なDoSを止める一次防壁としては機能するが、本番の **Cloudflare Workers（`@sveltejs/adapter-cloudflare`）では isolate ごと・コロケーションごとにメモリが分離**され、isolate は頻繁に破棄・再生成される。そのためカウントがインスタンス間で共有されず、**恒久的な保証にはならない**（`rate-limit.ts` 冒頭コメントも同旨）。

恒久対策として、エッジで永続的に効く **Cloudflare Rate Limiting Rules（WAF）** を追加する。これはコード変更不要で、ダッシュボード権限を持つ担当者が設定する運用作業である。

> **コード側の現状（PR #155 時点）**
> - `/api/*` は `hooks.server.ts` でインメモリのIP単位制限が適用済み（`API_RATE_RULES`）。
> - 認証系 form action（`login` / `register` / `addAccount` / `setPassword`）にもコード側の一次制限を追加済み。
> - WAFルールはこれらの**上位の恒久防壁**として重ねて設定する（多層防御）。コード側の制限は残す。

---

## 保護対象エンドポイント一覧

### API ルート（`hooks.server.ts` の既存インメモリ制限）

| 経路 | メソッド | コード側の制限 | WAF 推奨 |
|---|---|---|---|
| `/api/upload`（配下含む） | POST | 10 / 60s | 20 / 60s |
| `/api/posts` | POST | 20 / 60s | 40 / 60s |
| `/api/reports` | POST | 5 / 60s | 10 / 60s |
| `/api/posts/*/reactions` | 全 | 60 / 60s | 120 / 60s |
| `/api/anime/search`, `/api/users/search` | 全 | 30 / 10s | 60 / 10s |
| `/api/anime/count` | 全 | 30 / 10s | 60 / 10s |
| `/api/rooms/posts` | 全 | 60 / 60s | 120 / 60s |
| `/api/room-experiment-visits` | POST | 60 / 60s | 120 / 60s |
| `/api/room-experiment-visits/*/(heartbeat\|exit)` | POST | 180 / 60s | 300 / 60s |
| `/api/room-exit-surveys` | POST | 20 / 60s | 40 / 60s |
| `/api/account-switch` | POST | 10 / 60s | 20 / 60s |

> WAF 側はコード側より**やや緩め**の閾値にして、正常系を巻き込まずにインメモリ制限をすり抜けた濫用だけを止める二段構えにするのが安全。運用ログを見て調整する。

### 認証系 form action（SvelteKit — POST + `?/<action>` クエリ）

SvelteKit の form action は「ページのパス + `?/<action名>` クエリ」への **POST** で発火する。WAF ではパス（`http.request.uri.path`）とクエリ（`http.request.uri.query`）で識別する。

| 経路（パス + クエリ） | 制限したい操作 | コード側の制限 | WAF 推奨 |
|---|---|---|---|
| `/auth` + `query contains "/login"` | パスワードログイン総当たり | 10 / 5min（IP） | 20 / 10min（IP） |
| `/auth` + `query contains "/register"` | アカウント大量作成 | 5 / 10min（IP） | 15 / 60min（IP） |
| `/auth` + `query contains "/addAccount"` | 他人アカウントの総当たり | 5 / 10min（ユーザー） | 20 / 10min（IP） |
| `/settings/account/password` + `query contains "/setPassword"` | 現在パスワード総当たり | 5 / 15min（ユーザー） | 15 / 15min（IP） |

> `addAccount` / `setPassword` のコード側はログイン中ユーザーID単位。WAF はIP単位でしか見られないため、**IP単位の粗い上限**を重ねる位置づけ。ユーザー単位の精密な制限はコード側が担う。

---

## 適用手順（Cloudflare ダッシュボード）

Cloudflare の **Security → WAF → Rate limiting rules**（プランにより **Security → Bots** 近傍）から設定する。Workers/Pages でカスタムドメインを運用している前提。

> 無料プランでも Rate limiting rules は1ルール利用可能。複数ルールが必要なら Pro 以上、または後述の Cloudflare Workers KV / Durable Objects 方式を検討。

### 手順（各ルール共通）

1. 対象ゾーン（Anipolis のドメイン）を選択。
2. **Security → WAF → Rate limiting rules → Create rule**。
3. **Rule name**: 下記の例に沿った識別名（例 `api-upload-post`）。
4. **If incoming requests match**（Expression）: 下記のマッチ式を入力。
5. **When rate exceeds**: 下表の閾値（Requests / Period）。
6. **Counting characteristics**: `IP`（送信元IP単位）。ログイン中の識別が必要な操作もWAFではIPで数える。
7. **Then take action**: `Block`（またはまず `Managed Challenge` で様子見 → 問題なければ `Block`）。
8. **Duration**（ブロック継続時間）: 例 60s〜600s。
9. Deploy。

### マッチ式の例

**API アップロード（POST）**
```
(http.request.method eq "POST" and starts_with(http.request.uri.path, "/api/upload"))
```
→ 20 requests / 60 seconds / IP → Block 60s

**投稿作成（POST /api/posts）**
```
(http.request.method eq "POST" and http.request.uri.path eq "/api/posts")
```
→ 40 / 60s / IP

**検索（anime / users）**
```
(starts_with(http.request.uri.path, "/api/anime/search") or starts_with(http.request.uri.path, "/api/users/search"))
```
→ 60 / 10s / IP

**ログイン総当たり（/auth?/login への POST）**
```
(http.request.method eq "POST" and http.request.uri.path eq "/auth" and http.request.uri.query contains "/login")
```
→ 20 / 10min / IP → Block 600s（またはまず Managed Challenge）

**新規登録（/auth?/register）**
```
(http.request.method eq "POST" and http.request.uri.path eq "/auth" and http.request.uri.query contains "/register")
```
→ 15 / 60min / IP

**パスワード変更の現在パスワード検証（/settings/account/password?/setPassword）**
```
(http.request.method eq "POST" and http.request.uri.path eq "/settings/account/password" and http.request.uri.query contains "/setPassword")
```
→ 15 / 15min / IP

> **まとめて1本にする場合（無料プラン向け）**: ルール数を絞りたいときは、まず「全 `/api/*` POST を IP単位で 300 / 60s」＋「`/auth` と `/settings/account/password` の POST を IP単位で 30 / 10min」の2本に集約し、濫用が見えたら個別ルールへ分割する。

---

## 適用後の確認

1. **正常系を壊していないこと**: 実況中の連投（`/api/posts`）、ルームのライブ更新ポーリング（`/api/rooms/posts`・heartbeat）が閾値に達しないか。ログイン・投稿・画像アップロードを通しで実施。
2. **濫用系がブロックされること**: 同一IPから閾値超の連続リクエスト（例 `for` ループの curl）を送り、`429`（コード側）または `403`/challenge（WAF側）になることを確認。
3. **WAF イベントログ**（Security → Events）で、想定どおりのルールがマッチしているか、正常ユーザーの誤爆がないかを数日モニタリングして閾値を調整。

## 補足: コード側の恒久対策（将来）

WAF は最優先の恒久対策だが、**ユーザー単位・きめ細かい制限**はエッジのIP単位では表現しきれない。中期的には `rate-limit.ts` のインメモリ実装を **Cloudflare Workers KV / Durable Objects** ベースに置き換えると、isolate 間で共有される正確なカウントが得られる。その際もWAFはDDoS的な粗い防壁として併用する。

- Durable Objects: 強整合なカウンタ。厳密なレート制限に最適だが実装コスト高。
- Workers KV: 結果整合。ゆるめの制限なら十分・低コスト。
