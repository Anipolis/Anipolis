# AGENTS.md

This file is the shared operating manual for AI-assisted development in Anipolis. It is intended for Codex, Claude Code, Cursor, and future coding agents working in this repository.

Anipolis is a social anime platform. Treat it as a community product first and an anime database second.

## Project Philosophy

Anipolis is a next-generation anime community platform centered on shared viewing, episode-centered conversation, and emotionally rich fandom spaces.

The product direction blends:

- MyAnimeList / AniList style anime identity, lists, scoring, and metadata.
- Twitter/X style timelines, follows, mentions, reposts, quote posts, and fast social discovery.
- NicoNico and live-stream chat culture: people reacting together around a shared moment.
- Reddit and Discord style fandom depth: durable discussion hubs, communities, and event spaces.

The goal is not rage engagement, doom scrolling, or addiction loops. Build toward long-term community health.

Prioritize:

- Discussion-first features: posts, replies, quote posts, hashtags, episode threads, watch-room timelines.
- Fandom identity: anime-linked posts, profile anime lists, public list sharing, avatar-rich user surfaces.
- Shared emotion: live reactions, countdowns, event rooms, visible social presence, lightweight celebration.
- Timeline readability: dense enough to feel alive, never so busy that conversation becomes unreadable.
- Healthy community mechanics: clear context, predictable moderation paths, respectful defaults.

Avoid:

- Engagement bait such as rage-ranking, manipulative streaks, forced infinite loops, or dark patterns.
- Generic "content platform" features that erase the anime/community context.
- Enterprise SaaS or sterile admin-dashboard aesthetics.
- Optimizing only for metadata completeness while neglecting conversation around episodes and moments.

Concrete examples:

- A new anime detail page feature should help users talk about the show: "posts mentioning this anime", "friends watching", "upcoming watch events", or "episode reactions" are better fits than a purely encyclopedic info table.
- A notification feature should help users return to meaningful interactions: replies, mentions, follows, event reminders, and watch-room activity are more aligned than generic popularity nags.
- A ranking feature should be transparent and calm. Prefer "trending this week among discussions" with context over inflammatory leaderboards.

## Tech Stack

Detected from the repository:

- Runtime: Node.js `24.14.1`, managed by `mise`.
- Package manager: `pnpm` `10.33.2`.
- Framework: SvelteKit `^2.50.2` with Svelte `^5.54.0`.
- Build tool: Vite `^7.3.1`.
- Deployment adapter: `@sveltejs/adapter-auto`. `CLAUDE.md` mentions Cloudflare Pages as the hosting assumption, but this repo currently uses adapter-auto rather than a Cloudflare-specific adapter.
- Database/backend: Supabase, using `@supabase/supabase-js` and `@supabase/ssr`.
- Auth: Supabase Auth through server-side SvelteKit hooks.
- Styling: global CSS in `src/app.css` plus UnoCSS utilities and Iconify Lucide icons through `@unocss/preset-icons`.
- Fonts: UnoCSS web fonts config references `Zen Maru Gothic`.
- Formatting/linting: Biome `2.4.10`.
- Type checking: `svelte-check` and `tsc --noEmit`.
- Tests: Vitest `4.x` with `happy-dom` for Svelte component tests and Node for server tests.

Important assumptions:

- The app connects to remote Supabase (`supabase.co`). The Supabase CLI is installed locally and configured by `supabase/config.toml`; each developer must authenticate and link their checkout to the intended project.
- Database row-level security is part of the security model. Do not treat client-side checks as sufficient.
- `src/lib/supabase/database.types.ts` is generated and should not be hand-edited.

## Repository Structure

High-level layout:

