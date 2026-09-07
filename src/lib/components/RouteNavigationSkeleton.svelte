<script lang="ts">
interface Props {
	pathname: string;
}

let { pathname }: Props = $props();

type SkeletonKind = "timeline" | "anime" | "schedule" | "profile" | "settings" | "detail" | "list";

const feedRows = Array.from({ length: 5 });
const cardCells = Array.from({ length: 10 });
const scheduleColumns = Array.from({ length: 7 });
const settingsRows = Array.from({ length: 5 });

function resolveKind(path: string): SkeletonKind {
	if (path === "/" || path.startsWith("/hashtag")) return "timeline";
	if (path === "/anime") return "anime";
	if (path.startsWith("/schedule") || path.startsWith("/calendar")) return "schedule";
	if (path.startsWith("/profile")) return "profile";
	if (path.startsWith("/settings") || path.startsWith("/admin")) return "settings";
	if (path.startsWith("/posts") || path.startsWith("/events") || path.startsWith("/rooms")) return "detail";
	return "list";
}

function resolveTitle(path: string, kind: SkeletonKind): string {
	if (kind === "timeline") return path.startsWith("/hashtag") ? "ハッシュタグ" : "ホーム";
	if (kind === "anime") return "アニメ";
	if (kind === "schedule") return "放送スケジュール";
	if (kind === "profile") return "プロフィール";
	if (kind === "settings") return path.startsWith("/admin") ? "管理" : "設定";
	if (path.startsWith("/auth")) return "ログイン";
	if (path.startsWith("/onboarding")) return "プロフィール設定";
	if (path.startsWith("/search")) return "検索";
	if (path.startsWith("/notifications")) return "通知";
	if (path.startsWith("/mylist")) return "マイリスト";
	if (path.startsWith("/bookmarks")) return "ブックマーク";
	if (path.startsWith("/exchange")) return "アニメトレード";
	if (path.startsWith("/follow-requests")) return "フォローリクエスト";
	if (path.startsWith("/privacy-policy")) return "プライバシーポリシー";
	if (path.startsWith("/data-sources")) return "データ出典";
	if (kind === "detail") return path.startsWith("/rooms") ? "実況ルーム" : "詳細";
	return "読み込み中";
}

const kind = $derived(resolveKind(pathname));
const title = $derived(resolveTitle(pathname, kind));
</script>

