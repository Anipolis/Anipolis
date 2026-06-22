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
	onAutoSave,
	onRemove,
}: {
	anime: Anime;
	entry: EntryState;
	statusOrder: AnimeStatus[];
	statusLabel: Record<AnimeStatus, string>;
	onAutoSave: (updatedFields: Partial<EntryState>) => void;
	onRemove: () => void;
} = $props();

const episodeMax = $derived(anime.episode_count ? Number(anime.episode_count) : 9999);
let removeForm: HTMLFormElement;
let deleteConfirmOpen = $state(false);

function updateProgress(delta: number) {
	const progress = Math.min(episodeMax, Math.max(0, entry.progress + delta));
	if (progress !== entry.progress) onAutoSave({ progress });
}

function confirmRemove() {
	onRemove();
	deleteConfirmOpen = false;
	removeForm.requestSubmit();
}
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
		<div class="edit-title">{anime.title}</div>

		<div class="edit-controls">
			<select
				class="edit-select status-select"
				value={entry.status}
				onchange={(event) => onAutoSave({ status: event.currentTarget.value as AnimeStatus })}
				aria-label="ステータス"
			>
				{#each statusOrder as status}
					<option value={status}>{statusLabel[status]}</option>
				{/each}
			</select>

			<div class="control-secondary-row">
				<div class="progress-group">
					<button type="button" class="stepper-btn" onclick={() => updateProgress(-1)} aria-label="1話戻す">
						−
					</button>
					<span class="progress-display">{entry.progress}/{anime.episode_count ?? '−'}</span>
					<button type="button" class="stepper-btn" onclick={() => updateProgress(1)} aria-label="1話進める">
						+
					</button>
				</div>

				<select
					class="edit-select score-select"
					value={entry.score}
					onchange={(event) => onAutoSave({ score: event.currentTarget.value })}
					aria-label="スコア"
				>
					<option value="">−</option>
					{#each [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as score}
						<option value={score.toString()}>★{score}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<form
		bind:this={removeForm}
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
		<button
			type="button"
			class="remove-btn"
			onclick={() => (deleteConfirmOpen = true)}
			aria-label="リストから削除"
			title="リストから削除"
		>
			<svg
				aria-hidden="true"
				width="16"
				height="16"
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

{#if deleteConfirmOpen}
	<div class="confirm-layer">
		<button
			type="button"
			class="confirm-backdrop"
			onclick={() => (deleteConfirmOpen = false)}
			aria-label="削除確認を閉じる"
		></button>
		<div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
			<div class="confirm-icon" aria-hidden="true">
				<span class="i-lucide-trash-2"></span>
			</div>
			<h2 id="delete-confirm-title">マイリストから削除しますか？</h2>
			<p>「{anime.title}」をマイリストから削除します。この操作は取り消せません。</p>
			<div class="confirm-actions">
				<button type="button" class="confirm-cancel" onclick={() => (deleteConfirmOpen = false)}>
					キャンセル
				</button>
				<button type="button" class="confirm-delete" onclick={confirmRemove}>削除する</button>
			</div>
		</div>
	</div>
{/if}

<style>
.anime-row-edit {
	position: relative;
	display: flex;
	align-items: stretch;
	gap: 16px;
	min-height: 120px;
	padding: 12px 52px 12px 12px;
	border: 1px solid var(--border, #334155);
	border-radius: 10px;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 4%, transparent);
}

.edit-cover {
	display: block;
	width: 80px;
	aspect-ratio: 2 / 3;
	flex: 0 0 auto;
	overflow: hidden;
	border-radius: 6px;
	text-decoration: none;
}

.edit-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.anime-cover-placeholder {
	display: grid;
	width: 100%;
	height: 100%;
	place-items: center;
	background: var(--surface, #1e293b);
	color: var(--fg-muted, #94a3b8);
	font-size: 1.1rem;
}

.edit-main {
	display: flex;
	flex: 1;
	min-width: 0;
	align-items: center;
	gap: 18px;
}

.edit-title {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	color: var(--fg, #e2e8f0);
	font-size: 0.95rem;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.edit-controls,
.control-secondary-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.edit-select {
	min-height: 34px;
	padding: 6px 9px;
	border: 1px solid var(--border, #334155);
	border-radius: 7px;
	background: var(--surface, #1e293b);
	color: var(--fg, #e2e8f0);
	font-size: 0.8rem;
	cursor: pointer;
}

.edit-select:focus {
	border-color: var(--accent, #6366f1);
	outline: none;
}

.score-select {
	min-width: 70px;
}

.progress-group {
	display: flex;
	align-items: center;
	gap: 4px;
}

.stepper-btn {
	display: grid;
	width: 30px;
	height: 32px;
	place-items: center;
	flex: 0 0 auto;
	border: 1px solid var(--border, #334155);
	border-radius: 6px;
	background: var(--surface, #1e293b);
	color: var(--fg, #e2e8f0);
	font-size: 0.9rem;
	cursor: pointer;
}

.stepper-btn:hover {
	border-color: var(--accent, #6366f1);
	background: color-mix(in srgb, var(--accent, #6366f1) 20%, transparent);
	color: var(--accent, #6366f1);
}

.progress-display {
	min-width: 48px;
	color: var(--fg, #e2e8f0);
	font-size: 0.8rem;
	text-align: center;
	white-space: nowrap;
}

.remove-form {
	position: absolute;
	top: 12px;
	right: 12px;
}

.remove-btn {
	display: grid;
	width: 30px;
	height: 30px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: var(--color-zinc-500, #71717a);
	cursor: pointer;
	transition:
		background 0.12s,
		color 0.12s;
}

.remove-btn:hover {
	background: color-mix(in srgb, var(--color-danger, #f87171) 18%, transparent);
	color: var(--color-danger, #f87171);
}

.confirm-layer {
	position: fixed;
	z-index: 1000;
	inset: 0;
	display: grid;
	place-items: center;
	padding: 20px;
}

.confirm-backdrop {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	padding: 0;
	border: 0;
	background: rgba(2, 6, 23, 0.72);
	cursor: default;
	backdrop-filter: blur(3px);
}

.confirm-dialog {
	position: relative;
	width: min(100%, 380px);
	padding: 24px;
	border: 1px solid var(--border, #334155);
	border-radius: 14px;
	background: var(--surface, #1e293b);
	box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
	text-align: center;
}

.confirm-icon {
	display: grid;
	width: 42px;
	height: 42px;
	margin: 0 auto 14px;
	place-items: center;
	border-radius: 50%;
	background: color-mix(in srgb, var(--color-danger, #f87171) 16%, transparent);
	color: var(--color-danger, #f87171);
	font-size: 1.15rem;
}

.confirm-dialog h2 {
	margin: 0;
	color: var(--fg, #e2e8f0);
	font-size: 1rem;
}

.confirm-dialog p {
	margin: 10px 0 20px;
	color: var(--fg-muted, #94a3b8);
	font-size: 0.84rem;
	line-height: 1.6;
}

.confirm-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.confirm-cancel,
.confirm-delete {
	min-height: 40px;
	border-radius: 8px;
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
}

.confirm-cancel {
	border: 1px solid var(--border, #334155);
	background: transparent;
	color: var(--fg, #e2e8f0);
}

.confirm-delete {
	border: 1px solid transparent;
	background: var(--color-danger, #ef4444);
	color: white;
}

.confirm-cancel:hover {
	background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
}

.confirm-delete:hover {
	filter: brightness(1.08);
}

@media (max-width: 768px) {
	.anime-row-edit {
		align-items: flex-start;
		gap: 10px;
		min-height: 0;
		padding: 8px 38px 8px 8px;
	}

	.edit-cover {
		width: 60px;
	}

	.edit-main {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}

	.edit-title {
		display: -webkit-box;
		overflow: hidden;
		font-size: 0.82rem;
		line-height: 1.35;
		white-space: normal;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.edit-controls {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}

	.status-select {
		width: 100%;
	}

	.control-secondary-row {
		width: 100%;
		gap: 8px;
	}

	.progress-group {
		flex: 0 0 auto;
	}

	.score-select {
		width: 72px;
		min-width: 72px;
	}

	.edit-select {
		min-height: 36px;
		padding: 6px 8px;
		font-size: 0.78rem;
	}

	.stepper-btn {
		width: 30px;
		height: 34px;
	}

	.progress-display {
		flex: 0 0 auto;
		min-width: 40px;
		font-size: 0.75rem;
	}

	.remove-form {
		top: 8px;
		right: 8px;
	}
}
</style>