```text
.
|-- src/
|   |-- app.css                  # Global design system, layout, component classes
|   |-- app.html
|   |-- hooks.server.ts          # Per-request Supabase client and safe session handling
|   |-- lib/
|   |   |-- components/          # Reusable Svelte UI components
|   |   |-- server/
|   |   |   |-- actions.ts       # Shared mutations
|   |   |   `-- queries.ts       # Shared reads and data enrichment
|   |   |-- supabase/
|   |   |   `-- database.types.ts
|   |   |-- types.ts             # App-wide domain types and conversions
|   |   |-- types/               # Additional feature/domain types
|   |   |-- utils/               # Small pure helpers
|   |   `-- mock/                # Mock timeline data used by older/prototype paths
|   `-- routes/
|       |-- +layout.*            # Global layout and session/profile hydration
|       |-- +page.*              # Main timeline
|       |-- anime/               # Anime list and anime detail routes
|       |-- api/                 # SvelteKit API endpoints
|       |-- calendar/            # Event calendar
|       |-- events/              # Watch event pages
|       |-- hashtag/             # Hashtag timelines
|       |-- mylist/              # User anime list
|       |-- notifications/       # Notifications
|       |-- posts/               # Post detail/reply threads
|       |-- profile/             # Profile, followers, following
|       |-- search/              # Search
|       `-- settings/            # Profile/settings flows
|-- supabase/
|   |-- migrations/              # SQL migrations managed through the Supabase CLI
|   `-- seeds/                   # Demo seed data
|-- package.json
|-- biome.jsonc
|-- uno.config.ts
|-- vite.config.ts
|-- vitest.config.ts
`-- mise.toml
```

Architectural boundaries:

- Route files should orchestrate, validate request context, and render. They should not grow into data-access dumping grounds.
- Read queries belong in `src/lib/server/queries.ts`.
- Mutations belong in `src/lib/server/actions.ts`.
- Shared domain types and conversion helpers belong in `src/lib/types.ts` or a feature-specific type file under `src/lib/types/`.
- Reusable interface pieces belong in `src/lib/components/`.
- Feature-specific UI may start in its route folder. If reused by multiple routes, promote it to `src/lib/components/`.
- Database schema changes belong in `supabase/migrations/`, with RLS policies considered part of the feature.

Prefer feature-based organization as the app grows. For large new systems such as watch rooms or episode hubs, create a clear feature surface rather than scattering logic across unrelated files. A future structure like `src/lib/features/watch-room/` is acceptable if the feature becomes too large for the current flat `components/server` split.

## Data Flow And Supabase Rules

All DB access should go through `src/lib/server/queries.ts` for reads and `src/lib/server/actions.ts` for writes unless there is a strong reason to keep a tiny route-local query. If you add route-local Supabase access, explain why in the change.

Current post query pattern:

1. Fetch `RawPost[]` from Supabase with nested joins for profile, hashtags, and anime.
2. Pass rows to `enrichPostsWithCounts(supabase, rawPosts, userId)`.
3. `enrichPostsWithCounts` batch-fetches likes, reposts, replies, current-user state, anime list scores, and quoted posts.
4. Convert via `toPost()` into `Post[]` for UI.

Critical constraint:

- Do not fetch quoted posts through an inline self-referential FK join such as `quoted_post:posts!posts_quoted_post_id_fkey`. The anon-role PostgREST schema cache has previously failed to expose that FK and caused `PGRST200` errors. Keep quoted-post hydration separate unless the Supabase schema/cache behavior is deliberately changed and verified.

Type conversion rules:

- `anime.id` / `anime_id` is numeric in the database but usually string-shaped in app-level `Anime` and `Post` types.
- Use `Number(animeId)` when querying Supabase and `String(id)` when returning app types.
- `studio`, `producer`, `genre`, and `official_hashtag` are JSONB arrays represented as `string[] | null`.

Auth rules:

- `src/hooks.server.ts` creates a per-request Supabase client and attaches it to `event.locals.supabase`.
- `src/routes/+layout.server.ts` calls `safeGetSession()`, which uses `auth.getUser()` for secure user validation.
- Server actions must derive identity from `safeGetSession()` or trusted server context. Never trust client-provided `user_id`.
- RLS should enforce ownership and visibility. App checks are still useful for UX but are not the security boundary.

## Code Review Rules

Write review findings in Japanese. Report actionable defects introduced or exposed by the PR, with the triggering conditions, user impact, and the affected code path. Check the relevant callers and latest migrations before reporting; distinguish reproduced behavior from inference. Assign severity from actual impact, without promoting minor issues to fit a reporting threshold. Leave formatting and other mechanical checks to CI.

### Authorization and content visibility

- Treat direct Supabase REST/RPC calls as reachable by clients. App validation alone must not protect ownership, block restrictions, or write limits. Check RLS, SQL NULL behavior, and SECURITY DEFINER privileges; an RLS-filtered empty result is not proof that a forbidden relationship does not exist. Rate limits must use trusted time and atomic accounting that cannot be reset by deleting posts.
- Preserve private-account, block, BAN, and moderation visibility across posts, quotes, notifications, images, and caches. Before service-role signing or deletion, verify the image path's ownership as well as the referring post's visibility: a user-controlled image URL in a readable post is not authorization for that object. Explicit owner/admin access and the documented lifetime of already-issued signed URLs are valid exceptions. CW-protected text must remain concealed in previews and overlays until the viewer chooses to reveal it.

### Deletion and schema changes

- Follow foreign-key cascades and Storage pagination when reviewing account deletion or cleanup. Preserve records intended to survive their author's departure (including third-party invite redemptions and pending reports), handle nullable authors in queries and UI, and do not continue account deletion after incomplete Storage cleanup. An image's creation time alone does not prove that it is unused: cleanup must respect valid drafts and the enforced image-use lifetime.
- Check migration compatibility with the stated deployment order and all callers, including direct RPC access. Keep quoted-post hydration separate from the inline self-FK join described above unless the schema/cache change is explicitly verified. For SQL behavior, prefer isolated DB checks where available; do not apply production migrations or delete real accounts/files to validate a review. State which behavior remains unverified.

### Async state and complete results

- Late responses must not restore a discarded draft, cleared room/CW selection, superseded search, or previous account's state. Trace invalidation on explicit user changes and unmount; use cancellation or generation checks where needed. Check whether an existing keyed component already resets state before reporting a missing reset. A failed refresh must not be interpreted as proof that displayed posts were deleted or became invisible.
- Respect RPC batch limits and paginate complete datasets when the operation requires all rows. Sorting and filtering must happen over the intended candidate set before page boundaries, with stable tie-breaking; do not rank only a truncated subset. Partial count failures must not silently become zero counts or false reaction states, and new replies must remain reachable after an already-open thread refreshes.

## Coding Standards

TypeScript:

- The repo extends `@tsconfig/strictest`; keep strictness intact.
- Avoid `any`. If Supabase type limitations force a cast, keep it narrow, local, and documented by code shape rather than broad escape hatches.
- Prefer explicit domain types for route data, helper returns, and component props.
- Use `import type` for type-only imports.
- Do not manually edit generated Supabase types.

Svelte and Reactivity:

- Use Svelte 5 idioms already present in the repo: `$props`, `$state`, `$derived` when writing rune-based components.
- Keep components small enough to scan. If a component accumulates unrelated concerns, split it into focused children.
- Route `+page.server.ts` files should load data and delegate domain logic to helpers.
- Prefer progressive enhancement and normal SvelteKit form actions for mutations where possible.
- Keep optimistic UI local and reversible. A social action like like/repost may optimistically update, but failures should not leave the UI lying.

Components:

- Component names use PascalCase, e.g. `PostComposer.svelte`, `TrendingPanel.svelte`.
- Props interfaces should be named `Props` for local Svelte components unless exported/shared.
- Reusable components should not import route-specific `$types`.
- UI components should receive domain data and callbacks/forms; they should not independently invent DB access.

Styling:

- The design system is currently centralized in `src/app.css` with CSS variables such as `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, and `--color-accent`.
- UnoCSS is available for utilities and Lucide icons (`i-lucide-*`). Use icons for recognizable actions like heart, repeat, search, bell, image, calendar, settings, and close.
- Dark mode is the primary visual mode. Light theme exists through `[data-theme="light"]`; do not break it.
- Keep layouts mobile-first and verify narrow screens, especially timeline, composer, modal, nav, and sidebar behavior.
- Avoid one-off colors when a CSS variable exists.
- Avoid huge whitespace and oversized marketing sections. This app should feel like a living community surface, not a landing page.

