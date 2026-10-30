<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { tick, untrack } from "svelte";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { entryFromForm } from "$lib/mylist/entry-from-form";
import type { AnimeStatus, UserAnimeEntry } from "$lib/types";

/**
 * PC のアニメ一覧で、カードのボタンから開く小さな視聴ステータス欄。
 * ボタンと同じ幅で、ボタンの上（入りきらなければ下）へそのまま伸ばし、選んだらその場で保存する。
 * スコアや進捗は作品ページや大きいモーダル（MyListModal）で直す。
 * 選んでいる状態は、状態ごとの色ではなく共通の色で示す（一覧では登録したかどうかが分かればよい）
 */
type Props = {
	anchor: HTMLElement;
	animeId: string | number;
	animeTitle: string;
	entry?: UserAnimeEntry | null | undefined;
	action?: string;
	/** 渡すと、登録済みの作品に「マイリストから外す」を出す */
	removeAction?: string;
	/** 渡すと保存後にページを読み込み直さず、保存した内容を知らせる（外したときは null） */
	onsaved?: (entry: UserAnimeEntry | null, animeId: string) => void;
	onclose: () => void;
	/** 保存中かどうか。親は保存中に別の作品へ切り替えない（応答が切り替え先に反映されるため） */
	submitting?: boolean;
};

let {
	anchor,
	animeId,
	animeTitle,
	entry = null,
	action = "?/upsertWatchlist",
	removeAction,
	onsaved,
	onclose,
	submitting = $bindable(false),
}: Props = $props();

const statusOptions: { value: AnimeStatus; label: string }[] = [
	{ value: "plan_to_watch", label: "視聴予定" },
	{ value: "watching", label: "視聴中" },
	{ value: "completed", label: "完了" },
	{ value: "on_hold", label: "中断" },
	{ value: "dropped", label: "断念" },
];

const MARGIN = 8;

let popover = $state<HTMLDivElement | null>(null);
let position = $state<{ top: number; left: number; width: number; placement: "above" | "below" } | null>(null);
let errorMessage = $state("");

// 状態だけを変えるので、スコアと進捗は今の値のまま送る（送らないと消える）
const currentScore = $derived(entry?.score != null && entry.score > 0 ? Math.round(entry.score) : "");
const currentProgress = $derived(entry?.progress ?? 0);

// 上下は開いたときに一度だけ決める（$state にすると place を呼ぶ effect が自分を呼び直す）
let placement: "above" | "below" | null = null;

function place() {
	if (!popover) return;
	const rect = anchor.getBoundingClientRect();
	const height = popover.offsetHeight;
	placement ??= rect.top - height >= MARGIN ? "above" : "below";
	const top = placement === "above" ? rect.top - height : rect.bottom;
	if (position && position.top === top && position.left === rect.left && position.width === rect.width) return;
	position = { top, left: rect.left, width: rect.width, placement };
}

function close({ returnFocus = false } = {}) {
	if (submitting) return;
	// 閉じると親が anchor を外すので、先に控えておく（保存中に別の作品へ移ると、もう無いこともある）
	const button = anchor;
	onclose();
	if (returnFocus) button?.focus();
}

$effect(() => {
	if (!popover) return;
	// place は position を読むので、effect の依存にしない（書くたびに effect が走り直す）
	untrack(place);
	// カードはホバーで少し持ち上がるので、動いている間もボタンに付いていく
	let frame = requestAnimationFrame(function follow() {
		place();
		frame = requestAnimationFrame(follow);
	});
	void tick().then(() => {
		const current = popover?.querySelector<HTMLButtonElement>('[aria-current="true"]');
		(current ?? popover?.querySelector<HTMLButtonElement>("button"))?.focus();
	});
	return () => cancelAnimationFrame(frame);
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

// 保存中に欄が消えても、親が切り替えられないままにならないようにする
$effect(() => () => {
	submitting = false;
});

const handleSubmit: SubmitFunction = ({ formData, submitter, cancel }) => {
	const removing = submitter?.hasAttribute("data-remove") === true;
	if (!removing && formData.get("status") === entry?.status) {
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
		// 保存した作品の ID も渡す（応答が来るまでに親が別の作品へ移っていることがある）
		if (onsaved) onsaved(removing ? null : entryFromForm(formData), String(formData.get("anime_id")));
		else await invalidateAll();
		close({ returnFocus: true });
	};
};
</script>

<div
	bind:this={popover}
	class="status-popover"
	class:status-popover--placed={position}
	class:status-popover--below={position?.placement === "below"}
	style:top={position ? `${position.top}px` : undefined}
	style:left={position ? `${position.left}px` : undefined}
	style:width={position ? `${position.width}px` : `${anchor.offsetWidth}px`}
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
						aria-current={selected ? "true" : undefined}
						disabled={submitting}
					>
						{option.label}
					</button>
				</li>
			{/each}
		</ul>
		{#if entry && removeAction}
			<button
				type="submit"
				formaction={removeAction}
				class="status-popover-remove"
				data-remove
				disabled={submitting}
				aria-label="マイリストから外す"
				title="マイリストから外す"
			>
				<!-- 欄はカードのボタンと同じ幅で狭いので、短く書く -->
				外す
			</button>
		{/if}
	</form>
	{#if errorMessage}
		<p class="status-popover-error" role="alert">{errorMessage}</p>
	{/if}
</div>

<style>
/* ボタンの上に付けて伸ばす（下に開くときは上下を入れ替える） */
.status-popover {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 900;
	overflow: hidden;
	border: 1px solid var(--color-border-hover);
	border-bottom: 0;
	border-radius: 10px 10px 0 0;
	background: var(--color-surface);
	box-shadow: 0 -8px 24px rgb(0 0 0 / 0.28);
	visibility: hidden;
}
.status-popover--below {
	border-top: 0;
	border-bottom: 1px solid var(--color-border-hover);
	border-radius: 0 0 10px 10px;
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.28);
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
.status-popover-remove {
	display: block;
	width: 100%;
	height: 32px;
	padding: 0 4px;
	overflow: hidden;
	border: 0;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.75rem;
	font-weight: 600;
	text-align: center;
	white-space: nowrap;
}
.status-popover-option:hover:not(:disabled),
.status-popover-option:focus-visible {
	background: var(--color-surface-hover);
	color: var(--color-text);
	outline: none;
}
/* 選んでいる状態は、状態によらず同じ色の背景と太字で示す */
.status-popover-option[aria-current="true"] {
	background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	color: var(--color-accent);
	font-weight: 800;
}
.status-popover-option[aria-current="true"]:hover:not(:disabled),
.status-popover-option[aria-current="true"]:focus-visible {
	background: color-mix(in srgb, var(--color-accent) 24%, transparent);
	color: var(--color-accent);
}
.status-popover-remove {
	border-top: 1px solid var(--color-border);
	font-weight: 500;
}
.status-popover-remove:hover:not(:disabled),
.status-popover-remove:focus-visible {
	background: var(--color-surface-hover);
	color: var(--color-error-text);
	outline: none;
}
.status-popover-option:disabled,
.status-popover-remove:disabled {
	cursor: wait;
	opacity: 0.6;
}
.status-popover-error {
	margin: 0;
	padding: 4px 6px;
	color: var(--color-danger);
	font-size: 0.7rem;
	text-align: center;
}
</style>
