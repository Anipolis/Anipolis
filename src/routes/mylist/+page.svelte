<script lang="ts">
import { enhance } from "$app/forms";
import AnimeEditRow from "$lib/components/AnimeEditRow.svelte";
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

const statCounts = $derived(statusOrder.map((s) => ({ status: s, count: grouped[s].length })));

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

<div class="mylist-page">
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
						<button type="submit" class="visibility-btn" class:public={isPublic} class:private={!isPublic}>
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

			<div class="mylist-stats">
				<span class="stat-total">合計 <strong>{totalCount}</strong> 作品</span>
				{#each statCounts as { status, count }}
					{#if count > 0}
						<span class="stat-chip stat-chip--{status}"> {statusLabel[status]} {count} </span>
					{/if}
				{/each}
			</div>
		</header>

		{#if totalCount === 0}
			<div class="mylist-empty">
				<p>まだアニメがありません。<a href="/anime">アニメを探す</a></p>
			</div>
		{:else}
			{#each statusOrder as status}
				{#if grouped[status].length > 0}
					<section class="status-section status-section--{status}">
						<h2 class="status-heading">
							<span class="status-icon">{statusIcon[status]}</span>
							{statusLabel[status]}
							<span class="status-count">{grouped[status].length}</span>
						</h2>
						<div class="anime-list" class:anime-list--edit={viewMode === 'edit'}>
							{#each grouped[status] as anime (anime.id)}
								{@const editRow = editRows[anime.id]}
								{#if viewMode === 'list'}
									<!-- 一覧表示 -->
									<a href="/anime/{anime.id}" class="anime-card">
										<div class="card-cover">
											{#if anime.cover_url}
												<img src={anime.cover_url} alt={anime.title}>
											{:else}
												<div class="anime-cover-placeholder">?</div>
											{/if}
											{#if anime.user_entry?.score !== null && anime.user_entry?.score !== undefined}
												<div class="card-score">★ {anime.user_entry.score}</div>
											{/if}
										</div>
										<div class="card-info">
											<div class="card-title">{anime.title}</div>
											{#if anime.episode_count}
												<div class="card-progress">
													{anime.user_entry?.progress ?? 0}/{anime.episode_count}話
												</div>
											{:else if (anime.user_entry?.progress ?? 0) > 0}
												<div class="card-progress">{anime.user_entry?.progress}話</div>
											{/if}
										</div>
									</a>
								{:else if editRow}
									<AnimeEditRow {anime} bind:entry={editRow.entry} {statusOrder} {statusLabel} />
								{/if}
							{/each}
						</div>
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</div>

<style>
.mylist-page {
	padding: calc(var(--nav-height) + 24px) 16px 24px;
	min-height: 100vh;
}

.mylist-container {
	max-width: 860px;
	margin: 0 auto;
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

.mylist-stats {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.85rem;
	color: var(--fg-muted, #94a3b8);
}

.stat-total {
	margin-right: 4px;
}

.stat-total strong {
	color: var(--fg, #e2e8f0);
}

.stat-chip {
	padding: 2px 10px;
	border-radius: 12px;
	font-size: 0.78rem;
	font-weight: 600;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
	color: var(--fg-muted, #94a3b8);
}

.stat-chip--watching {
	color: var(--status-watching);
	background: color-mix(in srgb, var(--status-watching) 15%, transparent);
}
.stat-chip--completed {
	color: var(--accent, #6366f1);
	background: color-mix(in srgb, var(--accent, #6366f1) 15%, transparent);
}
.stat-chip--plan_to_watch {
	color: var(--status-plan);
	background: color-mix(in srgb, var(--status-plan) 15%, transparent);
}
.stat-chip--on_hold {
	color: var(--status-on-hold);
	background: color-mix(in srgb, var(--status-on-hold) 15%, transparent);
}
.stat-chip--dropped {
	color: var(--status-dropped);
	background: color-mix(in srgb, var(--status-dropped) 15%, transparent);
}

.mylist-empty {
	text-align: center;
	padding: 60px 0;
	color: var(--fg-muted, #94a3b8);
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

.anime-list {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: 12px;
}

.anime-list--edit {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

/* ---- 一覧表示（グリッドカード） ---- */
.anime-card {
	display: flex;
	flex-direction: column;
	border-radius: 8px;
	overflow: hidden;
	text-decoration: none;
	color: inherit;
	background: var(--surface, #1e293b);
	transition:
		transform 0.12s,
		box-shadow 0.12s;
}

.anime-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.card-cover {
	position: relative;
	aspect-ratio: 1 / 1.414;
	background: var(--bg, #0f172a);
	overflow: hidden;
}

.card-cover img {
	width: 100%;
	display: block;
}

.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--fg-muted, #94a3b8);
	font-size: 1.5rem;
}

.card-score {
	position: absolute;
	bottom: 5px;
	right: 5px;
	background: rgba(0, 0, 0, 0.72);
	color: var(--status-score);
	font-size: 0.72rem;
	font-weight: 700;
	padding: 2px 6px;
	border-radius: 4px;
}

.card-info {
	padding: 7px 8px 8px;
}

.card-title {
	font-size: 0.78rem;
	font-weight: 500;
	color: var(--fg, #e2e8f0);
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	line-height: 1.35;
	margin-bottom: 3px;
}

.card-progress {
	font-size: 0.7rem;
	color: var(--fg-muted, #94a3b8);
}
</style>