Naming:

- Prefer clear words over abbreviations: `user`, `button`, `notification`, `animeId`, not `usr`, `btn`, `notif`, `aid`.
- Use `camelCase` for variables/functions, `PascalCase` for types/components, and kebab-ish route names as SvelteKit requires.
- Use database column names only at the database boundary. Convert to app-friendly types before UI when practical.

File size and abstraction:

- Prioritize readability over clever abstraction.
- Do not create generic frameworks for one feature.
- Split files when a reader must understand unrelated domains at once.
- If a helper hides important domain behavior, name it specifically, e.g. `enrichPostsWithCounts`, not `processData`.

Error handling:

- Server actions should return `fail(status, { message })` for user-correctable problems.
- Log unexpected Supabase errors on the server with enough context to debug, but never log secrets.
- Use Japanese user-facing messages if modifying nearby Japanese UI. Preserve the product language of the surrounding surface.
- Avoid swallowing errors silently when they affect user trust. It is acceptable to ignore non-critical side effects such as duplicate hashtag inserts or best-effort notifications when the main action succeeds.

## UI / UX Guidance

Anipolis should feel modern, socially alive, anime-community oriented, dense but readable, and emotionally expressive.

Good UI direction:

- Avatar-rich timelines with clear display names, handles, timestamps, reply/repost/like counts, and anime context.
- Compact social surfaces that make it easy to scan many posts without feeling cramped.
- Anime cards that show covers prominently; fandom is visual.
- Reactions that feel immediate: hover states, active states, loading/disabled states, and subtle transitions.
- Hashtags and anime links that make discovery feel natural.
- Event and watch-room pages that emphasize shared time: countdowns, live badges, timeline activity, and who is present.

