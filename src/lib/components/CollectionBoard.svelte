<script lang="ts">
import { tick, untrack } from "svelte";
import type { AnimePick } from "$lib/anime-picker";
import {
	collectionTierColor,
	MAX_COLLECTION_ITEMS,
	MAX_COLLECTION_TIER_LABEL_LENGTH,
	MAX_COLLECTION_TIERS,
	orderByTier,
} from "$lib/collections";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import CollectionSearch from "./CollectionSearch.svelte";

/**
 * 自分のコレクションの編集面（詳細ページ）。切り替えなしで、いつでも動かせる。
 * 並びが変わるたびに onchange で知らせ、保存は呼ぶ側が受け持つ（自動で保存する）。
 * - ドラッグで並べ替え、つかんでいる間だけ画面の下に出るゴミ箱へ落とすと外す（指は長押ししてからつかむ）
 * - 作品を押して選び、別の作品・段・未分類を押すとそこへ移す（スマホで動かしやすいように）。選んだ作品からは作品ページを開ける・外せる
 * - キーボードは矢印キーで動かし、Delete / Backspace で外す。ティア表は ↑↓ で段を移り、←→ で段の中の順番を変える
 * - ティア表（tiers を渡す）は、右（スマホは下）の未分類に作品を貯め、検索してそこへ足す。段の名前は押してその場で直し、
 *   「…」から段を足す・消す（ontierschange で知らせる）
 */
type Item = { id: number; title: string; cover_url: string | null; tier: number | null };

interface Props {
	items: Item[];
	/** ティア表の段の名前（上から）。渡さなければ段の無い並べ替え */
	tiers?: string[] | undefined;
	/** 順位の番号を出す（ランキング） */
	showRank?: boolean;
	/** 並びが変わるたびに、その並びの作品 ID と段（tiers の何番目か。未分類は null）を渡す */
	onchange: (animeIds: number[], animeTiers: (number | null)[]) => void;
	/**
	 * 段の名前・並びが変わったとき。origins は新しい各段が元は何番目だったか（足した段は null）。
	 * 作品の並びと、付け替えたあとの段も一緒に渡す（DB の関数も同じ付け替えをする）
	 */
	ontierschange?: (
		tiers: string[],
		origins: (number | null)[],
		animeIds: number[],
		animeTiers: (number | null)[],
	) => void;
}

let { items, tiers, showRank = false, onchange, ontierschange }: Props = $props();

const tiered = untrack(() => tiers !== undefined && tiers.length > 0);

let labels = $state<string[]>(untrack(() => [...(tiers ?? [])]));
let order = $state<Item[]>(untrack(() => (tiered ? orderByTier(items, tiers?.length ?? 0) : [...items])));
let selectedId = $state<number | null>(null);
let draggingId = $state<number | null>(null);
let ghost = $state<{ x: number; y: number } | null>(null);
let overTrash = $state(false);
let announcement = $state("");
let trash = $state<HTMLDivElement | null>(null);
let board = $state<HTMLDivElement | null>(null);

// つかむ前の押し始め（マウスは少し動かしたら、指は長押ししたらつかむ）
let pending: { id: number; x: number; y: number; type: string } | null = null;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
// ドラッグを終えた直後のクリックは「選ぶ」にしない
let suppressClick = false;

// ドラッグ中に画面の端へ近づいたら、その方向へ画面を送る（指のスクロールは止めているため）
const EDGE_PX = 72;
const MAX_SCROLL_STEP = 14;
let lastPointer: { x: number; y: number } | null = null;
let scrollFrame: number | null = null;

const LONG_PRESS_MS = 250;
const MOUSE_DRAG_THRESHOLD = 4;
const TOUCH_SCROLL_THRESHOLD = 8;

const dragging = $derived(order.find((item) => item.id === draggingId) ?? null);
const selected = $derived(order.find((item) => item.id === selectedId) ?? null);
const tierCount = $derived(labels.length);
const poolCount = $derived(order.filter((item) => item.tier === null).length);
const full = $derived(order.length >= MAX_COLLECTION_ITEMS);

