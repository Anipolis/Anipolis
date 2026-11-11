# 本番のデプロイ（Cloudflare Workers）

本番は Cloudflare Workers（静的アセット + `_worker.js`）で動かす。設定は `wrangler.jsonc` が正本で、
`@sveltejs/adapter-cloudflare` が `.svelte-kit/cloudflare` に `_worker.js` と静的ファイルを書き出す。

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm build` | ビルドだけ行う（`.svelte-kit/cloudflare` に出力） |
| `pnpm preview:worker` | ビルド結果を `wrangler dev` で本番と同じ形で動かす（既定は http://localhost:8787） |
| `pnpm deploy:dry-run` | ビルドして `wrangler deploy --dry-run`。設定の検証とバンドルサイズの確認だけ行い、アップロードしない |
| `pnpm deploy` | ビルドして `wrangler deploy`。実際にアップロードする |

初回だけ `pnpm exec wrangler login` が必要。CI（`.github/workflows/verification.yml`）は `pnpm deploy:dry-run` までで、
デプロイは行わない。

## 環境変数は「ビルド時に埋まるもの」と「実行時に読むもの」に分かれる

Workers では、Pages のときのように「プロジェクトに設定した環境変数がビルドにも実行にも使える」わけではない。
SvelteKit の `$env/static/*` は**ビルド時に埋め込まれる**ので、ビルドする環境に値が要る。

| 種類 | 変数 | 必要な場所 |
|---|---|---|
| ビルド時に埋め込む | `PUBLIC_SUPABASE_URL`（`$env/static/public`）、`DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID`（`$env/static/private`） | `pnpm build` を実行する環境（手元の `.env`、または Workers Builds のビルド変数） |
| 実行時に読む | `SUPABASE_SECRET_KEY`、`MULTI_ACCOUNT_COOKIE_SECRET`、`MAL_*`、`ANNICT_ACCESS_TOKEN`、`ADMIN_*`、`PUBLIC_*` など `$env/dynamic/*` で読んでいるもの | Worker の変数・シークレット（`wrangler secret put` かダッシュボード） |

値の一覧は `.env.example` にある。シークレットはリポジトリにもビルドログにも出さないこと。

## Pages から切り替えるときの手順

1. `pnpm deploy` で Worker `anipolis` を作る（この時点ではまだドメインは Pages を向いている）
2. Worker の Variables and Secrets に、実行時に読む変数を入れる
3. ダッシュボードで Worker に Custom Domain を割り当てる。Pages 側の同じドメインは先に外す
4. `pnpm preview:worker` か、割り当てたドメインで `/`・`/api/anime/count`・静的ファイル（`/anipolis-logo-dark.png`）・存在しない URL の 404 を確認する
5. 問題があれば Pages 側のデプロイにドメインを戻す

`wrangler.jsonc` の `assets.binding` は `ASSETS` から変えない。`_worker.js` が `env.ASSETS` で静的ファイルを読んでいる。

## 確認済みのこと（2026-11-11）

- `pnpm deploy:dry-run` が成功し、Worker のバンドルは gzip 699 KiB（無料プランの上限 3 MiB に対して余裕がある）
- `pnpm preview:worker` で `/` が 200（CSP の nonce 付き）、`/api/anime/count` が 200、静的ファイルが 200、未知の URL が 404
- `wrangler` 4.94.0 の workerd は `compatibility_date = "2026-11-01"` を扱えず `wrangler dev` が起動しないため、4.159.0 に上げてある