Avoid:

- Enterprise dashboards with giant metric cards unless building an actual admin-only tool.
- Sterile tables for fan-facing features when a social/feed/card structure would better carry emotion.
- Excessive whitespace that makes the app feel empty.
- Generic placeholder imagery or icon-only anime identity when cover art is available.
- UI that hides context. A reply, reaction, quote, or event should make it clear what anime, episode, person, or moment it belongs to.

Accessibility expectations:

- Buttons need accessible labels when the visible content is icon-only.
- Images need useful `alt` text, or empty `alt` only when decorative.
- Modals should have `role="dialog"`, `aria-modal`, labelled headings, and keyboard-friendly close behavior.
- Do not rely on color alone to communicate destructive or active states.
- Maintain readable contrast in both dark and light themes.

## AI Agent Workflow Rules

Before changing code:

- Read nearby files first. Follow existing route, component, and Supabase patterns.
- Check `CLAUDE.md` as well; it may contain recently discovered implementation hazards.
- Keep diffs minimal and scoped to the requested feature or fix.
- Avoid unrelated refactors, formatting churn, dependency changes, or schema changes.

When implementing features:

- Start from the route and data model: what does the user see, what does the server load, what mutations are needed, and what RLS policy protects them?
- Add reads to `queries.ts` and writes to `actions.ts` unless there is a clear local-only reason.
- Add or update domain types near the conversion boundary.
- Include empty, loading, unauthorized, and error states where relevant.
- For social features, think through notification effects, timeline visibility, counts, and privacy.

When refactoring:

- Preserve behavior first. Make mechanical moves separately from behavior changes when possible.
- Explain large architectural changes in the final response and, if applicable, in code comments or docs.
- Do not "clean up" mojibake or old prototype files opportunistically unless the task is about text cleanup; it creates noisy diffs.

When debugging:

- Reproduce with the smallest command or route path available.
- Check Supabase query shapes, RLS, nullability, and numeric/string ID conversions.
- Watch for generated type drift after migrations.
- Be especially careful around quoted posts, anime IDs, notification actor joins, and current-user state.

When writing tests:

- Use Vitest.
- Component tests should be `src/**/*.svelte.test.ts` and run in `happy-dom`.
- Server/unit tests should be `src/**/*.test.ts` and avoid `*.svelte.test.ts`.
- `expect.requireAssertions` is enabled, so tests must include assertions.
- Prefer focused tests around pure helpers, data conversion, validation, and tricky UI state.

Before finishing:

- Run `pnpm check` whenever dependencies are installed and the command is available.
- Run `pnpm test` when logic changes, helper behavior changes, or the risk justifies it.
- If a command cannot be run, say why and what remains unverified.
- Summarize only the important changes and call out any follow-up risks.

## Commands

Use these commands from the repository root:

