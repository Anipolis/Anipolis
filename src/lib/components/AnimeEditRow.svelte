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
</script>

<div class="anime-row-edit">
	<a href="/anime/{anime.id}" class="anime-cover edit-cover" tabindex="-1">
		{#if anime.cover_url}
			<img src={anime.cover_url} alt={anime.title} loading="lazy" decoding="async">
		{:else}
			<div class="anime-cover-placeholder">?</div>
		{/if}
	</a>

	<form
		method="POST"
		action="?/upsertWatchlist"
		class="edit-form"
		use:enhance={() => {
			return async () => {
				await invalidateAll();
			};
		}}
	>
		<input type="hidden" name="anime_id" value={anime.id}>
		<div class="edit-title">{anime.title}</div>
		<div class="edit-controls">
			<select name="status" class="edit-select" bind:value={entry.status} aria-label="ステータス">
				{#each statusOrder as s}
					<option value={s}>{statusLabel[s]}</option>
				{/each}
			</select>

			<div class="progress-group">
				<button
					type="button"
					class="stepper-btn"
					onclick={() => {
						if (entry.progress > 0) entry.progress -= 1;
					}}
					aria-label="1話減らす"
				>
					-
				</button>
				<input
					type="number"
					name="progress"
					class="edit-number"
					min="0"
					max={episodeMax}
					bind:value={entry.progress}
					aria-label="進捗"
				>
				<button
					type="button"
					class="stepper-btn"
					onclick={() => {
						if (entry.progress < episodeMax) entry.progress += 1;
					}}
					aria-label="1話増やす"
				>
					+
				</button>
				{#if anime.episode_count}
					<span class="progress-max">/{anime.episode_count}</span>
				{/if}
			</div>

			<select name="score" class="edit-select score-select" bind:value={entry.score} aria-label="スコア">
				<option value="">-</option>
				{#each [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as n}
					<option value={n.toString()}>★ {n}</option>
				{/each}
			</select>

			<button type="submit" class="save-btn">保存</button>
		</div>
	</form>

	<form
		method="POST"
		action="?/removeWatchlist"
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

<style>
.anime-row-edit {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 8px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-text) 4%, transparent);
	border: 1px solid var(--color-border);
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
	background: var(--color-surface);
	color: var(--color-text-muted);
	font-size: 1.1rem;
}
.edit-form {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1;
	min-width: 0;
}
.edit-title {
	font-size: 0.85rem;
	font-weight: 500;
	color: var(--color-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	flex: 1;
	min-width: 0;
	max-width: 200px;
}
.edit-controls {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
	flex-wrap: wrap;
}
.edit-select {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	color: var(--color-text);
	border-radius: 6px;
	padding: 4px 7px;
	font-size: 0.8rem;
	cursor: pointer;
}
.edit-select:focus {
	outline: none;
	border-color: var(--color-accent);
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
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	color: var(--color-text);
	border-radius: 5px;
	font-size: 0.85rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 0.1s;
}
.stepper-btn:hover {
	background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	border-color: var(--color-accent);
	color: var(--color-accent);
}
.edit-number {
	width: 46px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	color: var(--color-text);
	border-radius: 6px;
	padding: 4px 5px;
	font-size: 0.8rem;
	text-align: center;
}
.edit-number:focus {
	outline: none;
	border-color: var(--color-accent);
}
.progress-max {
	font-size: 0.75rem;
	color: var(--color-text-muted);
	white-space: nowrap;
}
.save-btn {
	padding: 4px 14px;
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 6px;
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.12s;
	white-space: nowrap;
}
.save-btn:hover {
	opacity: 0.85;
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
	color: var(--color-text-muted);
	flex-shrink: 0;
	transition:
		background 0.12s,
		color 0.12s;
}
.remove-btn:hover {
	background: color-mix(in srgb, var(--color-danger) 20%, transparent);
	color: var(--color-danger);
}
</style>
