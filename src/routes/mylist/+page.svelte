<script lang="ts">
import { enhance } from "$app/forms";
import AnimeEditRow from "$lib/components/AnimeEditRow.svelte";
import AnimeStatusSection from "$lib/components/AnimeStatusSection.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { Anime, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const statusOrder: AnimeStatus[] = ["watching", "completed", "plan_to_watch", "on_hold", "dropped"];

const statusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断中",
	dropped: "断念",
};

const statusIcon: Record<AnimeStatus, string> = {
	watching: "▶",
	completed: "✓",
	plan_to_watch: "📋",
	on_hold: "⏸",
	dropped: "✕",
};

let isPublic = $state(false);
let viewMode = $state<"list" | "edit">("list");

$effect(() => {
	isPublic = data.profile.list_is_public;
});

$effect(() => {
	if (form && "list_is_public" in form) {
		isPublic = (form as { list_is_public: boolean }).list_is_public;
	}
});

const grouped = $derived(
	statusOrder.reduce<Record<AnimeStatus, Anime[]>>(
		(acc, status) => {
			acc[status] = data.animeList.filter((e) => e.user_entry?.status === status);
			return acc;
		},
		{ watching: [], completed: [], plan_to_watch: [], on_hold: [], dropped: [] },
	),
);

const totalCount = $derived(data.animeList.length);

let selectedStatus = $state<AnimeStatus>("watching");

// 各エントリのローカル状態（編集用）
type EntryState = { status: AnimeStatus; score: string; progress: number };
type EditRow = { entry: EntryState };
let editRows = $state<Record<string, EditRow>>({});

$effect(() => {
	editRows = Object.fromEntries(
		data.animeList.map((anime) => [
			anime.id,
			{
				entry: {
					status: anime.user_entry?.status ?? "plan_to_watch",
					score: anime.user_entry?.score?.toString() ?? "",
					progress: anime.user_entry?.progress ?? 0,
				},
			},
		]),
	);
});
</script>

