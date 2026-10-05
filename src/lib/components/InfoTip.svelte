<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
	// ボタンの読み上げ名に使う。「◯◯の説明」と読まれる
	label: string;
	text?: string;
	children?: Snippet;
};

let { label, text, children }: Props = $props();

const id = $props.id();
let button = $state<HTMLButtonElement>();
let popover = $state<HTMLDivElement>();

const GAP = 6;
const MARGIN = 8;

// ポップオーバーはトップレイヤーに出るので、overflow や transform を持つ親(フィルタードロワー等)に切られない。
// 位置はボタンの直下(入らなければ直上)に合わせ、画面端からはみ出さないよう左右をずらす。
function place() {
	if (!button || !popover) return;
	const anchor = button.getBoundingClientRect();
	const width = popover.offsetWidth;
	const height = popover.offsetHeight;
	const left = Math.min(
		Math.max(anchor.left + anchor.width / 2 - width / 2, MARGIN),
		window.innerWidth - width - MARGIN,
	);
	const below = anchor.bottom + GAP;
	const top = below + height > window.innerHeight - MARGIN ? anchor.top - height - GAP : below;
	// ハイドレーション前に開いた場合は、ブラウザ既定の画面中央表示のままにする
	popover.style.inset = "auto";
	popover.style.margin = "0";
	popover.style.left = `${Math.max(left, MARGIN)}px`;
	popover.style.top = `${Math.max(top, MARGIN)}px`;
}

function close() {
	if (popover?.matches(":popover-open")) popover.hidePopover();
}

// 開いている間の Esc はこの説明だけを閉じ、後ろのシートやモーダルの Esc 処理には渡さない
function handleEscape(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	event.stopPropagation();
	event.preventDefault();
	close();
}

$effect(() => () => window.removeEventListener("keydown", handleEscape, { capture: true }));

// popovertarget に任せると位置合わせ(toggle イベント)が描画の後になり、最初の1フレームだけ
// 仮の位置(画面中央)に出てしまう。ハイドレーション後はクリックで自分で開き、同じ処理の中で位置を決める。
// ハイドレーション前のクリックは popovertarget の既定動作で開く。
function handleClick(event: MouseEvent) {
	if (!popover) return;
	event.preventDefault();
	if (popover.matches(":popover-open")) {
		popover.hidePopover();
		return;
	}
	popover.showPopover();
	place();
}

function handleToggle(event: ToggleEvent) {
	if (event.newState !== "open") {
		window.removeEventListener("keydown", handleEscape, { capture: true });
		return;
	}
	place();
	window.addEventListener("keydown", handleEscape, { capture: true });
	// 位置を固定しているので、スクロールやリサイズで基準のボタンがずれたら閉じる
	window.addEventListener("scroll", close, { capture: true, once: true });
	window.addEventListener("resize", close, { once: true });
}
</script>

<button
	bind:this={button}
	type="button"
	class="info-tip-button"
	popovertarget="{id}-popover"
	onclick={handleClick}
	aria-label="{label}の説明"
	title="{label}の説明"
>
	<span class="i-lucide-info" aria-hidden="true"></span>
</button>
<div bind:this={popover} id="{id}-popover" class="info-tip-popover" popover="auto" role="note" ontoggle={handleToggle}>
	{#if children}
		{@render children()}
	{:else}
		{text}
	{/if}
</div>

<style>
.info-tip-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--color-text-muted);
	font-size: 0.95rem;
	line-height: 1;
	vertical-align: middle;
	cursor: pointer;
	flex-shrink: 0;
}
.info-tip-button:hover,
.info-tip-button:focus-visible {
	color: var(--color-text);
	background: var(--color-surface-hover);
}
.info-tip-popover {
	/* 位置を計算する前(ハイドレーション前)は画面中央に出す。全体リセットの margin: 0 を打ち消す */
	inset: 0;
	margin: auto;
	width: max-content;
	height: max-content;
	max-width: min(300px, calc(100vw - 16px));
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	background: var(--color-surface);
	color: var(--color-text-secondary);
	font-size: 0.8rem;
	font-weight: 400;
	line-height: 1.6;
	letter-spacing: normal;
	text-transform: none;
	white-space: normal;
	text-align: left;
	box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}
.info-tip-popover :global(p) {
	margin: 0;
}
.info-tip-popover :global(p + p) {
	margin-top: 6px;
}
</style>
