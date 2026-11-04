<script lang="ts">
import { animeCardMeta } from "$lib/anime-labels";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import { stepProgress } from "$lib/mylist/progress";
import type { RowSaveState } from "$lib/mylist/save-queue";
import { parseEpisodeCount } from "$lib/syobocal-episodes";
import type { Anime, AnimeStatus } from "$lib/types";

/**
 * マイリストの話数を記録する行。ここで変えるのは話数（と話数に連動するステータス）だけで、
 * スコアやメモ、リストから外す操作は鉛筆から開く詳細のモーダルに任せる
 */
type EntryState = { status: AnimeStatus; score: string; progress: number };

let {
	anime,
	entry,
	statusLabel,
	saveState,
	onAutoSave,
	onRetry,
	onOpenDetail,
}: {
	anime: Anime;
	entry: EntryState;
	statusLabel: Record<AnimeStatus, string>;
	/** 自動保存の状態。未編集なら undefined */
	saveState?: RowSaveState<EntryState> | undefined;
	onAutoSave: (updatedFields: Partial<EntryState>) => void;
	/** 失敗した保存を、保持している最新値で再送する */
	onRetry: () => void;
	onOpenDetail: () => void;
} = $props();

const saveStatus = $derived(saveState?.status ?? "idle");
const episodeTotal = $derived(parseEpisodeCount(anime.episode_count));
const meta = $derived([animeCardMeta(anime), statusLabel[entry.status]].filter(Boolean).join("・"));

// 話数に連動してステータスが変わったら、保存の知らせで伝える
let changedStatus = $state<AnimeStatus | null>(null);

function step(delta: 1 | -1) {
	const changes = stepProgress(entry, delta, episodeTotal);
	if (!changes) return;
	changedStatus = changes.status ?? null;
	onAutoSave(changes);
}
</script>

<div class="progress-row">
	<a href="/anime/{anime.id}" class="row-cover" tabindex="-1">
		{#if anime.cover_url}
			<img
				src={coverThumbSrc(anime.cover_url)}
				{@attach coverThumbFallback(anime.cover_url)}
				alt={anime.title}
				loading="lazy"
				decoding="async"
			>
		{:else}
			<div class="anime-cover-placeholder">?</div>
		{/if}
	</a>

	<div class="row-main">
		<div class="row-title">{anime.title}</div>
		<p class="row-meta">{meta}</p>

		<div class="row-controls">
			<div class="progress-group">
				<button
					type="button"
					class="row-btn"
					disabled={entry.progress <= 0}
					onclick={() => step(-1)}
					aria-label="1話戻す"
				>
					<span class="i-lucide-minus" aria-hidden="true"></span>
				</button>
				<span class="progress-display">{entry.progress}/{anime.episode_count ?? "−"}</span>
				<button
					type="button"
					class="row-btn"
					disabled={episodeTotal != null && entry.progress >= episodeTotal}
					onclick={() => step(1)}
					aria-label="1話進める"
				>
					<span class="i-lucide-plus" aria-hidden="true"></span>
				</button>
			</div>

			<!-- 行ごとの保存状態。失敗時は編集値を保持したまま再試行できる -->
			<div class="save-status save-status--{saveStatus}" role="status" aria-live="polite">
				{#if saveStatus === "pending"}
					<span>まもなく保存</span>
				{:else if saveStatus === "saving"}
					<span class="save-spinner" aria-hidden="true"></span>
					<span>保存中…</span>
				{:else if saveStatus === "saved"}
					<span class="i-lucide-check" aria-hidden="true"></span>
					<span>{changedStatus ? `${statusLabel[changedStatus]}にしました` : "保存しました"}</span>
				{:else if saveStatus === "failed"}
					<span class="i-lucide-triangle-alert" aria-hidden="true"></span>
					<span>{saveState?.error ?? "保存できませんでした"}</span>
					<button type="button" class="save-retry-btn" onclick={onRetry}>再試行</button>
				{/if}
			</div>

			<button
				type="button"
				class="row-btn"
				onclick={onOpenDetail}
				aria-label="「{anime.title}」の詳細を編集"
				title="詳細を編集"
			>
				<span class="i-lucide-pencil" aria-hidden="true"></span>
			</button>
		</div>
	</div>
</div>

<style>
.progress-row {
	display: flex;
	align-items: stretch;
	gap: 14px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 12px;
}

.row-cover {
	display: block;
	width: 72px;
	aspect-ratio: 2 / 3;
	flex: 0 0 auto;
	overflow: hidden;
	border-radius: 6px;
	background: var(--color-surface-hover);
	text-decoration: none;
}

.row-cover img {
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
	color: var(--color-text-muted);
	font-size: 1.1rem;
}

.row-main {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	gap: 2px;
}

.row-title {
	display: -webkit-box;
	overflow: hidden;
	color: var(--color-text);
	font-size: 0.92rem;
	font-weight: 600;
	line-height: 1.35;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.row-meta {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 0.76rem;
	line-height: 1.4;
}

.row-controls {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: auto;
	padding-top: 6px;
}

.progress-group {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 4px;
}

.row-btn {
	display: grid;
	width: 36px;
	height: 36px;
	flex: 0 0 auto;
	place-items: center;
	padding: 0;
	border: 1.5px solid var(--color-border-hover);
	border-radius: 8px;
	background: transparent;
	color: var(--color-text);
	font-size: 0.95rem;
	cursor: pointer;
}

.row-btn:hover:not(:disabled) {
	background: var(--color-surface-hover);
}

.row-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.progress-display {
	min-width: 56px;
	color: var(--color-text);
	font-size: 0.86rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	text-align: center;
	white-space: nowrap;
}

/* 行ごとの保存状態。押したボタンのそばに出す */
.save-status {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	justify-content: flex-end;
	align-items: center;
	min-width: 0;
	gap: 2px 4px;
	color: var(--color-text-muted);
	font-size: 0.72rem;
	line-height: 1.3;
	text-align: right;
}

.save-status--failed {
	color: var(--color-danger);
}

.save-spinner {
	width: 10px;
	height: 10px;
	flex: 0 0 auto;
	border: 2px solid currentColor;
	border-right-color: transparent;
	border-radius: 50%;
	corner-shape: round;
	animation: save-spin 0.8s linear infinite;
}

@keyframes save-spin {
	to {
		transform: rotate(360deg);
	}
}

.save-retry-btn {
	padding: 2px 8px;
	border: 1px solid currentColor;
	border-radius: 5px;
	background: transparent;
	color: inherit;
	font-size: 0.72rem;
	font-weight: 600;
	cursor: pointer;
}

.save-retry-btn:hover {
	background: color-mix(in srgb, currentColor 12%, transparent);
}

@media (max-width: 768px) {
	.progress-row {
		gap: 10px;
		padding: 8px;
	}

	.row-cover {
		width: 64px;
	}

	.row-title {
		font-size: 0.84rem;
	}

	.row-meta {
		font-size: 0.72rem;
	}

	.progress-display {
		min-width: 48px;
	}
}

@media (max-width: 359px) {
	.row-cover {
		width: 52px;
	}

	.progress-display {
		min-width: 40px;
	}
}
</style>