<svelte:head> <title>マイリスト — Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column mylist-page">
		<div class="mylist-container">
			<header class="mylist-header">
				<div class="mylist-title-row">
					<h1 class="mylist-title">★ マイリスト</h1>
					<div class="header-actions">
						<!-- 表示切り替え -->
						<div class="view-toggle">
							<button
								type="button"
								class="view-btn"
								class:active={viewMode === 'list'}
								onclick={() => (viewMode = 'list')}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<line x1="8" y1="6" x2="21" y2="6" />
									<line x1="8" y1="12" x2="21" y2="12" />
									<line x1="8" y1="18" x2="21" y2="18" />
									<line x1="3" y1="6" x2="3.01" y2="6" />
									<line x1="3" y1="12" x2="3.01" y2="12" />
									<line x1="3" y1="18" x2="3.01" y2="18" />
								</svg>
								一覧
							</button>
							<button
								type="button"
								class="view-btn"
								class:active={viewMode === 'edit'}
								onclick={() => (viewMode = 'edit')}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
								編集
							</button>
						</div>

						<!-- 公開/非公開切り替え -->
						<form
							method="POST"
							action="?/toggleVisibility"
							use:enhance={() => {
                            return ({ result }) => {
                                if (result.type === 'success' && result.data) {
                                    isPublic = (result.data as { list_is_public: boolean }).list_is_public;
                                }
                            };
                        }}
						>
							<button
								type="submit"
								class="visibility-btn"
								class:public={isPublic}
								class:private={!isPublic}
							>
								{#if isPublic}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
									公開中
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
										/>
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
									非公開
								{/if}
							</button>
						</form>
					</div>
				</div>
			</header>

			<!-- モバイル用ステータスタブバー -->
			<div class="status-tab-bar">
				{#each statusOrder as status}
					<button
						type="button"
						class="status-tab status-tab--{status}"
						class:active={selectedStatus === status}
						onclick={() => (selectedStatus = status)}
					>
						<span class="tab-icon">{statusIcon[status]}</span>
						{statusLabel[status]}
						<span class="tab-count">{grouped[status].length}</span>
					</button>
				{/each}
			</div>

			{#if totalCount === 0}
				<div class="mylist-empty">
					<p>まだアニメがありません。<a href="/anime">アニメを探す</a></p>
				</div>
			{:else}
				{#if grouped[selectedStatus].length === 0}
					<div class="mobile-status-empty">
						<p>{statusLabel[selectedStatus]}にはまだ登録がありません</p>
					</div>
				{/if}
				{#each statusOrder as status}
					{#if grouped[status].length > 0}
						<div class:mobile-hidden={selectedStatus !== status}>
							{#if viewMode === 'list'}
								<AnimeStatusSection {status} animes={grouped[status]} {statusLabel} {statusIcon} />
							{:else}
								<section class="status-section status-section--{status}">
									<h2 class="status-heading">
										<span class="status-icon">{statusIcon[status]}</span>
										{statusLabel[status]}
										<span class="status-count">{grouped[status].length}</span>
									</h2>
									<div class="anime-list anime-list--edit">
										{#each grouped[status] as anime (anime.id)}
											{@const editRow = editRows[anime.id]}
											{#if editRow}
												<AnimeEditRow
													{anime}
													bind:entry={editRow.entry}
													{statusOrder}
													{statusLabel}
												/>
											{/if}
										{/each}
									</div>
								</section>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.mylist-page {
	padding: 0;
}

.mylist-container {
	width: 100%;
}

.mylist-header {
	margin-bottom: 28px;
}

.mylist-title-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-bottom: 14px;
}

.mylist-title {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--accent, #6366f1);
	margin: 0;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 10px;
}

/* 表示切り替え */
.view-toggle {
	display: flex;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
	border-radius: 8px;
	padding: 3px;
	gap: 2px;
}

.view-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 5px 12px;
	border-radius: 6px;
	font-size: 0.8rem;
	font-weight: 500;
	cursor: pointer;
	border: none;
	background: transparent;
	color: var(--fg-muted, #94a3b8);
	transition:
		background 0.12s,
		color 0.12s;
}

.view-btn.active {
	background: var(--surface, #1e293b);
	color: var(--fg, #e2e8f0);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.view-btn:hover:not(.active) {
	color: var(--fg, #e2e8f0);
}

.visibility-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 14px;
	border-radius: 20px;
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
	border: none;
	transition:
		background 0.15s,
		color 0.15s;
}

.visibility-btn.public {
	background: color-mix(in srgb, var(--accent, #6366f1) 15%, transparent);
	color: var(--accent, #6366f1);
}

.visibility-btn.private {
	background: color-mix(in srgb, var(--fg, #e2e8f0) 10%, transparent);
	color: var(--fg-muted, #94a3b8);
}

.visibility-btn:hover {
	filter: brightness(1.1);
}

.mylist-empty {
	text-align: center;
	padding: 60px 0;
	color: var(--fg-muted, #94a3b8);
}

.mobile-status-empty {
	display: none;
}

.mylist-empty a {
	color: var(--accent, #6366f1);
}

.status-section {
	margin-bottom: 32px;
}

.status-heading {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.95rem;
	font-weight: 700;
	padding: 8px 0;
	margin: 0 0 8px;
	border-bottom: 1px solid var(--border, #334155);
	color: var(--fg, #e2e8f0);
}

.status-section--watching .status-icon {
	color: var(--status-watching);
}
.status-section--completed .status-icon {
	color: var(--accent, #6366f1);
}
.status-section--plan_to_watch .status-icon {
	color: var(--status-plan);
}
.status-section--on_hold .status-icon {
	color: var(--status-on-hold);
}
.status-section--dropped .status-icon {
	color: var(--status-dropped);
}

.status-count {
	margin-left: auto;
	font-size: 0.8rem;
	color: var(--fg-muted, #94a3b8);
	font-weight: 400;
}

.anime-list--edit {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

/* ---- モバイル用ステータスタブバー ---- */
.status-tab-bar {
	display: none;
	overflow-x: auto;
	gap: 8px;
	padding: 0 0 16px;
	scrollbar-width: none;
	margin-bottom: 4px;
}

.status-tab-bar::-webkit-scrollbar {
	display: none;
}

.status-tab {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 8px 14px;
	border-radius: 20px;
	border: none;
	cursor: pointer;
	font-size: 0.82rem;
	font-weight: 600;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
	color: var(--fg-muted, #94a3b8);
	transition:
		background 0.15s,
		color 0.15s;
	white-space: nowrap;
	flex-shrink: 0;
}

.status-tab.active {
	background: color-mix(in srgb, var(--accent, #6366f1) 20%, transparent);
	color: var(--accent, #6366f1);
}

.status-tab--watching.active {
	background: color-mix(in srgb, var(--status-watching) 20%, transparent);
	color: var(--status-watching);
}

.status-tab--on_hold.active {
	background: color-mix(in srgb, var(--status-on-hold) 20%, transparent);
	color: var(--status-on-hold);
}

.status-tab--dropped.active {
	background: color-mix(in srgb, var(--status-dropped) 20%, transparent);
	color: var(--status-dropped);
}

.status-tab--plan_to_watch.active {
	background: color-mix(in srgb, var(--status-plan) 20%, transparent);
	color: var(--status-plan);
}

.tab-icon {
	font-size: 0.75rem;
}

.tab-count {
	font-size: 0.72rem;
	opacity: 0.8;
}

@media (max-width: 600px) {
	.status-tab-bar {
		display: flex;
	}

	.mobile-hidden {
		display: none;
	}

	.mobile-status-empty {
		display: block;
		text-align: center;
		padding: 40px 16px;
		color: var(--fg-muted, #94a3b8);
		font-size: 0.9rem;
	}
}
</style>