```bash
mise install          # Install configured Node, pnpm, and Biome versions
pnpm install         # Install dependencies
pnpm dev             # Start the dev server against the staging Supabase (.env.staging; see docs/staging.md)
pnpm dev:prod        # Start the dev server against the production Supabase (.env)
pnpm staging:seed    # Create test accounts/posts in staging
pnpm staging:db-push # Dry-run migrations against staging (-- --apply to apply)
pnpm build           # Production build
pnpm preview         # Preview the production build
pnpm supabase:version # Show the installed Supabase CLI version
pnpm supabase:migrations # Compare local and remote migration history
pnpm supabase:types  # Regenerate src/lib/supabase/database.types.ts from the linked project
pnpm check:biome     # Read-only Biome check
pnpm check:svelte    # svelte-kit sync + svelte-check
pnpm check:types     # tsc --noEmit
pnpm check           # Biome + Svelte check + tsc + anime-view type check
pnpm test:unit       # Vitest unit tests with coverage
pnpm test            # Unit test suite
```

Notes:

- `pnpm check` checks source files without auto-fixing them; SvelteKit sync may regenerate local framework artifacts. `package.json` is the source of truth for the command sequence.
- Use `pnpm lint:fix` or `pnpm format` explicitly when source formatting changes are intended.
- First-time setup requires `pnpm exec supabase login` and `pnpm exec supabase link --project-ref <project-ref>`.
- Migrations are applied with the Supabase CLI (`pnpm exec supabase db push --dry-run`, then `db push`); Dashboard SQL Editor application is no longer used. See the "Supabase / Migrations" section of CLAUDE.md for the rules (unique numbers, no `--include-all`, avoiding `CREATE INDEX CONCURRENTLY`, verifying real remote state before `migration repair`, and `supabase/migrations_archive/`).

## Safety Rules

- Never expose secrets from `.env`, logs, Supabase service-role keys, or deployment config.
- Never commit `.env`.
- Do manual QA (test accounts, posts, uploads) against the staging Supabase (`pnpm dev`, `pnpm staging:seed`), not production. Apply new migrations to staging first (`pnpm staging:db-push -- --apply`). See `docs/staging.md`.
- Do not print environment variables unless the user explicitly asks and the values are non-secret.
- Avoid destructive commands. Ask before large deletions, schema resets, history rewrites, or data migrations that could affect remote Supabase.
- Do not add dependencies unless they are necessary, well-scoped, and consistent with the existing stack.
- Do not manually edit `pnpm-lock.yaml` except through `pnpm`.
- Treat migrations as production-impacting. Include RLS policy updates and rollback considerations in any schema work.
- For uploads, avatars, anime covers, and post images, validate file type/size and storage bucket policies.
- For public social surfaces, assume posts and profile data may be seen beyond the current user unless policies explicitly restrict them.

## Future Product Direction

Future agents should make architecture decisions with these likely systems in mind:

- Watch rooms: synchronized playback sessions, event ownership, attendees, live state, and room-specific timelines.
- Synchronized playback: shared timestamps, drift handling, pause/resume authority, late join behavior, and replay logs.
- Episode discussion hubs: per-episode threads, spoiler boundaries, episode metadata, and durable post archives.
- Reaction timelines: timestamped reactions connected to anime episodes, watch events, and user profiles.
- Fandom communities: anime-specific community spaces, moderation roles, pinned posts, rules, and discovery surfaces.
- Recommendations: social recommendations based on trusted users, list overlap, watched episodes, and discussion quality rather than pure engagement.
- Event-based interaction: calendars, reminders, live badges, scheduled rewatches, premieres, finales, and community watch parties.

Design future systems around stable boundaries:

- Anime metadata is not enough; connect it to posts, users, lists, episodes, and events.
- Timelines need clear provenance: global, following, anime-specific, hashtag, event room, episode, or profile.
- Reactions should be easy to aggregate later by anime, episode, timestamp, event, and user.
- Privacy should be explicit for user lists, watch-room attendance, follows, and profile data.
- Moderation hooks should be considered early for any public community surface.

The north star: Anipolis should preserve the feeling of watching anime together, finding people who care about the same moments, and leaving behind a discussion trail that remains useful after the live moment passes.
