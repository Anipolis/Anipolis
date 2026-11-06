<script lang="ts">
import { tick, untrack } from "svelte";

/**
 * コレクションの並べ替え（詳細ページの並べ替えボタン）。並びが変わるたびに onchange で知らせ、
 * 保存とキャンセルは呼ぶ側（タイトル横のボタン）が受け持つ。
 * - ドラッグで並べ替え、つかんでいる間だけ画面の下に出るゴミ箱へ落とすと外す
 * - 指は長押ししてからつかむ（そのまま動かせば画面のスクロールになる）
 * - キーボードは矢印キーで前後へ動かし、Delete / Backspace で外す
 */
type Item = { id: number; title: string; cover_url: string | null };

interface Props {
	items: Item[];
	/** 並びが変わるたびに、その並びの作品 ID を渡す */
	onchange: (animeIds: number[]) => void;
	/** 保存中は動かせなくする */
	disabled?: boolean;
}

let { items, onchange, disabled = false }: Props = $props();

let order = $state<Item[]>(untrack(() => [...items]));
let draggingId = $state<number | null>(null);
let ghost = $state<{ x: number; y: number } | null>(null);
let overTrash = $state(false);
let announcement = $state("");
let trash = $state<HTMLDivElement | null>(null);

// つかむ前の押し始め（マウスは少し動かしたら、指は長押ししたらつかむ）
let pending: { id: number; x: number; y: number; type: string } | null = null;
let pressTimer: ReturnType<typeof setTimeout> | null = null;

const dragging = $derived(order.find((item) => item.id === draggingId) ?? null);

// ドラッグ中に画面の端へ近づいたら、その方向へ画面を送る（指のスクロールは止めているため）
const EDGE_PX = 72;
const MAX_SCROLL_STEP = 14;
let lastPointer: { x: number; y: number } | null = null;
let scrollFrame: number | null = null;

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

function stopAutoScroll() {
	if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
	scrollFrame = null;
}

/** 端からの近さに応じた1コマ分の送り量（上端は負、下端は正、端から離れていれば 0） */
function edgeScrollStep(y: number) {
	// ゴミ箱の上では送らない（下端の近くにあるので、外そうとしている間に画面が動いてしまう）
	if (overTrash) return 0;
	if (y < EDGE_PX) return -Math.ceil(((EDGE_PX - y) / EDGE_PX) * MAX_SCROLL_STEP);
	const fromBottom = window.innerHeight - y;
	if (fromBottom < EDGE_PX) return Math.ceil(((EDGE_PX - fromBottom) / EDGE_PX) * MAX_SCROLL_STEP);
	return 0;
}

function autoScroll() {
	scrollFrame = null;
	if (draggingId === null || !lastPointer) return;
	const step = edgeScrollStep(lastPointer.y);
	if (step === 0) return;
	window.scrollBy(0, step);
	// 画面が動くと指の下の作品も変わるので、同じ位置でもう一度確かめる
	dragOver(lastPointer.x, lastPointer.y);
	scrollFrame = requestAnimationFrame(autoScroll);
}

function endDrag() {
	stopAutoScroll();
	lastPointer = null;
	draggingId = null;
	ghost = null;
	overTrash = false;
}

function setOrder(next: Item[]) {
	order = next;
	onchange(next.map((item) => item.id));
}

function onPointerDown(event: PointerEvent, id: number) {
	if (disabled || event.button !== 0) return;
	pending = { id, x: event.clientX, y: event.clientY, type: event.pointerType };
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
	setOrder(next);
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
	lastPointer = { x: event.clientX, y: event.clientY };
	dragOver(event.clientX, event.clientY);
	if (scrollFrame === null && edgeScrollStep(event.clientY) !== 0) scrollFrame = requestAnimationFrame(autoScroll);
}

function dragOver(x: number, y: number) {
	if (draggingId === null) return;
	ghost = { x, y };
	overTrash = isOverTrash(x, y);
	if (overTrash) return;
	// 指の下にある作品の位置へ動かす（つかんでいる作品の影は pointer-events: none）
	const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-reorder-index]");
	if (target) moveTo(draggingId, Number(target.dataset["reorderIndex"]));
}

function onPointerUp() {
	if (draggingId !== null && overTrash) remove(draggingId);
	clearPress();
	endDrag();
}

function remove(id: number) {
	const item = order.find((entry) => entry.id === id);
	setOrder(order.filter((entry) => entry.id !== id));
	if (item) announcement = `「${item.title}」を外しました`;
}

async function onKeyDown(event: KeyboardEvent, index: number) {
	const item = order[index];
	if (!item || disabled) return;
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

// つかんでいる間は、指を動かしても画面をスクロールさせない（passive では止められないので自分で付ける）
$effect(() => {
	const preventScroll = (event: TouchEvent) => {
		if (draggingId !== null) event.preventDefault();
	};
	window.addEventListener("touchmove", preventScroll, { passive: false });
	return () => {
		window.removeEventListener("touchmove", preventScroll);
		clearPress();
		stopAutoScroll();
	};
});
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp} />

<div class="reorder" class:reorder--dragging={draggingId !== null}>
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

	<div class="sr-only" aria-live="polite">{announcement}</div>
</div>

<!-- つかんでいる間だけ出すゴミ箱と、指に付いてくる作品の影 -->
{#if dragging}
	<div bind:this={trash} class="reorder-trash" class:reorder-trash--over={overTrash} aria-hidden="true">
		<span class="i-lucide-trash-2"></span>
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
	padding: 16px;
}
.reorder--dragging {
	user-select: none;
	-webkit-user-select: none;
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
.reorder-trash {
	position: fixed;
	bottom: 24px;
	left: 50%;
	z-index: 1100;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64px;
	height: 64px;
	border: 2px dashed var(--color-danger);
	border-radius: 999px;
	background: var(--color-surface);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
	color: var(--color-danger);
	font-size: 26px;
	transform: translateX(-50%);
	transition:
		transform 0.12s ease,
		background 0.12s ease;
}
/* スマホは下のナビ（高さ 56px）の上に出す */
@media (max-width: 960px) {
	.reorder-trash {
		bottom: calc(56px + 16px + env(safe-area-inset-bottom));
	}
}
.reorder-trash--over {
	background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
	transform: translateX(-50%) scale(1.15);
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
