<script lang="ts">
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";

interface Props {
	pathname: string;
}

let { pathname }: Props = $props();

// 遷移先ページと同じ外枠（.page-container / .feed-column / .sidebar-column）に中身の形だけを置く。
// 独自の見出しや枠線を描くと、読み込み完了時に実際のページと見た目が食い違う
type SkeletonKind = "home" | "feed" | "detail" | "profile" | "anime" | "schedule" | "settings";

const feedRows = Array.from({ length: 8 });
const cardCells = Array.from({ length: 12 });
const scheduleColumns = Array.from({ length: 7 });
const settingsRows = Array.from({ length: 6 });

function resolveKind(path: string): SkeletonKind {
	if (path === "/") return "home";
	if (path === "/anime") return "anime";
	if (path.startsWith("/schedule") || path.startsWith("/calendar")) return "schedule";
	if (/^\/profile\/[^/]+\/?$/.test(path)) return "profile";
	if (path.startsWith("/settings") || path.startsWith("/admin")) return "settings";
	if (path.startsWith("/posts") || path.startsWith("/events") || path.startsWith("/rooms")) return "detail";
	return "feed";
}

const kind = $derived(resolveKind(pathname));
</script>

<div class="route-navigation-skeleton" aria-busy="true">
	<span class="sr-only" role="status">読み込み中</span>

	{#if kind === "anime"}
		<div class="route-navigation-anime">
			<div class="route-navigation-search">
				<div class="skeleton route-navigation-search-input"></div>
				<div class="skeleton route-navigation-search-toggle"></div>
			</div>
			<div class="route-navigation-anime-grid">
				{#each cardCells as _, index (index)}
					<div class="route-navigation-anime-card">
						<div class="skeleton route-navigation-anime-cover"></div>
						<div class="route-navigation-anime-info">
							<div class="skeleton" style="width: 90%; height: 13px"></div>
							<div class="skeleton" style="width: 60%; height: 13px"></div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if kind === "schedule"}
		<div class="route-navigation-schedule">
			<div class="route-navigation-schedule-header">
				<div class="skeleton" style="width: 160px; height: 22px"></div>
				<div class="skeleton" style="width: 180px; height: 34px"></div>
			</div>
			<div class="route-navigation-schedule-grid">
				{#each scheduleColumns as _, index (index)}
					<div class="route-navigation-schedule-day">
						<div class="skeleton" style="height: 32px"></div>
						<div class="skeleton" style="height: 64px"></div>
						<div class="skeleton" style="height: 64px"></div>
						<div class="skeleton" style="height: 40px"></div>
					</div>
				{/each}
			</div>
		</div>
	{:else if kind === "settings"}
		<div class="page-container" style="justify-content: center;">
			<div class="route-navigation-settings">
				<div class="skeleton" style="width: 96px; height: 22px; margin-bottom: 20px"></div>
				{#each settingsRows as _, index (index)}
					<div class="route-navigation-settings-row">
						<div class="skeleton" style="width: 28px; height: 28px"></div>
						<div class="skeleton" style="width: 45%; height: 13px"></div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="page-container">
			<div class="feed-column">
				{#if kind === "home"}
					<div class="skeleton route-navigation-composer"></div>
					<div class="skeleton route-navigation-tabs"></div>
				{:else if kind === "profile"}
					<div class="route-navigation-profile">
						<div class="skeleton route-navigation-profile-image"></div>
						<div class="route-navigation-profile-body">
							<div class="skeleton skeleton-circle" style="width: 72px; height: 72px"></div>
							<div class="skeleton" style="width: 160px; height: 18px"></div>
							<div class="skeleton" style="width: 100px; height: 12px"></div>
							<div class="skeleton" style="width: 80%; height: 12px"></div>
						</div>
					</div>
				{:else if kind === "feed"}
					<div class="skeleton route-navigation-title"></div>
				{/if}
				{#each feedRows as _, index (index)}
					<PostCardSkeleton />
				{/each}
			</div>
			<div class="sidebar-column">
				<div class="skeleton route-navigation-side-panel"></div>
			</div>
		</div>
	{/if}
</div>

<style>
/* 速い遷移では出さず、遅いときだけふわっと出す（表示の遅延は layout 側） */
.route-navigation-skeleton {
	animation: route-navigation-fade-in 0.2s ease-out both;
}

.route-navigation-title {
	width: 140px;
	height: 24px;
	margin-bottom: 16px;
}

.route-navigation-composer {
	height: 166px;
	margin-bottom: 12px;
	border-radius: var(--radius);
}

.route-navigation-tabs {
	height: 44px;
	margin-bottom: 8px;
	border-radius: var(--radius-sm);
}

.route-navigation-side-panel {
	height: 280px;
	border-radius: var(--radius);
}

.route-navigation-profile {
	margin-bottom: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	overflow: hidden;
}

.route-navigation-profile-image {
	aspect-ratio: 3 / 1;
	max-height: 240px;
	border-radius: 0;
}

.route-navigation-profile-body {
	display: grid;
	gap: 10px;
	padding: 16px 24px 24px;
}

.route-navigation-anime {
	width: 100%;
	max-width: 1360px;
	margin: 0 auto;
	padding: 24px 16px 0;
}

.route-navigation-search {
	display: flex;
	gap: 10px;
	margin-bottom: 16px;
}

.route-navigation-search-input {
	flex: 1;
	height: 40px;
	border-radius: var(--radius-sm);
}

.route-navigation-search-toggle {
	width: 132px;
	height: 40px;
	border-radius: var(--radius-sm);
}

.route-navigation-anime-grid {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 14px;
}

.route-navigation-anime-card {
	border: 1px solid var(--color-border);
	border-radius: 8px;
	overflow: hidden;
}

.route-navigation-anime-cover {
	aspect-ratio: 1 / 1.414;
	border-radius: 0;
}

.route-navigation-anime-info {
	display: grid;
	gap: 6px;
	padding: 8px;
}

.route-navigation-schedule {
	max-width: 1480px;
	margin: 0 auto;
	padding: 0 1rem 2rem;
}

.route-navigation-schedule-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1.25rem 0 1rem;
}

.route-navigation-schedule-grid {
	display: grid;
	grid-template-columns: repeat(7, minmax(110px, 1fr));
	gap: 8px;
	overflow-x: hidden;
}

.route-navigation-schedule-day {
	display: grid;
	gap: 8px;
	align-content: start;
}

.route-navigation-settings {
	flex: 0 1 860px;
	min-width: 0;
}

.route-navigation-settings-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 0;
}

@keyframes route-navigation-fade-in {
	from {
		opacity: 0;
	}
}

@media (max-width: 1180px) {
	.route-navigation-anime-grid {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
}

@media (max-width: 768px) {
	.route-navigation-anime-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
}

@media (max-width: 420px) {
	.route-navigation-anime-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (prefers-reduced-motion: reduce) {
	.route-navigation-skeleton {
		animation: none;
	}
}
</style>
