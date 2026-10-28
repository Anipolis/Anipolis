<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { tick } from "svelte";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import type { AnimeStatus, UserAnimeEntry } from "$lib/types";

/**
 * PC のアニメ一覧で、カードのボタンから開く小さな視聴ステータス欄。
 * ボタンの上（入りきらなければ下）に出し、選んだらその場で保存する。
 * スコアや進捗は大きいモーダル（MyListModal）で直す
 */
type Props = {
	anchor: HTMLElement;
	animeId: string | number;
	animeTitle: string;
	entry?: UserAnimeEntry | null | undefined;
	action?: string;
	onclose: () => void;
	/** 「スコア・進捗も編集」で大きいモーダルへ切り替える */
	onopenfull: () => void;
};

let { anchor, animeId, animeTitle, entry = null, action = "?/upsertWatchlist", onclose, onopenfull }: Props = $props();

const statusOptions: { value: AnimeStatus; label: string }[] = [
	{ value: "plan_to_watch", label: "視聴予定" },
	{ value: "watching", label: "視聴中" },
	{ value: "completed", label: "完了" },
	{ value: "on_hold", label: "中断" },
	{ value: "dropped", label: "断念" },
];

const GAP = 6;
const MARGIN = 8;

let popover = $state<HTMLDivElement | null>(null);
let position = $state<{ top: number; left: number } | null>(null);
let submitting = $state(false);
let errorMessage = $state("");

// 状態だけを変えるので、スコアと進捗は今の値のまま送る（送らないと消える）
const currentScore = $derived(entry?.score != null && entry.score > 0 ? Math.round(entry.score) : "");
const currentProgress = $derived(entry?.progress ?? 0);

function place() {
	if (!popover) return;
	const rect = anchor.getBoundingClientRect();
	const height = popover.offsetHeight;
	const width = popover.offsetWidth;
	const fitsAbove = rect.top - GAP - height >= MARGIN;
	const top = fitsAbove
		? rect.top - GAP - height
		: Math.max(MARGIN, Math.min(rect.bottom + GAP, window.innerHeight - height - MARGIN));
	const left = Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - MARGIN));
	position = { top, left };
}

function close({ returnFocus = false } = {}) {
	if (submitting) return;
	// 閉じると親が anchor を外すので、先に控えておく
	const button = anchor;
	onclose();
	if (returnFocus) button.focus();
}

$effect(() => {
	if (!popover) return;
	place();
	void tick().then(() => {
		const current = popover?.querySelector<HTMLButtonElement>('[aria-current="true"]');
		(current ?? popover?.querySelector<HTMLButtonElement>("button"))?.focus();
	});
});

$effect(() => {
	const handlePointerDown = (event: PointerEvent) => {
		const target = event.target as Node;
		// ボタン自身を押したときは、ボタンの onclick が開け閉めする
		if (popover?.contains(target) || anchor.contains(target)) return;
		close();
	};
	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") close({ returnFocus: true });
	};
	// 位置は開いたときに決めるので、スクロールや幅の変化で閉じる
	const handleMove = () => close();
	document.addEventListener("pointerdown", handlePointerDown, true);
	window.addEventListener("keydown", handleKeydown);
	window.addEventListener("scroll", handleMove, { capture: true, passive: true });
	window.addEventListener("resize", handleMove);
	return () => {
		document.removeEventListener("pointerdown", handlePointerDown, true);
		window.removeEventListener("keydown", handleKeydown);
		window.removeEventListener("scroll", handleMove, { capture: true });
		window.removeEventListener("resize", handleMove);
	};
});

const handleSubmit: SubmitFunction = ({ formData, cancel }) => {
	if (formData.get("status") === entry?.status) {
		cancel();
		close({ returnFocus: true });
		return;
	}
	submitting = true;
	errorMessage = "";
	return async ({ result }) => {
		submitting = false;
		if (result.type === "failure") {
			errorMessage = (result.data as { message?: string })?.message ?? "マイリストの保存に失敗しました";
			return;
		}
		if (result.type === "error") {
			errorMessage = "マイリストの保存に失敗しました";
			return;
		}
		await invalidateAll();
		close({ returnFocus: true });
	};
};
</script>

<div
	bind:this={popover}
	class="status-popover"
	class:status-popover--placed={position}
	style:top={position ? `${position.top}px` : undefined}
	style:left={position ? `${position.left}px` : undefined}
	role="dialog"
	aria-label="{animeTitle}の視聴ステータス"
>
	<form method="POST" {action} use:enhance={handleSubmit}>
		<input type="hidden" name="anime_id" value={animeId}>
		<input type="hidden" name="score" value={currentScore}>
		<input type="hidden" name="progress" value={currentProgress}>
		<ul class="status-popover-list">
			{#each statusOptions as option (option.value)}
				{@const selected = entry?.status === option.value}
				<li>
					<button
						type="submit"
						name="status"
						value={option.value}
						class="status-popover-option"
						data-status={option.value}
						aria-current={selected ? "true" : undefined}
						disabled={submitting}
					>
						<span class="status-popover-dot" aria-hidden="true"></span>
						<span class="status-popover-label">{option.label}</span>
						{#if selected}
							<span class="i-lucide-check status-popover-check" aria-hidden="true"></span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</form>
	{#if errorMessage}
		<p class="status-popover-error" role="alert">{errorMessage}</p>
	{/if}
	<button type="button" class="status-popover-more" disabled={submitting} onclick={onopenfull}>
		スコア・進捗も編集
	</button>
</div>

<style>
.status-popover {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 900;
	width: 168px;
	padding: 4px;
	border: 1px solid var(--color-border-hover);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 12px 32px rgb(0 0 0 / 0.32);
	visibility: hidden;
}
.status-popover--placed {
	visibility: visible;
}
.status-popover-list {
	margin: 0;
	padding: 0;
	list-style: none;
}
.status-popover-option,
.status-popover-more {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 7px 10px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font: inherit;
	font-size: 0.85rem;
	text-align: left;
}
.status-popover-option:hover:not(:disabled),
.status-popover-more:hover:not(:disabled),
.status-popover-option:focus-visible,
.status-popover-more:focus-visible {
	background: var(--color-surface-hover);
	outline: none;
}
.status-popover-option[aria-current="true"] {
	font-weight: 700;
}
.status-popover-option:disabled,
.status-popover-more:disabled {
	cursor: wait;
	opacity: 0.6;
}
.status-popover-dot {
	flex-shrink: 0;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--status-color);
}
.status-popover-label {
	flex: 1;
}
.status-popover-check {
	width: 14px;
	height: 14px;
	color: var(--status-color);
}
[data-status="plan_to_watch"] {
	--status-color: var(--status-plan);
}
[data-status="watching"] {
	--status-color: var(--status-watching);
}
[data-status="completed"] {
	--status-color: var(--status-completed);
}
[data-status="on_hold"] {
	--status-color: var(--status-on-hold);
}
[data-status="dropped"] {
	--status-color: var(--status-dropped);
}
.status-popover-more {
	margin-top: 4px;
	border-top: 1px solid var(--color-border);
	border-radius: 0 0 8px 8px;
	color: var(--color-text-muted);
	font-size: 0.78rem;
}
.status-popover-error {
	margin: 4px 6px;
	color: var(--color-danger);
	font-size: 0.75rem;
}
</style>
