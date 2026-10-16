# ステージング（確認用の Supabase）

開発中の動作確認やテスト用アカウントの作成で、本番の DB に触れないための確認用プロジェクト。
本番と同じシンガポール（ap-southeast-1）にある。

- **入っているもの**: 本番と同じテーブル定義・権限設定（RLS・Storage のポリシー）・定期実行（pg_cron）、本番から写した作品データ
- **入っていないもの**: 本番の利用者のデータ（アカウント・投稿・マイリストなど）。代わりに `pnpm staging:seed` でテスト用のものを作る
- **カバー画像**: 写さずに本番の公開 URL をそのまま表示している（`anime.cover_url` が本番を指す）
- **ログイン**: メールとパスワードだけ。Google・Discord・X は各サービスに戻り先を登録していないので使えない。確認メールは送らない設定

## 使い方

| コマンド | 内容 |
|---|---|
| `pnpm dev` | ステージングにつないで開発サーバーを起動（`.env.staging` を `.env` より優先して読む） |
| `pnpm dev:prod` | 本番の DB につないで起動（必要なときだけ） |
| `pnpm staging:seed` | テスト用のアカウント・投稿などを作る（作成済みなら何もしない。前回が途中で失敗していたら作り直す。`-- --reset` で必ず作り直し） |
| `pnpm staging:db-push` | ステージングに未適用の migration を確認（`-- --apply` で実際に流す） |

開発サーバーの画面上部に、つながっている DB が出る（緑「ステージング」／赤「本番 DB」「接続先不明」）。目印ではなく実際の接続先 URL で判定する。本番のサイトには出ない。
`.env.staging` に本番の URL を書いてしまった場合、開発サーバーはページを返さずにエラーで止まる。

`.env.staging` が無い環境では、`pnpm dev` も本番の `.env` の値で動く（上部は赤「本番 DB」）。

### テスト用アカウント（`pnpm staging:seed`）

| アカウント | 立場 |
|---|---|
| `stg_admin@anipolis.example` | 管理者 |
| `stg_alice@anipolis.example` | ふつうのアカウント（マイリスト公開） |
| `stg_bob@anipolis.example` | 鍵アカウント（ありすからのフォロー申請が届いている） |
| `stg_carol@anipolis.example` | マイリスト非公開 |

- パスワードは全員共通で、`.env.staging` の `STAGING_SEED_PASSWORD`
- 新規登録を試すときの招待コードは `STAGING001`
- 実況の投稿は、作った時点で放送が始まっている直近の話数ルームに入る（実行時に URL を表示する）

## migration の流れ

1. `pnpm staging:db-push` で、流れる migration を確認する
2. `pnpm staging:db-push -- --apply` でステージングに流し、画面で確かめる
3. `pnpm exec supabase db push`（リンク先 = 本番）で本番に流す

ステージングへは CLI のリンク先を切り替えず、`--db-url` で接続先を明示する（取り違えて本番に流さないため）。
`scripts/staging/` のスクリプトは `.env.staging` の `PUBLIC_ANIPOLIS_ENV=staging` が無いと動かず、接続先が本番と同じなら止まる。

## `.env.staging`

Git には入らない（`.gitignore` の `.env.*`）。項目は次のとおり。

| 項目 | 値 |
|---|---|
| `PUBLIC_SUPABASE_URL` | Project Settings → Data API の Project URL（`https://<ref>.supabase.co`。末尾に `/rest/v1/` を付けない） |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | Project Settings → API Keys |
| `STAGING_DB_URL` | 画面上部の Connect → **Session pooler** の接続文字列（Direct は IPv6 専用でつながらないことがある） |
| `PUBLIC_ANIPOLIS_ENV` | `staging`（目印） |
| `STAGING_SEED_PASSWORD` | テスト用アカウントの共通パスワード |
| `MULTI_ACCOUNT_COOKIE_SECRET` | 本番とは別の値 |
| Discord・MAL・Annict の項目 | 空欄のまま残す（空欄が `.env` の本番の値を打ち消す） |

## 作り直すとき（定義やデータを本番に合わせ直す）

migration を 001 から順に流しても本番と同じにはならない（途中で失敗する。過去に Dashboard から直接変えた分や、記録だけ適用済みで中身が入っていない migration があるため）。
そのため、本番の今の定義を書き出して写す。Docker Desktop が必要（`supabase db dump` が中で使う）。

1. 本番から書き出す（読み取りだけ）
   - 定義: `pnpm exec supabase db dump --linked -f prod_schema.sql`
   - `auth.users` のトリガーと Storage のポリシーは上の書き出しに入らないので、`-s auth` と `-s storage` でも書き出し、`CREATE TRIGGER "on_auth_user_created"` と `CREATE POLICY ... ON "storage"."objects"` の行だけを取り出す
   - 作品データ: `pnpm exec supabase db dump --linked --data-only --use-copy -s public -x public.<利用者のテーブル> ... -f catalog.sql`
     （写すのは anime・anime_*（exchange_entries / mutes / recommendations を除く）・studio_*・syobocal_*・broadcast_room_sessions・broadcast_room_overrides・episode_rooms・app_config。利用者のテーブルはすべて `-x` で外す）
2. ステージングの public スキーマの中身・`on_auth_user_created`・Storage のポリシー・`supabase_migrations.schema_migrations` を消す
3. 書き出した定義 → トリガーとポリシー → 作品データの順に `psql "$STAGING_DB_URL" -f ...` で流す（psql は `public.ecr.aws/supabase/postgres` のイメージに入っている）
4. 作品データの中で利用者を指す列を空にする（`anime_copyright_reviews.resolved_by`、`broadcast_room_sessions.event_id`）
5. バケットを本番と同じ設定で作る（公開・容量上限・形式。Storage API の `createBucket`）
6. 定期実行を登録する（`dispatch-broadcast-notifications` 毎分、`purge-released-usernames` 毎日 4:17。中身は migration 070・150）
7. migration の記録をそろえる: `supabase migration repair --db-url "$STAGING_DB_URL" --status applied <全 migration の番号>`
8. `pnpm staging:db-push` が「up to date」になることを確かめ、`pnpm staging:seed` を流す

## 注意

- 無料プランなので、1週間使わないと一時停止する。止まったら Dashboard の Restore で戻す
- 本番の東京リージョンへの引っ越し（Issue #449）は、ここで手順を練習してから行う