<section class="route-navigation-skeleton" aria-busy="true" aria-label={`${title}を読み込み中`}>
	<header class="route-navigation-heading">
		<div>
			<p class="route-navigation-eyebrow">Anipolis</p>
			<h1>{title}</h1>
		</div>
		<div class="route-navigation-status" role="status">
			<span class="route-navigation-spinner" aria-hidden="true"></span>
			読み込み中…
		</div>
	</header>

	{#if kind === "timeline" || kind === "list"}
		<div class="route-navigation-feed">
			{#each feedRows as _, index (index)}
				<div class="route-navigation-feed-row">
					<div class="route-navigation-avatar"></div>
					<div class="route-navigation-feed-content">
						<div class="route-navigation-line route-navigation-line--short"></div>
						<div class="route-navigation-line"></div>
						<div class="route-navigation-line route-navigation-line--medium"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if kind === "anime"}
		<div class="route-navigation-tabs">
			<span></span><span></span><span></span><span></span><span></span>
		</div>
		<div class="route-navigation-card-grid">
			{#each cardCells as _, index (index)}
				<div class="route-navigation-card">
					<div class="route-navigation-cover"></div>
					<div class="route-navigation-line route-navigation-line--medium"></div>
					<div class="route-navigation-line route-navigation-line--short"></div>
				</div>
			{/each}
		</div>
	{:else if kind === "schedule"}
		<div class="route-navigation-schedule-tabs">
			{#each scheduleColumns as _, index (index)}
				<span></span>
			{/each}
		</div>
		<div class="route-navigation-schedule-grid">
			{#each scheduleColumns as _, index (index)}
				<div class="route-navigation-day">
					<div class="route-navigation-day-heading"></div>
					<div class="route-navigation-slot"></div>
					<div class="route-navigation-slot"></div>
					<div class="route-navigation-slot route-navigation-slot--short"></div>
				</div>
			{/each}
		</div>
	{:else if kind === "profile" || kind === "detail"}
		<div class="route-navigation-hero">
			<div class="route-navigation-avatar route-navigation-avatar--large"></div>
			<div>
				<div class="route-navigation-line route-navigation-line--medium"></div>
				<div class="route-navigation-line route-navigation-line--short"></div>
			</div>
		</div>
		<div class="route-navigation-feed">
			{#each feedRows.slice(0, 3) as _, index (index)}
				<div class="route-navigation-feed-row">
					<div class="route-navigation-avatar"></div>
					<div class="route-navigation-feed-content">
						<div class="route-navigation-line"></div>
						<div class="route-navigation-line route-navigation-line--medium"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="route-navigation-settings-list">
			{#each settingsRows as _, index (index)}
				<div class="route-navigation-settings-row">
					<div class="route-navigation-icon"></div>
					<div class="route-navigation-line route-navigation-line--medium"></div>
					<div class="route-navigation-chevron"></div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
.route-navigation-skeleton {
	min-height: 100%;
	padding: 24px;
	background: var(--color-bg);
}

.route-navigation-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	max-width: 1180px;
	margin: 0 auto 20px;
	padding-bottom: 16px;
	border-bottom: 1px solid var(--color-border);
}

.route-navigation-eyebrow {
	margin: 0 0 4px;
	color: var(--color-text-muted);
	font-size: 0.75rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.route-navigation-heading h1 {
	margin: 0;
	color: var(--color-text);
	font-size: 1.35rem;
}

.route-navigation-status {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: var(--color-text-muted);
	font-size: 0.85rem;
}

.route-navigation-spinner {
	width: 16px;
	height: 16px;
	border: 2px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
	border-top-color: var(--color-accent);
	border-radius: 50%;
	animation: route-navigation-spin 0.7s linear infinite;
}

.route-navigation-feed,
.route-navigation-card-grid,
.route-navigation-schedule-grid,
.route-navigation-settings-list,
.route-navigation-hero,
.route-navigation-tabs,
.route-navigation-schedule-tabs {
	max-width: 1180px;
	margin: 0 auto;
}

.route-navigation-feed {
	max-width: 680px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
	overflow: hidden;
}

.route-navigation-feed-row,
.route-navigation-settings-row {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 16px;
	border-bottom: 1px solid var(--color-border);
}

.route-navigation-feed-row:last-child,
.route-navigation-settings-row:last-child {
	border-bottom: 0;
}

.route-navigation-avatar,
.route-navigation-cover,
.route-navigation-line,
.route-navigation-tabs span,
.route-navigation-schedule-tabs span,
.route-navigation-day-heading,
.route-navigation-slot,
.route-navigation-icon,
.route-navigation-chevron {
	background:
		linear-gradient(100deg, var(--color-surface) 34%, var(--color-surface-hover) 48%, var(--color-surface) 62%) 0 0
		/ 220% 100%;
	animation: route-navigation-shimmer 1.2s ease-in-out infinite;
}

.route-navigation-avatar {
	flex: 0 0 auto;
	width: 42px;
	height: 42px;
	border-radius: 50%;
}

.route-navigation-avatar--large {
	width: 76px;
	height: 76px;
}

.route-navigation-feed-content {
	flex: 1;
	display: grid;
	gap: 9px;
	padding-top: 3px;
}

.route-navigation-line {
	width: 100%;
	height: 12px;
	border-radius: 999px;
}

.route-navigation-line--short {
	width: 35%;
}

.route-navigation-line--medium {
	width: 65%;
}

.route-navigation-tabs,
.route-navigation-schedule-tabs {
	display: flex;
	gap: 8px;
	margin-bottom: 16px;
}

.route-navigation-tabs span {
	width: 72px;
	height: 32px;
	border-radius: 999px;
}

.route-navigation-card-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 14px;
}

.route-navigation-card {
	display: grid;
	gap: 9px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
}

.route-navigation-cover {
	aspect-ratio: 2 / 3;
	border-radius: var(--radius-sm);
}

.route-navigation-schedule-tabs span {
	flex: 1;
	height: 42px;
	border-radius: var(--radius-sm);
}

.route-navigation-schedule-grid {
	display: grid;
	grid-template-columns: repeat(7, minmax(110px, 1fr));
	gap: 8px;
	overflow-x: auto;
}

.route-navigation-day {
	min-height: 310px;
	padding: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
}

.route-navigation-day-heading {
	height: 36px;
	margin-bottom: 12px;
	border-radius: 6px;
}

.route-navigation-slot {
	height: 68px;
	margin-bottom: 8px;
	border-radius: 6px;
}

.route-navigation-slot--short {
	height: 42px;
}

.route-navigation-hero {
	display: flex;
	align-items: center;
	gap: 16px;
	max-width: 680px;
	margin-bottom: 16px;
	padding: 20px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
}

.route-navigation-hero > div:last-child {
	flex: 1;
	display: grid;
	gap: 10px;
}

.route-navigation-settings-list {
	max-width: 680px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
	overflow: hidden;
}

.route-navigation-settings-row {
	align-items: center;
}

.route-navigation-icon {
	width: 30px;
	height: 30px;
	border-radius: 8px;
}

.route-navigation-settings-row .route-navigation-line {
	flex: 1;
}

.route-navigation-chevron {
	width: 10px;
	height: 16px;
	border-radius: 999px;
}

@keyframes route-navigation-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes route-navigation-shimmer {
	to {
		background-position: -120% 0;
	}
}

@media (max-width: 960px) {
	.route-navigation-skeleton {
		padding: 16px;
	}

	.route-navigation-heading {
		margin-bottom: 14px;
	}

	.route-navigation-card-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.route-navigation-schedule-grid {
		grid-template-columns: repeat(7, minmax(92px, 1fr));
	}
}

@media (prefers-reduced-motion: reduce) {
	.route-navigation-spinner,
	.route-navigation-avatar,
	.route-navigation-cover,
	.route-navigation-line,
	.route-navigation-tabs span,
	.route-navigation-schedule-tabs span,
	.route-navigation-day-heading,
	.route-navigation-slot,
	.route-navigation-icon,
	.route-navigation-chevron {
		animation: none;
	}
}
</style>
