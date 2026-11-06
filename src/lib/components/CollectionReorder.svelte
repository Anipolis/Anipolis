<script lang="ts">
import { tick, untrack } from "svelte";

/**
 * コレクションの並べ替え（詳細ページの並べ替えボタン）。保存を押すまでは何も確定しない。
 * - ドラッグで並べ替え、つかんでいる間だけ画面の下に出るゴミ箱へ落とすと外す
 * - 指は長押ししてからつかむ（そのまま動かせば画面のスクロールになる）
 * - キーボードは矢印キーで前後へ動かし、Delete / Backspace で外す
 */
type Item = { id: number; title: string; cover_url: string | null };

interface Props {
	items: Item[];
	onsave: (animeIds: number[]) => Promise<void>;
	oncancel: () => void;
}

let { items, onsave, oncancel }: Props = $props();

let order = $state<Item[]>(untrack(() => [...items]));
let draggingId = $state<number | null>(null);
let ghost = $state<{ x: number; y: number } | null>(null);
let overTrash = $state(false);
let saving = $state(false);
let errorMessage = $state("");
let announcement = $state("");
let trash = $state<HTMLDivElement | null>(null);

// つかむ前の押し始め（マウスは少し動かしたら、指は長押ししたらつかむ）
let pending: { id: number; pointerId: number; x: number; y: number; type: string } | null = null;
let pressTimer: ReturnType<typeof setTimeout> | null = null;

const dragging = $derived(order.find((item) => item.id === draggingId) ?? null);
const changed = $derived(order.length !== items.length || order.some((item, index) => item.id !== items[index]?.id));

const LONG_PRESS_MS = 250;
const MOUSE_DRAG_THRESHOLD = 4;
const TOUCH_SCROLL_THRESHOLD = 8;

function clearPress() {
	if (pressTimer) clearTimeout(pressTimer);
	pressTimer = null;
	pending = null;
}

function startDrag(id: number, x: number, y: number) {
	draggingId = id;
	ghost = { x, y };
	overTrash = false;
	clearPress();
}

function endDrag() {
	draggingId = null;
	ghost = null;
	overTrash = false;
}

function onPointerDown(event: PointerEvent, id: number) {
	if (saving || event.button !== 0) return;
	pending = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType };
	if (event.pointerType !== "mouse") {
		const { clientX, clientY } = event;
		pressTimer = setTimeout(() => {
			if (pending?.id === id) startDrag(id, clientX, clientY);
		}, LONG_PRESS_MS);
	}
}

function isOverTrash(x: number, y: number) {
	const rect = trash?.getBoundingClientRect();
	return rect != null && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function moveTo(id: number, targetIndex: number) {
	const from = order.findIndex((item) => item.id === id);
	if (from < 0 || from === targetIndex) return;
	const next = [...order];
	const [moved] = next.splice(from, 1);
	if (!moved) return;
	next.splice(targetIndex, 0, moved);
	order = next;
}

function onPointerMove(event: PointerEvent) {
	if (pending && draggingId === null) {
		const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
		if (pending.type === "mouse") {
			if (distance >= MOUSE_DRAG_THRESHOLD) startDrag(pending.id, event.clientX, event.clientY);
		} else if (distance >= TOUCH_SCROLL_THRESHOLD) {
			// 長押しの前に動いたら、スクロールとして扱う
			clearPress();
		}
		return;
	}
	if (draggingId === null) return;
	ghost = { x: event.clientX, y: event.clientY };
	overTrash = isOverTrash(event.clientX, event.clientY);
	if (overTrash) return;
	// 指の下にある作品の位置へ動かす（つかんでいる作品の影は pointer-events: none）
	const target = document
		.elementFromPoint(event.clientX, event.clientY)
		?.closest<HTMLElement>("[data-reorder-index]");
	if (target) moveTo(draggingId, Number(target.dataset["reorderIndex"]));
}

function onPointerUp() {
	if (draggingId !== null && overTrash) remove(draggingId);
	clearPress();
	endDrag();
}

function remove(id: number) {
	const item = order.find((entry) => entry.id === id);
	order = order.filter((entry) => entry.id !== id);
	if (item) announcement = `「${item.title}」を外しました`;
}

async function onKeyDown(event: KeyboardEvent, index: number) {
	const item = order[index];
	if (!item || saving) return;
	let target = index;
	if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = index - 1;
	else if (event.key === "ArrowRight" || event.key === "ArrowDown") target = index + 1;
	else if (event.key === "Delete" || event.key === "Backspace") {
		event.preventDefault();
		remove(item.id);
		await tick();
		focusIndex(Math.min(index, order.length - 1));
		return;
	} else return;
	event.preventDefault();
	if (target < 0 || target >= order.length) return;
	moveTo(item.id, target);
	announcement = `「${item.title}」を${target + 1}番目に動かしました`;
	await tick();
	focusIndex(target);
}

function focusIndex(index: number) {
	document.querySelector<HTMLElement>(`[data-reorder-index="${index}"]`)?.focus();
}

async function save() {
	saving = true;
	errorMessage = "";
	try {
		await onsave(order.map((item) => item.id));
	} catch (saveError) {
		errorMessage = saveError instanceof Error ? saveError.message : "保存に失敗しました";
	} finally {
		saving = false;
	}
}

// つかんでいる間は、指を動かしても画面をスクロールさせない（passive では止められないので自分で付ける）
$effect(() => {
	const preventScroll = (event: TouchEvent) => {
		if (draggingId !== null) event.preventDefault();
	};
	window.addEventListener("touchmove", preventScroll, { passive: false });
	return () => {
		window.removeEventListener("touchmove", preventScroll);
		clearPress();
	};
});
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp} />

