# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm check        # Format (Biome) + type-check (svelte-check + tsc) — run before committing
pnpm test         # Vitest unit tests with coverage
```

`pnpm check` runs three tools in sequence: `biome check --write` → `svelte-check` → `tsc --noEmit`. Fix Biome issues first, then type errors.

## Architecture

### Data Flow

All DB access goes through `src/lib/server/queries.ts` (read) and `src/lib/server/actions.ts` (write). Never write ad-hoc Supabase queries in route files — add a function to those modules instead.

**Query pattern:**
1. Fetch `RawPost[]` from Supabase with nested joins
2. Pass to `enrichPostsWithCounts(supabase, rawPosts, userId)` — batch-fetches likes/reposts/replies in parallel, hydrates quoted posts via separate `.in()` query
3. Result is `Post[]` suitable for the UI

**Critical:** Quoted posts are **not** fetched via inline FK join (`quoted_post:posts!posts_quoted_post_id_fkey`). The PostgREST anon-role schema cache doesn't expose that self-referential FK, causing PGRST200 errors. `enrichPostsWithCounts` handles quoted post hydration separately. Do not add that join back.

### Type Conversions

- `anime_id` is `number` in the DB but `string` in TypeScript `Post`/`Anime` types — use `Number(animeId)` when querying, `String(id)` when returning
- `RawPost` → `Post` conversion happens in `toPost()` inside `queries.ts`
- `studio`, `producer`, `genre`, `official_hashtag` are JSONB arrays (`string[] | null`)

### Auth

`src/hooks.server.ts` creates a per-request Supabase client and attaches it to `event.locals.supabase`. `src/routes/+layout.server.ts` calls `safeGetSession()` (uses `auth.getUser()` for security) and provides `{ session, user, profile, unreadNotificationCount }` to all child routes. Server actions receive `userId` as a parameter — never trust client-provided user identity.

### Supabase / Migrations

The Supabase CLI is installed as a project dev dependency and configured by `supabase/config.toml`.

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm supabase:migrations
pnpm supabase:types
```

Demo seeds are disabled by default.

Migrations are applied with the Supabase CLI (`[db.migrations] enabled = true`). This replaced manual Dashboard application on 2026-09-22, after the remote history was reconciled with the real schema.

- New migration: `supabase/migrations/<NNN>_<name>.sql` using the next free number. Numbers must be unique.
- Apply: `pnpm exec supabase db push --dry-run`, review the list, then `pnpm exec supabase db push`.
- Do not apply migrations from the Dashboard SQL Editor. It leaves the history out of sync, and a batch run there silently skipped 082.
- Never use `--include-all`; it re-runs files that are already applied.
- The CLI (2.107, pinned in the lockfile) sends a migration file's statements and its history row as one batch, which PostgreSQL runs as a single implicit transaction. A file is all-or-nothing, and `LOCK TABLE` holds until the file ends, so explicit `BEGIN`/`COMMIT` is not needed. The comment in `132_like_repost_notification_dedupe.sql` saying each statement autocommits is wrong; that file is applied, so it is left as is.
- Avoid `CREATE INDEX CONCURRENTLY`; a plain `CREATE INDEX` is fine at current data volumes. CONCURRENTLY fails inside the batch transaction. If it is truly needed, put it in its own file, run it by hand one statement at a time outside a transaction, then record it with `pnpm exec supabase migration repair --status applied <NNN>`.
- CLI releases from August 2026 run `CONCURRENTLY` index statements, `VACUUM`, `CLUSTER` and `ALTER SYSTEM` outside the batch, after committing the statements before them. When upgrading the CLI, keep such statements out of files that need to be atomic.
- Before running `migration repair`, check the real remote state (function bodies, policy conditions, indexes), not just the presence of one object or a history row.
- `supabase/migrations_archive/` holds files whose version duplicated an applied migration or had no version, which blocked `db push`. Their contents are already in production; keep them for history and do not re-apply them.
- `db reset` targets the local database only; never run it against the linked project.

RLS is enforced for all tables. The `posts` select policy uses `USING (true)` — all posts are publicly readable.

### Key Files

| File | Purpose |
|---|---|
| `src/lib/server/queries.ts` | All read queries; `enrichPostsWithCounts`, `toPost`, `getTimelinePosts`, etc. |
| `src/lib/server/actions.ts` | All mutations; `insertPostWithHashtags`, `toggleLikeAction`, `upsertUserAnimeEntry`, etc. |
| `src/lib/types.ts` | `Post`, `RawPost`, `Profile`, `Anime`, `Event`, `Notification`, `AnimeStatus` |
| `src/lib/supabase/database.types.ts` | Auto-generated DB types — do not edit manually |
| `src/hooks.server.ts` | Supabase client setup + `safeGetSession` |
| `src/routes/+layout.server.ts` | Global session/profile hydration for all routes |

### Route Conventions

- Route files use `+page.server.ts` for data loading (returns typed `PageData`) and server actions
- Form actions call helpers from `actions.ts`, passing `request`, `supabase`, and `userId`
- API routes live under `src/routes/api/` (e.g., `/api/posts` for post creation)
- Path alias `$lib/` maps to `src/lib/`