function tierLabel(tier: number | null) {
	return tier === null ? "未分類" : (labels[tier] ?? "未分類");
}

function clearPress() {
	if (pressTimer) clearTimeout(pressTimer);
	pressTimer = null;
	pending = null;
}

function startDrag(id: number, x: number, y: number) {
	draggingId = id;
	selectedId = null;
	ghost = { x, y };
	overTrash = false;
	suppressClick = true;
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
	order = tiered ? orderByTier(next, tierCount) : next;
	onchange(
		order.map((item) => item.id),
		order.map((item) => item.tier),
	);
}

function onPointerDown(event: PointerEvent, id: number) {
	if (event.button !== 0) return;
	suppressClick = false;
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

/** 作品を targetIndex の位置へ動かす。ティア表では tier の段へも移す */
function moveTo(id: number, targetIndex: number, tier?: number | null) {
	const from = order.findIndex((item) => item.id === id);
	const moving = order[from];
	if (!moving) return;
	const nextTier = tier === undefined ? moving.tier : tier;
	if (from === targetIndex && nextTier === moving.tier) return;
	const next = [...order];
	next.splice(from, 1);
	next.splice(targetIndex, 0, { ...moving, tier: nextTier });
	setOrder(next);
}

/** 作品を段の最後へ移す（段の空いたところに落とした・押した、キーボードで段を移った） */
function moveToTierEnd(id: number, tier: number | null) {
	const moving = order.find((item) => item.id === id);
	if (!moving) return;
	// すでにその段の最後にいるときだけ何もしない（同じ段の空きに落としても最後へ動かす）
	const lastInTier = order.findLast((item) => item.tier === tier);
	if (moving.tier === tier && lastInTier?.id === id) return;
	setOrder([...order.filter((item) => item.id !== id), { ...moving, tier }]);
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

function tierOfRow(row: HTMLElement): number | null {
	const value = row.dataset["boardTier"];
	return value === "none" || value === undefined ? null : Number(value);
}

function dragOver(x: number, y: number) {
	if (draggingId === null) return;
	ghost = { x, y };
	overTrash = isOverTrash(x, y);
	if (overTrash) return;
	// 指の下にある作品の位置へ動かす（つかんでいる作品の影は pointer-events: none）
	const under = document.elementFromPoint(x, y);
	const card = under?.closest<HTMLElement>("[data-board-index]");
	if (card) {
		const index = Number(card.dataset["boardIndex"]);
		moveTo(draggingId, index, tiered ? (order[index]?.tier ?? null) : undefined);
		return;
	}
	// ティア表は、段・未分類の空いたところに来たらその最後へ
	const row = tiered ? under?.closest<HTMLElement>("[data-board-tier]") : null;
	if (row) moveToTierEnd(draggingId, tierOfRow(row));
}

function onPointerUp() {
	if (draggingId !== null && overTrash) remove(draggingId);
	clearPress();
	endDrag();
}

function remove(id: number) {
	const item = order.find((entry) => entry.id === id);
	if (selectedId === id) selectedId = null;
	setOrder(order.filter((entry) => entry.id !== id));
	if (item) announcement = `「${item.title}」を外しました`;
}

/** 作品を押した: 選ぶ・選び直す、選んでいる作品があればその位置へ移す */
function onCardClick(event: MouseEvent, index: number) {
	event.stopPropagation();
	if (suppressClick) {
		suppressClick = false;
		return;
	}
	const item = order[index];
	if (!item) return;
	if (selectedId === null || selectedId === item.id) {
		selectedId = selectedId === item.id ? null : item.id;
		return;
	}
	const moving = selected;
	moveTo(selectedId, index, tiered ? item.tier : undefined);
	if (moving)
		announcement = `「${moving.title}」を${tiered ? `${tierLabel(item.tier)}の` : ""}${index + 1}番目に動かしました`;
	selectedId = null;
}

/** 段・未分類の空いたところを押した: 選んでいる作品をその最後へ */
function onRowClick(tier: number | null) {
	if (selectedId === null) return;
	const moving = selected;
	moveToTierEnd(selectedId, tier);
	if (moving) announcement = `「${moving.title}」を${tierLabel(tier)}に移しました`;
	selectedId = null;
}

async function onKeyDown(event: KeyboardEvent, index: number) {
	const item = order[index];
	if (!item) return;
	const { key } = event;
	if (key === "Enter" || key === " ") {
		event.preventDefault();
		selectedId = selectedId === item.id ? null : item.id;
		return;
	}
	if (key === "Delete" || key === "Backspace") {
		event.preventDefault();
		remove(item.id);
		await tick();
		focusIndex(Math.min(index, order.length - 1));
		return;
	}
	const backward = key === "ArrowLeft" || (!tiered && key === "ArrowUp");
	const forward = key === "ArrowRight" || (!tiered && key === "ArrowDown");
	if (backward || forward) {
		event.preventDefault();
		const target = index + (backward ? -1 : 1);
		// ティア表では段の中だけで動かす
		if (target < 0 || target >= order.length || (tiered && order[target]?.tier !== item.tier)) return;
		moveTo(item.id, target);
		announcement = `「${item.title}」を${target + 1}番目に動かしました`;
	} else if (tiered && (key === "ArrowUp" || key === "ArrowDown")) {
		event.preventDefault();
		// 未分類は一番下の段の下として扱う
		const current = item.tier ?? tierCount;
		const next = current + (key === "ArrowUp" ? -1 : 1);
		if (next < 0 || next > tierCount) return;
		const tier = next === tierCount ? null : next;
		moveToTierEnd(item.id, tier);
		announcement = `「${item.title}」を${tierLabel(tier)}に移しました`;
	} else return;
	await tick();
	focusId(item.id);
}

function focusIndex(index: number) {
	board?.querySelector<HTMLElement>(`[data-board-index="${index}"]`)?.focus();
}

function focusId(id: number) {
	board?.querySelector<HTMLElement>(`[data-board-id="${id}"]`)?.focus();
}

// ---- 段の名前・数（ティア表） ----

let editingTier = $state<number | null>(null);
let editingLabel = $state("");
let menuTier = $state<number | null>(null);
let tierError = $state("");

/** 段を変える。origins は新しい各段が元は何番目だったか（足した段は null） */
function applyTiers(nextLabels: string[], origins: (number | null)[]) {
	const oldToNew = new Map<number, number>();
	origins.forEach((origin, index) => {
		if (origin !== null) oldToNew.set(origin, index);
	});
	labels = nextLabels;
	// 消した段の作品は未分類へ（DB の関数も同じ付け替えをする）
	order = orderByTier(
		order.map((item) => ({ ...item, tier: item.tier === null ? null : (oldToNew.get(item.tier) ?? null) })),
		nextLabels.length,
	);
	ontierschange?.(
		nextLabels,
		origins,
		order.map((item) => item.id),
		order.map((item) => item.tier),
	);
}

async function startRename(tier: number) {
	menuTier = null;
	tierError = "";
	editingTier = tier;
	editingLabel = labels[tier] ?? "";
	await tick();
	board?.querySelector<HTMLInputElement>(".board-tier-input")?.select();
}

function commitRename() {
	if (editingTier === null) return;
	const tier = editingTier;
	const label = editingLabel.trim();
	editingTier = null;
	if (!label || label === labels[tier]) return;
	if (label.length > MAX_COLLECTION_TIER_LABEL_LENGTH) {
		tierError = `段の名前は${MAX_COLLECTION_TIER_LABEL_LENGTH}文字以内で入力してください`;
		return;
	}
	tierError = "";
	applyTiers(
		labels.map((current, index) => (index === tier ? label : current)),
		labels.map((_, index) => index),
	);
}

function onRenameKeyDown(event: KeyboardEvent) {
	if (event.key === "Enter") {
		event.preventDefault();
		commitRename();
	} else if (event.key === "Escape") {
		event.preventDefault();
		editingTier = null;
	}
}

/** at の位置に新しい段を入れ、名前を直せる状態にする */
async function insertTier(at: number) {
	menuTier = null;
	if (labels.length >= MAX_COLLECTION_TIERS) return;
	const origins: (number | null)[] = labels.map((_, index) => index);
	origins.splice(at, 0, null);
	const nextLabels = [...labels];
	nextLabels.splice(at, 0, "新しい段");
	applyTiers(nextLabels, origins);
	await startRename(at);
}

function deleteTier(tier: number) {
	menuTier = null;
	if (labels.length <= 1) return;
	const name = labels[tier];
	applyTiers(
		labels.filter((_, index) => index !== tier),
		labels.map((_, index) => index).filter((index) => index !== tier),
	);
	announcement = `段「${name}」を消しました。入っていた作品は未分類へ移しました`;
}

// ---- 作品を足す（ティア表は未分類の検索から、ほかは見出しの検索から addItem を呼ぶ） ----

const addedIds = $derived(new Set(order.map((item) => item.id)));

export function addItem(anime: AnimePick) {
	if (addedIds.has(anime.id) || full) return;
	setOrder([...order, { id: anime.id, title: anime.title, cover_url: anime.cover_url, tier: null }]);
	announcement = tiered ? `「${anime.title}」を未分類に足しました` : `「${anime.title}」を最後に足しました`;
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

function onWindowClick(event: MouseEvent) {
	const target = event.target as Node | null;
	// 選んでいる作品は、編集面の外を押したら選び直しをやめる
	if (selectedId !== null && board && target && !board.contains(target)) selectedId = null;
	if (menuTier !== null && !(target instanceof Element && target.closest(".board-tier-menu-wrap"))) menuTier = null;
}

function onWindowKeyDown(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	selectedId = null;
	menuTier = null;
}
</script>

<svelte:window
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onclick={onWindowClick}
	onkeydown={onWindowKeyDown}
/>

{#snippet card(item: Item, index: number)}
	<li class="board-item">
		<div
			class="board-card"
			class:board-card--dragging={item.id === draggingId}
			class:board-card--selected={item.id === selectedId}
			role="button"
			tabindex="0"
			aria-pressed={item.id === selectedId}
			aria-label={tiered
				? `${tierLabel(item.tier)}「${item.title}」。上下の矢印キーで段を移り、左右で順番を変え、Delete で外します`
				: `${index + 1}番目「${item.title}」。矢印キーで動かし、Delete で外します`}
			data-board-index={index}
			data-board-id={item.id}
			onpointerdown={(event) => onPointerDown(event, item.id)}
			onclick={(event) => onCardClick(event, index)}
			onkeydown={(event) => onKeyDown(event, index)}
			oncontextmenu={(event) => event.preventDefault()}
		>
			{#if showRank}
				<span class="board-rank" class:board-rank--top={index < 3}>{index + 1}</span>
			{/if}
			{#if item.cover_url}
				<img
					src={coverThumbSrc(item.cover_url)}
					{@attach coverThumbFallback(item.cover_url)}
					alt=""
					draggable="false"
				>
			{/if}
			<span class="board-caption" class:board-caption--always={!item.cover_url}>{item.title}</span>
		</div>
		{#if item.id === selectedId}
			<div class="board-card-actions">
				<a
					href="/anime/{item.id}"
					class="board-card-action"
					aria-label="「{item.title}」の作品ページを開く"
					title="作品ページ"
				>
					<span class="i-lucide-external-link" aria-hidden="true"></span>
				</a>
				<button
					type="button"
					class="board-card-action board-card-action--danger"
					aria-label="「{item.title}」を外す"
					title="外す"
					onclick={(event) => {
						event.stopPropagation();
						remove(item.id);
					}}
				>
					<span class="i-lucide-trash-2" aria-hidden="true"></span>
				</button>
			</div>
		{/if}
	</li>
{/snippet}

<div
	bind:this={board}
	class="board"
	class:board--tiered={tiered}
	class:board--dragging={draggingId !== null}
	class:board--selecting={selectedId !== null}
>
	{#if tiered}
		<div class="board-tiers">
			{#each labels as label, tier (tier)}
				<section class="board-tier" aria-label={label}>
					<div class="board-tier-head" style:background-color={collectionTierColor(tier)}>
						{#if editingTier === tier}
							<input
								class="board-tier-input"
								aria-label="段の名前"
								maxlength={MAX_COLLECTION_TIER_LABEL_LENGTH}
								bind:value={editingLabel}
								onblur={commitRename}
								onkeydown={onRenameKeyDown}
							>
						{:else}
							<button
								type="button"
								class="board-tier-label"
								title="名前を変える"
								onclick={() => startRename(tier)}
							>
								{label}
							</button>
						{/if}
						<div class="board-tier-menu-wrap">
							<button
								type="button"
								class="board-tier-menu-button"
								aria-label="段「{label}」のメニュー"
								aria-expanded={menuTier === tier}
								onclick={() => (menuTier = menuTier === tier ? null : tier)}
							>
								<span class="i-lucide-ellipsis" aria-hidden="true"></span>
							</button>
							{#if menuTier === tier}
								<div class="board-tier-menu" role="menu">
									<button type="button" role="menuitem" onclick={() => startRename(tier)}>
										名前を変える
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={labels.length >= MAX_COLLECTION_TIERS}
										onclick={() => insertTier(tier)}
									>
										上に段を足す
									</button>
									<button
										type="button"
										role="menuitem"
										disabled={labels.length >= MAX_COLLECTION_TIERS}
										onclick={() => insertTier(tier + 1)}
									>
										下に段を足す
									</button>
									<button
										type="button"
										role="menuitem"
										class="board-tier-menu-danger"
										disabled={labels.length <= 1}
										onclick={() => deleteTier(tier)}
									>
										この段を消す
									</button>
								</div>
							{/if}
						</div>
					</div>
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
					<ol class="board-tier-items" data-board-tier={tier} onclick={() => onRowClick(tier)}>
						{#each order as item, index (item.id)}
							{#if item.tier === tier}
								{@render card(item, index)}
							{/if}
						{/each}
					</ol>
				</section>
			{/each}
			{#if tierError}
				<p class="field-error-msg" role="alert">{tierError}</p>
			{/if}
		</div>

		<aside class="board-pool" aria-label="未分類">
			<div class="board-pool-head">
				<h2 class="board-pool-title">未分類 <span class="board-pool-count">{poolCount}</span></h2>
			</div>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<ol class="board-pool-items" data-board-tier="none" onclick={() => onRowClick(null)}>
				{#each order as item, index (item.id)}
					{#if item.tier === null}
						{@render card(item, index)}
					{/if}
				{/each}
			</ol>
			<!-- 検索は未分類の下に置き、結果は上に重ねて出す（未分類の枠を伸ばさない） -->
			<CollectionSearch {addedIds} {full} direction="up" label="作品を探して未分類に足す" onpick={addItem} />
		</aside>
	{:else}
		{#if order.length === 0}
			<p class="board-empty">右上の検索から作品を足せます</p>
		{:else}
			<ol class="board-grid" aria-label="作品">
				{#each order as item, index (item.id)}
					{@render card(item, index)}
				{/each}
			</ol>
		{/if}
	{/if}

	<div class="sr-only" aria-live="polite">{announcement}</div>
</div>

<!-- つかんでいる間だけ出すゴミ箱と、指に付いてくる作品の影 -->
{#if dragging}
	<div bind:this={trash} class="board-trash" class:board-trash--over={overTrash} aria-hidden="true">
		<span class="i-lucide-trash-2"></span>
	</div>
	{#if ghost}
		<div class="board-ghost" style:left="{ghost.x}px" style:top="{ghost.y}px" aria-hidden="true">
			{#if dragging.cover_url}
				<img
					src={coverThumbSrc(dragging.cover_url)}
					{@attach coverThumbFallback(dragging.cover_url)}
					alt=""
					draggable="false"
				>
			{:else}
				<span class="board-cover-empty i-lucide-clapperboard"></span>
			{/if}
		</div>
	{/if}
{/if}

<style>
.board {
	padding: 16px;
}
.board--tiered {
	display: grid;
	/* 未分類は 80px の作品が横に3つ並ぶ幅（3 × 80 ＋ 左右の余白 10 × 2 ＋ 枠線 1 × 2） */
	grid-template-columns: minmax(0, 1fr) 262px;
	gap: 12px;
	align-items: start;
}
.board--dragging {
	user-select: none;
	-webkit-user-select: none;
}
.board-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.board-tiers {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}
/* 段の中は、段の名前と作品を隙間なくくっつける（隙間は段と段の間だけ） */
.board-tier {
	display: flex;
	border: 1px solid var(--color-border);
	border-radius: 6px;
}
.board-tier-head {
	position: relative;
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 72px;
	border-radius: 5px 0 0 5px;
	color: #1a1a1a;
}
.board-tier-label {
	width: 100%;
	height: 100%;
	padding: 4px;
	border: none;
	background: transparent;
	color: inherit;
	font-size: 16px;
	font-weight: 800;
	overflow-wrap: anywhere;
	cursor: text;
}
.board-tier-input {
	width: 60px;
	padding: 4px;
	border: 1px solid rgb(0 0 0 / 0.3);
	border-radius: 6px;
	background: rgb(255 255 255 / 0.85);
	color: #1a1a1a;
	font-size: 14px;
	font-weight: 700;
	text-align: center;
}
.board-tier-menu-wrap {
	position: absolute;
	right: 2px;
	bottom: 2px;
}
.board-tier-menu-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	padding: 0;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: rgb(0 0 0 / 0.6);
	font-size: 14px;
	cursor: pointer;
}
.board-tier-menu-button:hover,
.board-tier-menu-button[aria-expanded="true"] {
	background: rgb(0 0 0 / 0.12);
}
.board-tier-menu {
	position: absolute;
	top: calc(100% + 4px);
	left: 0;
	z-index: 20;
	display: flex;
	flex-direction: column;
	min-width: 140px;
	padding: 4px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-bg-card);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
}
.board-tier-menu button {
	padding: 8px 10px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--color-text);
	font-size: 13px;
	text-align: left;
	cursor: pointer;
}
.board-tier-menu button:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.board-tier-menu button:disabled {
	color: var(--color-text-muted);
	cursor: default;
}
.board-tier-menu .board-tier-menu-danger:not(:disabled) {
	color: var(--color-danger);
}
.board-tier-items,
.board-pool-items {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	align-content: flex-start;
	gap: 0;
	min-width: 0;
	margin: 0;
	padding: 0;
	list-style: none;
}
.board-tier-items {
	min-height: calc(80px * 566 / 400);
}
.board--selecting .board-tier-items,
.board--selecting .board-pool-items {
	cursor: pointer;
}
.board-pool {
	position: sticky;
	top: calc(var(--nav-height) + 16px);
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: calc(100vh - var(--nav-height) - 32px);
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-bg-card);
}
.board-pool-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.board-pool-title {
	margin: 0;
	font-size: 14px;
	font-weight: 700;
}
.board-pool-count {
	color: var(--color-text-muted);
	font-weight: 500;
}
/* パソコンでは常に横3つ（スクロールバーが出たら少しだけ縮める） */
.board-pool-items {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	flex-shrink: 1;
	min-height: calc(80px * 566 / 400);
	overflow-y: auto;
}
.board-empty {
	margin: 0;
	padding: 24px 0;
	color: var(--color-text-muted);
	font-size: 13px;
	text-align: center;
}
.board-item {
	position: relative;
}
.board-tier-items .board-item {
	width: 80px;
}
/* 段と未分類の作品は枠も角丸も付けず、隣とくっつける（カバーの無い作品だけ内側の線で区切る） */
.board-tier-items .board-card,
.board-pool-items .board-card {
	border: none;
	border-radius: 0;
	box-shadow: inset 0 0 0 1px var(--color-border);
}
.board-tier-items .board-card:focus-visible,
.board-pool-items .board-card:focus-visible {
	outline-offset: -2px;
}
.board-tier-items .board-card--selected,
.board-pool-items .board-card--selected {
	outline-offset: -3px;
}
.board-card {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg-card);
	cursor: grab;
	touch-action: manipulation;
	-webkit-touch-callout: none;
	-webkit-user-select: none;
	user-select: none;
}
.board-card img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	pointer-events: none;
}
.board-card:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.board-card--dragging {
	opacity: 0.35;
	cursor: grabbing;
}
.board-card--selected {
	outline: 3px solid var(--color-accent);
	outline-offset: 2px;
}
.board-cover-empty {
	color: var(--color-text-muted);
	font-size: 24px;
}
/* 題名はカバーに重ね、指すかフォーカスしたとき・選んだときだけ出す */
.board-caption {
	position: absolute;
	right: 0;
	bottom: 0;
	left: 0;
	display: -webkit-box;
	overflow: hidden;
	padding: 16px 5px 5px;
	background: linear-gradient(transparent, rgb(0 0 0 / 0.85) 40%);
	color: #fff;
	font-size: 11px;
	line-height: 1.35;
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.15s;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	line-clamp: 3;
}
.board-card:hover .board-caption,
.board-card:focus-visible .board-caption,
.board-card--selected .board-caption,
.board-caption--always {
	opacity: 1;
}
.board--dragging .board-caption {
	opacity: 0;
}
/* カバーが無い作品は、題名をカードの真ん中に出す（下に寄せると長い題名が見切れる） */
.board-caption--always {
	top: 50%;
	bottom: auto;
	padding: 0 6px;
	transform: translateY(-50%);
	background: none;
	color: var(--color-text);
	font-weight: 600;
	text-align: center;
	-webkit-line-clamp: 6;
	line-clamp: 6;
}
.board--dragging .board-caption--always {
	opacity: 1;
}
.board-rank {
	position: absolute;
	top: 6px;
	left: 6px;
	z-index: 1;
	min-width: 24px;
	padding: 2px 7px;
	border-radius: 999px;
	background: rgb(0 0 0 / 0.65);
	color: #fff;
	font-size: 13px;
	font-weight: 800;
	text-align: center;
}
.board-rank--top {
	background: var(--color-accent);
	color: var(--color-bg);
}
.board-card-actions {
	position: absolute;
	top: 4px;
	right: 4px;
	z-index: 2;
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.board-card-action {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	padding: 0;
	border: none;
	border-radius: 999px;
	background: rgb(0 0 0 / 0.72);
	color: #fff;
	font-size: 13px;
	text-decoration: none;
	cursor: pointer;
}
.board-card-action--danger:hover {
	background: var(--color-danger);
}
.board-trash {
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
.board-trash--over {
	background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
	transform: translateX(-50%) scale(1.15);
}
.board-ghost {
	position: fixed;
	z-index: 1200;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 80px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 6px;
	background: var(--color-border);
	box-shadow: 0 12px 28px rgb(0 0 0 / 0.36);
	pointer-events: none;
	transform: translate(-50%, -60%) rotate(-4deg);
}
.board-ghost img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
/* スマホ: 未分類は画面の下に貼り付け、ゴミ箱は下のナビ（高さ 56px）と未分類の上に出す */
@media (max-width: 960px) {
	.board {
		padding: 12px 0;
	}
	.board--tiered {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.board-tiers {
		width: 100%;
	}
	.board-tier-head {
		width: 56px;
	}
	.board-tier-items .board-item,
	.board-pool-items .board-item {
		width: 64px;
	}
	.board-tier-items {
		min-height: calc(64px * 566 / 400);
	}
	.board-pool {
		position: sticky;
		top: auto;
		bottom: calc(56px + env(safe-area-inset-bottom));
		z-index: 5;
		width: 100%;
		max-height: 40vh;
		box-shadow: 0 -8px 24px rgb(0 0 0 / 0.2);
	}
	.board-pool-items {
		display: flex;
		min-height: calc(64px * 566 / 400);
	}
	.board-trash {
		bottom: calc(56px + 16px + env(safe-area-inset-bottom));
	}
	.board-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
}
</style>