<div class="reorder" class:reorder--dragging={draggingId !== null}>
	<p class="reorder-hint">
		ドラッグで並べ替え、下のゴミ箱へ運ぶと外せます（指は長押ししてから動かします）。矢印キーで動かし、Delete
		で外すこともできます
	</p>

	{#if order.length === 0}
		<div class="empty-state"><p>作品がありません。保存するとコレクションが空になります</p></div>
	{:else}
		<ol class="reorder-grid" aria-label="並べ替える作品">
			{#each order as item, index (item.id)}
				<li>
					<div
						class="reorder-card"
						class:reorder-card--dragging={item.id === draggingId}
						role="button"
						tabindex="0"
						aria-label="{index + 1}番目「{item.title}」。矢印キーで動かし、Delete で外します"
						data-reorder-index={index}
						onpointerdown={(event) => onPointerDown(event, item.id)}
						onkeydown={(event) => onKeyDown(event, index)}
						oncontextmenu={(event) => event.preventDefault()}
					>
						<span class="reorder-rank">{index + 1}</span>
						<span class="reorder-cover">
							{#if item.cover_url}
								<img src={item.cover_url} alt="" draggable="false">
							{:else}
								<span class="reorder-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
							{/if}
						</span>
						<span class="reorder-title">{item.title}</span>
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	{#if errorMessage}
		<p class="field-error-msg" role="alert">{errorMessage}</p>
	{/if}

	<div class="sr-only" aria-live="polite">{announcement}</div>

	<div class="reorder-bar">
		<button type="button" class="btn btn-ghost" disabled={saving} onclick={oncancel}>キャンセル</button>
		<button type="button" class="btn btn-primary" disabled={saving || !changed} onclick={save}>
			{saving ? '保存中...' : '保存する'}
		</button>
	</div>
</div>

<!-- つかんでいる間だけ出すゴミ箱と、指に付いてくる作品の影 -->
{#if dragging}
	<div bind:this={trash} class="reorder-trash" class:reorder-trash--over={overTrash} aria-hidden="true">
		<span class="i-lucide-trash-2"></span>
		ここに運ぶと外します
	</div>
	{#if ghost}
		<div class="reorder-ghost" style:left="{ghost.x}px" style:top="{ghost.y}px" aria-hidden="true">
			{#if dragging.cover_url}
				<img src={dragging.cover_url} alt="" draggable="false">
			{:else}
				<span class="reorder-cover-empty i-lucide-clapperboard"></span>
			{/if}
		</div>
	{/if}
{/if}

<style>
.reorder {
	padding: 12px 16px 0;
}
.reorder--dragging {
	user-select: none;
	-webkit-user-select: none;
}
.reorder-hint {
	margin: 0 0 12px;
	color: var(--color-text-muted);
	font-size: 13px;
	line-height: 1.6;
}
.reorder-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.reorder-card {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 6px;
	border: 1px dashed var(--color-border-hover);
	border-radius: 10px;
	background: var(--color-surface);
	cursor: grab;
	touch-action: manipulation;
	-webkit-touch-callout: none;
	-webkit-user-select: none;
	user-select: none;
}
.reorder-card:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.reorder-card--dragging {
	opacity: 0.35;
	cursor: grabbing;
}
.reorder-rank {
	position: absolute;
	top: 10px;
	left: 10px;
	z-index: 1;
	min-width: 22px;
	padding: 1px 6px;
	border-radius: 999px;
	background: rgb(0 0 0 / 0.6);
	color: #fff;
	font-size: 12px;
	font-weight: 700;
	text-align: center;
}
.reorder-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 6px;
	background: var(--color-border);
}
.reorder-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	pointer-events: none;
}
.reorder-cover-empty {
	color: var(--color-text-muted);
	font-size: 24px;
}
.reorder-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 12px;
	line-height: 1.4;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.reorder-bar {
	position: sticky;
	bottom: 0;
	z-index: 5;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin: 16px -16px 0;
	padding: 12px 16px;
	border-top: 1px solid var(--color-border);
	background: var(--color-surface);
}
.reorder-trash {
	position: fixed;
	bottom: 24px;
	left: 50%;
	z-index: 1100;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 14px 22px;
	border: 2px dashed var(--color-danger);
	border-radius: 999px;
	background: var(--color-surface);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
	color: var(--color-danger);
	font-size: 14px;
	font-weight: 600;
	transform: translateX(-50%);
	transition:
		transform 0.12s ease,
		background 0.12s ease;
}
.reorder-trash span {
	font-size: 20px;
}
.reorder-trash--over {
	background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
	transform: translateX(-50%) scale(1.08);
}
.reorder-ghost {
	position: fixed;
	z-index: 1200;
	width: 72px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 6px;
	background: var(--color-border);
	box-shadow: 0 12px 28px rgb(0 0 0 / 0.36);
	pointer-events: none;
	transform: translate(-50%, -60%) rotate(-4deg);
}
.reorder-ghost img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
</style>
