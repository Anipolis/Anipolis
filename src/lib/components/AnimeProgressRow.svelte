<script lang="ts">
import { tick } from "svelte";
import { animeCardMeta } from "$lib/anime-labels";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import { changeProgress } from "$lib/mylist/progress";
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

function setProgress(value: number) {
	const changes = changeProgress(entry, value, episodeTotal);
	if (!changes) return;
	changedStatus = changes.status ?? null;
	onAutoSave(changes);
}

// 話数の入力欄は、離れたときに確定する（入力の途中の数字で保存やステータスの連動を動かさない）
async function commitProgressInput(input: HTMLInputElement) {
	if (input.value.trim() !== "" && Number.isFinite(input.valueAsNumber)) setProgress(input.valueAsNumber);
	// 空欄や範囲の外では話数が変わらず、入力した文字が残るので、今の話数を出し直す
	await tick();
	input.value = String(entry.progress);
}

function handleProgressKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
	const input = event.currentTarget;
	if (event.key === "Enter") input.blur();
	if (event.key === "Escape") {
		input.value = String(entry.progress);
		input.blur();
	}
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
		<div class="row-title" title={anime.title}>{anime.title}</div>
		<div class="row-meta-line">
			<p class="row-meta" class:row-meta--hidden={saveStatus !== "idle"}>{meta}</p>
			<!-- 行ごとの保存状態。失敗時は編集値を保持したまま再試行できる。行の高さを変えないようメタの行に重ね、出ている間はメタを隠す -->
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
		</div>

		<div class="row-controls">
			<div class="progress-group">
				<button
					type="button"
					class="row-btn"
					disabled={entry.progress <= 0}
					onclick={() => setProgress(entry.progress - 1)}
					aria-label="1話戻す"
				>
					<span class="i-lucide-minus" aria-hidden="true"></span>
				</button>
				<input
					class="progress-input"
					type="number"
					inputmode="numeric"
					min="0"
					max={episodeTotal ?? undefined}
					value={entry.progress}
					aria-label="見た話数"
					onfocus={(event) => event.currentTarget.select()}
					onkeydown={handleProgressKeydown}
					onblur={(event) => commitProgressInput(event.currentTarget)}
				>
				<button
					type="button"
					class="row-btn"
					disabled={episodeTotal != null && entry.progress >= episodeTotal}
					onclick={() => setProgress(entry.progress + 1)}
					aria-label="1話進める"
				>
					<span class="i-lucide-plus" aria-hidden="true"></span>
				</button>
				<span class="progress-total">/ {episodeTotal ?? "−"}</span>
			</div>

			<button
				type="button"
				class="row-btn row-detail"
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
	padding: 10px 0;
}

.progress-row:not(:last-child) {
	border-bottom: 1px solid var(--color-border);
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

.row-meta-line {
	display: grid;
}

.row-meta-line > * {
	grid-area: 1 / 1;
}

.row-meta--hidden {
	visibility: hidden;
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

.row-detail {
	margin-left: auto;
}

.row-btn:hover:not(:disabled) {
	background: var(--color-surface-hover);
}

.row-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.progress-input {
	width: 44px;
	height: 36px;
	padding: 0 2px;
	border: 1.5px solid var(--color-border-hover);
	border-radius: 8px;
	outline: none;
	background: var(--color-bg);
	color: var(--color-text);
	font-family: inherit;
	font-size: 0.86rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	text-align: center;
	/* ブラウザ標準の上下矢印は出さない（−/＋ボタンがあり、矢印の分だけ数字が左に寄るため） */
	appearance: textfield;
}

.progress-input:focus {
	border-color: var(--color-accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.progress-input::-webkit-outer-spin-button,
.progress-input::-webkit-inner-spin-button {
	margin: 0;
	appearance: none;
}

.progress-total {
	flex: 0 0 auto;
	margin-left: 4px;
	color: var(--color-text-muted);
	font-size: 0.8rem;
	white-space: nowrap;
}

/* 行ごとの保存状態。押したボタンのすぐ上に出す */
.save-status {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	min-width: 0;
	gap: 2px 4px;
	color: var(--color-text-muted);
	font-size: 0.72rem;
	line-height: 1.3;
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

/* PCは横に余裕があるので1段にして、一度に多くの行を見せる */
@media (min-width: 769px) {
	.progress-row {
		align-items: center;
		padding: 4px 0;
	}

	.row-cover {
		width: 48px;
	}

	.row-main {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 16px;
	}

	.row-title {
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}

	.row-meta-line {
		grid-column: 1;
	}

	.row-controls {
		grid-column: 2;
		grid-row: 1 / span 2;
		margin-top: 0;
		padding-top: 0;
	}

	/* 話数の桁が違っても、行どうしでボタンの位置をそろえる */
	.progress-total {
		min-width: 40px;
	}
}

@media (max-width: 768px) {
	.progress-row {
		gap: 10px;
		padding: 8px 0;
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

	/* 16px 未満だと iPhone が入力時に画面を拡大する */
	.progress-input {
		font-size: 16px;
	}
}

@media (max-width: 359px) {
	.row-cover {
		width: 52px;
	}

	.row-controls {
		gap: 6px;
	}

	.row-btn {
		width: 32px;
		height: 32px;
	}

	.progress-input {
		width: 36px;
		height: 32px;
	}
}
</style>
