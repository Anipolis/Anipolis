<script lang="ts">
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import type { Anime, AnimeStatus } from "$lib/types";

type EntryState = { status: AnimeStatus; score: string; progress: number };

let {
	anime,
	entry = $bindable<EntryState>(),
	statusOrder,
	statusLabel,
}: {
	anime: Anime;
	entry: EntryState;
	statusOrder: AnimeStatus[];
	statusLabel: Record<AnimeStatus, string>;
} = $props();

const episodeMax = $derived(anime.episode_count ? Number(anime.episode_count) : 9999);

const origStatus = $derived(anime.user_entry?.status ?? "plan_to_watch");
const origScore = $derived(
	anime.user_entry?.score != null && anime.user_entry.score > 0 ? anime.user_entry.score.toString() : "",
);
const origProgress = $derived(anime.user_entry?.progress ?? 0);

const hasChanges = $derived(
	entry.status !== origStatus || entry.score !== origScore || entry.progress !== origProgress,
);
</script>

<div class="anime-row-edit">
	<a href="/anime/{anime.id}" class="edit-cover" tabindex="-1">
		{#if anime.cover_url}
			<img src={anime.cover_url} alt={anime.title}>
		{:else}
			<div class="anime-cover-placeholder">?</div>
		{/if}
	</a>

	<div class="edit-main">
		<div class="edit-title-bar">
			<div class="edit-title">{anime.title}</div>
			<form
				method="POST"
				action="?/removeWatchlist"
				class="remove-form"
				use:enhance={() => {
					return async () => {
						await invalidateAll();
					};
				}}
			>
				<input type="hidden" name="anime_id" value={anime.id}>
				<button type="submit" class="remove-btn" aria-label="リストから削除" title="リストから削除">
					<svg
						aria-hidden="true"
						focusable="false"
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="3 6 5 6 21 6" />
						<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
						<path d="M10 11v6" />
						<path d="M14 11v6" />
						<path d="M9 6V4h6v2" />
					</svg>
				</button>
			</form>
		</div>

		<form
			method="POST"
			action="?/upsertWatchlist"
			class="edit-controls-row"
			use:enhance={() => {
				return async () => {
					await invalidateAll();
				};
			}}
		>
			<input type="hidden" name="anime_id" value={anime.id}>
			<input type="hidden" name="progress" value={entry.progress}>

			<select name="status" class="edit-select" bind:value={entry.status} aria-label="ステータス">
				{#each statusOrder as s}
					<option value={s}>{statusLabel[s]}</option>
				{/each}
			</select>

			<div class="progress-group">
				<button
					type="button"
					class="stepper-btn"
					onclick={() => { if (entry.progress > 0) entry.progress -= 1; }}
					aria-label="1話戻す"
				>
					—
				</button>
				<span class="progress-display">{entry.progress}/{anime.episode_count ?? '—'}</span>
				<button
					type="button"
					class="stepper-btn"
					onclick={() => { if (entry.progress < episodeMax) entry.progress += 1; }}
					aria-label="1話進める"
				>
					+
				</button>
			</div>

			<select name="score" class="edit-select score-select" bind:value={entry.score} aria-label="スコア">
				<option value="">-</option>
				{#each [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as n}
					<option value={n.toString()}>★{n}</option>
				{/each}
			</select>

			<button type="submit" class="save-btn" class:has-changes={hasChanges} disabled={!hasChanges} title="保存">
				<svg
					aria-hidden="true"
					focusable="false"
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
					<polyline points="17 21 17 13 7 13 7 21" />
					<polyline points="7 3 7 8 15 8" />
				</svg>
			</button>
		</form>
	</div>
</div>

<style>
.anime-row-edit {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 8px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 4%, transparent);
	border: 1px solid var(--border, #334155);
	margin-bottom: 4px;
}

.edit-cover {
	text-decoration: none;
	flex-shrink: 0;
	width: 36px;
	height: 52px;
	overflow: hidden;
	border-radius: 4px;
	display: block;
}

.edit-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--surface, #1e293b);
	color: var(--fg-muted, #94a3b8);
	font-size: 1.1rem;
}

.edit-main {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1;
	min-width: 0;
}

.edit-title-bar {
	display: flex;
	align-items: center;
	gap: 6px;
	flex: 1;
	min-width: 0;
}

.edit-title {
	font-size: 0.85rem;
	font-weight: 500;
	color: var(--fg, #e2e8f0);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	flex: 1;
	min-width: 0;
}

.remove-form {
	flex-shrink: 0;
}

.edit-controls-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.edit-select {
	background: var(--surface, #1e293b);
	border: 1px solid var(--border, #334155);
	color: var(--fg, #e2e8f0);
	border-radius: 6px;
	padding: 4px 7px;
	font-size: 0.8rem;
	cursor: pointer;
}

.edit-select:focus {
	outline: none;
	border-color: var(--accent, #6366f1);
}

.score-select {
	min-width: 70px;
}

.progress-group {
	display: flex;
	align-items: center;
	gap: 3px;
}

.stepper-btn {
	width: 24px;
	height: 26px;
	border: 1px solid var(--border, #334155);
	background: var(--surface, #1e293b);
	color: var(--fg, #e2e8f0);
	border-radius: 5px;
	font-size: 0.85rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 0.1s;
	flex-shrink: 0;
}

.stepper-btn:hover {
	background: color-mix(in srgb, var(--accent, #6366f1) 20%, transparent);
	border-color: var(--accent, #6366f1);
	color: var(--accent, #6366f1);
}

.progress-display {
	font-size: 0.8rem;
	color: var(--fg, #e2e8f0);
	min-width: 40px;
	text-align: center;
	white-space: nowrap;
}

.save-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 5px 8px;
	border: 1px solid var(--border, #334155);
	background: var(--surface, #1e293b);
	color: var(--fg-muted, #94a3b8);
	border-radius: 6px;
	cursor: pointer;
	transition:
		background 0.15s,
		color 0.15s,
		border-color 0.15s;
	flex-shrink: 0;
}

.save-btn:disabled {
	opacity: 0.4;
	cursor: default;
}

.save-btn.has-changes {
	background: color-mix(in srgb, var(--accent, #6366f1) 18%, transparent);
	border-color: var(--accent, #6366f1);
	color: var(--accent, #6366f1);
}

.save-btn.has-changes:hover {
	background: color-mix(in srgb, var(--accent, #6366f1) 30%, transparent);
}

.remove-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: none;
	border-radius: 6px;
	cursor: pointer;
	background: transparent;
	color: var(--fg-muted, #94a3b8);
	flex-shrink: 0;
	transition:
		background 0.12s,
		color 0.12s;
}

.remove-btn:hover {
	background: color-mix(in srgb, #f87171 20%, transparent);
	color: var(--color-danger);
}

/* モバイル: 2段レイアウト */
@media (max-width: 600px) {
	.anime-row-edit {
		align-items: flex-start;
		padding: 8px;
	}

	.edit-cover {
		width: 60px;
		height: 85px;
	}

	.edit-main {
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
	}

	.edit-title-bar {
		justify-content: space-between;
		align-items: flex-start;
	}

	.edit-title {
		white-space: normal;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.35;
		font-size: 0.82rem;
	}

	.edit-controls-row {
		gap: 5px;
		flex-wrap: nowrap;
	}

	.edit-select {
		font-size: 0.75rem;
		padding: 4px 4px;
		min-width: 0;
		flex-shrink: 1;
	}

	.score-select {
		min-width: 0;
	}

	.stepper-btn {
		width: 26px;
		height: 28px;
	}

	.progress-display {
		font-size: 0.75rem;
		min-width: 34px;
	}
}
</style>
