<script lang="ts">
import { untrack } from "svelte";
import { beforeNavigate, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import { collectionKindPrefix, collectionTierColor, orderByTier } from "$lib/collections";
import CollectionBoard from "$lib/components/CollectionBoard.svelte";
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const collection = $derived(data.collection);
const ownerName = $derived(collection.owner.display_name || collection.owner.username);
const updatedLabel = $derived(
	new Date(collection.updated_at).toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "Asia/Tokyo",
	}),
);

// 持ち主だけの道具: 題名などを直す（歯車）。作品は編集面の検索から足す
let editingInfo = $state(false);

/** 保存先。操作した時点のコレクションに固定する（保存待ちのまま別のコレクションへ移っても、そちらへ送らない） */
type SaveTarget = { id: string; tiered: boolean };

function saveTarget(): SaveTarget {
	return { id: collection.id, tiered: collection.kind === "tier" };
}

async function putJson(collectionId: string, path: string, body: unknown, fallback: string, keepalive = false) {
	const response = await fetch(`/api/collections/${collectionId}/${path}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		keepalive,
	});
	const res = (await response.json().catch(() => ({}))) as { message?: string };
	if (!response.ok) throw new Error(res.message ?? fallback);
}

/** 並びを丸ごと保存する（段を送らないときは、DB が今の段を引き継ぐ。192） */
function putItems(to: SaveTarget, animeIds: number[], tiers: (number | null)[], keepalive = false) {
	return putJson(
		to.id,
		"items",
		to.tiered ? { animeIds, tiers } : { animeIds },
		"コレクションの保存に失敗しました",
		keepalive,
	);
}

const isTier = $derived(collection.kind === "tier");
const reorderItems = $derived(
	collection.items.map((anime, index) => ({
		id: Number(anime.id),
		title: anime.title,
		cover_url: anime.cover_url,
		tier: collection.item_tiers[index] ?? null,
	})),
);
/** ティア表の表示: 段ごと（上から、最後が未分類）に、段の中は並び順のまま */
const tierRows = $derived.by(() => {
	if (!isTier) return [];
	const entries = orderByTier(
		collection.items.map((anime, index) => ({ anime, tier: collection.item_tiers[index] ?? null })),
		collection.tiers.length,
	);
	return [
		...collection.tiers.map((label, tier) => ({
			key: String(tier),
			label,
			color: collectionTierColor(tier) as string | null,
			animes: entries.filter((entry) => entry.tier === tier).map((entry) => entry.anime),
		})),
		{
			key: "none",
			label: "未分類",
			color: null,
			animes: entries.filter((entry) => entry.tier === null).map((entry) => entry.anime),
		},
	].filter((row) => row.key !== "none" || row.animes.length > 0);
});

// ---- 編集面（持ち主）: 動かすたびに自動で保存する ----

// 作り直すとき（＋で足した・元に戻した・保存に失敗した・種類や段をモーダルで変えた）に増やす
let boardVersion = $state(0);
// 編集面は、開いたときの並び・段から自分で持つ。段をその場で変えても作り直さない（付け替えた段が古い data で戻らないように）
const boardKey = $derived(`${collection.id}:${collection.kind}:${boardVersion}`);
type Snapshot = { ids: number[]; tiers: (number | null)[] };
// 最後に知らされた並び（保存待ちを含む）と、元に戻す先
let latest: Snapshot | null = null;
let undoTo = $state<Snapshot | null>(null);
// 続けて動かしている間（少し手を止めるまで）は、ひとまとまりの操作として元に戻す
let undoGroupTimer: ReturnType<typeof setTimeout> | null = null;
let itemsTimer: ReturnType<typeof setTimeout> | null = null;
let queued: (Snapshot & { to: SaveTarget }) | null = null;
let saveChain: Promise<void> = Promise.resolve();
let saving = $state(0);
let saveError = $state("");
// 保存して作り直すまで（元に戻す・＋で足す・設定のモーダルを開く/閉じる）は、編集面を触れなくする。
// その間に動かした分が、古い data での作り直しで消えて、表示と保存が食い違わないように
let boardBusy = $state(false);

async function whileBoardBusy(task: () => Promise<void>) {
	boardBusy = true;
	try {
		await task();
	} finally {
		boardBusy = false;
	}
}

function currentSnapshot(): Snapshot {
	return latest ?? { ids: reorderItems.map((item) => item.id), tiers: reorderItems.map((item) => item.tier) };
}

async function resetBoard() {
	latest = null;
	// 作り直す前の段番号で戻さないように、元に戻す先も捨てる（モーダルで段を変えたときなど）
	undoTo = null;
	await invalidateAll();
	boardVersion += 1;
}

// 保存に失敗したら増やす。失敗より前に積んだ保存は、失敗した状態を前提にしているので送らない
let saveGeneration = 0;

function enqueue(task: () => Promise<void>) {
	const generation = saveGeneration;
	saving += 1;
	saveChain = saveChain
		.then(() => (generation === saveGeneration ? task() : undefined))
		// 続けて動かしていなければ、件数や更新日を読み直す（編集面は作り直さない）
		.then(() => (queued || itemsTimer ? undefined : invalidateAll()))
		.catch(async (taskError: unknown) => {
			saveGeneration += 1;
			saveError = `${taskError instanceof Error ? taskError.message : "保存に失敗しました"}。保存できている状態に戻しました`;
			undoTo = null;
			queued = null;
			if (itemsTimer) clearTimeout(itemsTimer);
			itemsTimer = null;
			await whileBoardBusy(resetBoard);
		})
		.finally(() => {
			saving -= 1;
		});
	return saveChain;
}

/** 待っている並びの保存をすぐ送る */
function flushItems(keepalive = false) {
	if (itemsTimer) clearTimeout(itemsTimer);
	itemsTimer = null;
	const next = queued;
	queued = null;
	if (!next) return saveChain;
	return enqueue(() => putItems(next.to, next.ids, next.tiers, keepalive));
}

function onBoardChange(ids: number[], tiers: (number | null)[]) {
	const previous = currentSnapshot();
	latest = { ids, tiers };
	queued = { ...latest, to: saveTarget() };
	saveError = "";
	// 元に戻す先は、一続きの操作の前の並び（矢印キーで続けて動かしたときなど）
	if (!undoGroupTimer) undoTo = previous;
	else clearTimeout(undoGroupTimer);
	undoGroupTimer = setTimeout(() => (undoGroupTimer = null), 1500);
	if (itemsTimer) clearTimeout(itemsTimer);
	itemsTimer = setTimeout(() => void flushItems(), 500);
}

function onTiersChange(tiers: string[], origins: (number | null)[], animeIds: number[], animeTiers: (number | null)[]) {
	saveError = "";
	// 段の番号が変わるので、元に戻すのはやめる（作品の段は DB の関数が一緒に付け替える）
	undoTo = null;
	const to = saveTarget();
	void flushItems();
	void enqueue(() => putJson(to.id, "tiers", { tiers, origins }, "段の保存に失敗しました"));
	// 付け替えたあとの並びを、次の操作の元に戻す先にする（古い data の段番号へ戻さない）
	latest = { ids: animeIds, tiers: animeTiers };
}

async function undo() {
	const target = undoTo;
	if (!target) return;
	const to = saveTarget();
	undoTo = null;
	if (undoGroupTimer) clearTimeout(undoGroupTimer);
	undoGroupTimer = null;
	queued = null;
	if (itemsTimer) clearTimeout(itemsTimer);
	itemsTimer = null;
	await whileBoardBusy(async () => {
		await enqueue(() => putItems(to, target.ids, target.tiers));
		await resetBoard();
	});
}

// ページを離れる前に、待っている保存を送る
beforeNavigate(() => {
	void flushItems(true);
});

/** タブを閉じるときは、先の保存を待たずに最後の並びをすぐ送る（待つと送る前にページが終わる） */
function sendQueuedNow() {
	if (itemsTimer) clearTimeout(itemsTimer);
	itemsTimer = null;
	const next = queued;
	queued = null;
	if (next) void putItems(next.to, next.ids, next.tiers, true).catch(() => {});
}

// 別のコレクションへ移ったら、編集の状態を持ち越さない（待っていた保存は beforeNavigate で元の保存先へ送り済み）
let editingFor = untrack(() => collection.id);
$effect.pre(() => {
	const id = collection.id;
	if (id === editingFor) return;
	editingFor = id;
	latest = null;
	undoTo = null;
	saveError = "";
	if (undoGroupTimer) clearTimeout(undoGroupTimer);
	undoGroupTimer = null;
});

/** 歯車: 段の保存と読み直しが終わってから開く（モーダルは開いたときの段を使うので、古い段で上書きしないように） */
function openEdit() {
	return whileBoardBusy(async () => {
		await flushItems();
		await saveChain;
		await invalidateAll();
		editingInfo = true;
	});
}

$effect(() => {
	const onPageHide = sendQueuedNow;
	window.addEventListener("pagehide", onPageHide);
	return () => {
		window.removeEventListener("pagehide", onPageHide);
		if (undoGroupTimer) clearTimeout(undoGroupTimer);
	};
});

// 「リンクをコピー」は今は動いていないので隠しておく（直したら true に戻す）
const SHOW_COPY_LINK = false;
let copied = $state(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyLink() {
	try {
		await navigator.clipboard.writeText(page.url.href);
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 2000);
	} catch {
		window.prompt("このリンクをコピーしてください", page.url.href);
	}
}
</script>

{#snippet animeCard(anime: (typeof collection.items)[number], rank: number | null, eager: boolean)}
	<a href="/anime/{anime.id}" class="collection-card">
		<span class="collection-card-cover" class:collection-card-cover--empty={!anime.cover_url}>
			{#if rank !== null}
				<span class="collection-card-rank" class:collection-card-rank--top={rank <= 3} aria-label="{rank}位"
					>{rank}</span
				>
			{/if}
			{#if anime.cover_url}
				<img
					src={coverThumbSrc(anime.cover_url)}
					{@attach coverThumbFallback(anime.cover_url)}
					alt=""
					loading={eager ? 'eager' : 'lazy'}
				>
			{/if}
			<!-- 題名はカバーに重ね、指すかフォーカスしたときだけ出す（カバーが無い作品は真ん中に常に出す） -->
			<span class="collection-card-caption">{anime.title}</span>
		</span>
	</a>
{/snippet}

<svelte:head>
	<title>{collection.title}（{ownerName}のコレクション） - Anipolis</title>
	<meta property="og:title" content="{collection.title}（{ownerName}のコレクション）">
	<meta
		property="og:description"
		content={collection.description ?? `${ownerName}さんのコレクション・${collection.items.length}作品`}
	>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if collection.items[0]?.cover_url}
		<meta property="og:image" content={collection.items[0].cover_url}>
	{/if}
	{#if !collection.is_public}
		<meta name="robots" content="noindex">
	{/if}
</svelte:head>

<div class="page-container">
	<main class="feed-column feed-column--wide collection-page">
		<header class="collection-header">
			{#if data.isOwn}
				<a href="/collections" class="collection-back">
					<span class="i-lucide-arrow-left" aria-hidden="true"></span>
					コレクション一覧
				</a>
			{/if}
			<a href={data.isOwn ? '/collections' : `/profile/${collection.owner.username}`} class="collection-owner">
				<UserAvatar src={collection.owner.avatar_url} username={ownerName} size="xs" />
				<span>{ownerName}のコレクション</span>
			</a>
			<div class="collection-title-row">
				<h1 class="collection-title">
					{collection.title}
					{#if !collection.is_public}
						<span class="collection-private-badge">
							<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>
							非公開
						</span>
					{/if}
				</h1>
				{#if data.isOwn}
					<div class="collection-tools">
						<span class="collection-save-state" aria-live="polite">{saving > 0 ? '保存中...' : ''}</span>
						<!-- 動かしたあとだけ出す。直前の操作（続けて動かした分はまとめて）を取り消す -->
						{#if undoTo}
							<button
								type="button"
								class="collection-tool"
								aria-label="元に戻す"
								title="元に戻す"
								onclick={undo}
							>
								<span class="i-lucide-undo-2" aria-hidden="true"></span>
							</button>
						{/if}
						<button
							type="button"
							class="collection-tool"
							aria-label="コレクションの設定"
							title="設定"
							onclick={openEdit}
						>
							<span class="i-lucide-settings" aria-hidden="true"></span>
						</button>
					</div>
				{/if}
			</div>
			{#if saveError}
				<p class="field-error-msg" role="alert">{saveError}</p>
			{/if}
			{#if collection.description}
				<p class="collection-description">{collection.description}</p>
			{/if}
			<p class="collection-meta">
				{collectionKindPrefix(collection.kind)}{collection.items.length}作品・{updatedLabel}更新
			</p>

			{#if SHOW_COPY_LINK && collection.is_public}
				<div class="collection-actions">
					<button type="button" class="btn btn-secondary collection-action" onclick={copyLink}>
						<span class={copied ? 'i-lucide-check' : 'i-lucide-link'} aria-hidden="true"></span>
						{copied ? 'コピーしました' : 'リンクをコピー'}
					</button>
				</div>
			{/if}
		</header>

		{#if data.isOwn}
			<div class="collection-board-wrap" class:collection-board-wrap--busy={boardBusy} inert={boardBusy}>
				{#key boardKey}
					<CollectionBoard
						items={reorderItems}
						tiers={isTier ? collection.tiers : undefined}
						showRank={collection.kind === 'ranking'}
						onchange={onBoardChange}
						ontierschange={onTiersChange}
					/>
				{/key}
			</div>
		{:else if collection.items.length === 0}
			<div class="empty-state">
				<p>まだ作品がありません</p>
			</div>
		{:else if isTier}
			<div class="collection-tiers">
				{#each tierRows as row (row.key)}
					<section class="collection-tier" aria-label={row.label}>
						<h2
							class="collection-tier-label"
							class:collection-tier-label--colored={row.color !== null}
							style:background-color={row.color}
						>
							{row.label}
						</h2>
						{#if row.animes.length > 0}
							<ol class="collection-tier-items">
								{#each row.animes as anime (anime.id)}
									<li>{@render animeCard(anime, null, true)}</li>
								{/each}
							</ol>
						{:else}
							<p class="collection-tier-empty">なし</p>
						{/if}
					</section>
				{/each}
			</div>
		{:else}
			<ol class="collection-grid">
				{#each collection.items as anime, index (anime.id)}
					<li>{@render animeCard(anime, collection.kind === 'ranking' ? index + 1 : null, index < 8)}</li>
				{/each}
			</ol>
		{/if}
	</main>
</div>

{#if editingInfo}
	<CollectionFormModal
		mode="edit"
		action="?/updateCollection"
		deleteAction="?/deleteCollection"
		initial={{
			title: collection.title,
			description: collection.description,
			is_public: collection.is_public,
			kind: collection.kind,
			tiers: collection.tiers,
		}}
		onclose={async () => {
			editingInfo = false;
			// 種類や段をモーダルで変えたかもしれないので、待っている保存を送ってから編集面を作り直す
			await whileBoardBusy(async () => {
				await flushItems();
				await resetBoard();
			});
		}}
	/>
{/if}

<style>
.collection-board-wrap--busy {
	opacity: 0.6;
	transition: opacity 0.15s;
}
.collection-save-state {
	color: var(--color-text-muted);
	font-size: 12px;
}
.collection-title-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}
.collection-tools {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
}
.collection-tool {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font-size: 18px;
}
.collection-tool:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.collection-tool:disabled {
	cursor: not-allowed;
	opacity: 0.4;
}
.collection-page {
	padding-bottom: 32px;
}
.collection-header {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 20px 16px 16px;
	border-bottom: 1px solid var(--color-border);
}
.collection-back {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	gap: 4px;
	margin-bottom: 4px;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}
.collection-back:hover {
	color: var(--color-text);
}
.collection-owner {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	align-self: flex-start;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}
.collection-owner:hover {
	color: var(--color-text);
}
.collection-title {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin: 0;
	font-size: 22px;
	font-weight: 800;
	line-height: 1.35;
	overflow-wrap: anywhere;
}
.collection-private-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border: 1px solid var(--color-border-hover);
	border-radius: 999px;
	corner-shape: round;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 600;
}
.collection-description {
	margin: 0;
	font-size: 14px;
	line-height: 1.7;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.collection-meta {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 13px;
}
.collection-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 4px;
}
.collection-action {
	font-size: 13px;
}
.collection-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 16px;
	list-style: none;
}
@media (max-width: 480px) {
	.collection-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
}
.collection-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	color: var(--color-text);
	text-decoration: none;
}
.collection-card-cover {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg-card);
	transition: opacity 0.15s;
}
.collection-card-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
/* カバーに重ねる題名。カバーが無い作品は常に出す */
.collection-card-caption {
	position: absolute;
	right: 0;
	bottom: 0;
	left: 0;
	display: -webkit-box;
	overflow: hidden;
	padding: 20px 6px 6px;
	background: linear-gradient(transparent, rgb(0 0 0 / 0.85) 40%);
	color: #fff;
	font-size: 12px;
	line-height: 1.4;
	opacity: 0;
	transition: opacity 0.15s;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	line-clamp: 3;
}
.collection-card:hover .collection-card-caption,
.collection-card:focus-visible .collection-card-caption,
.collection-card-cover--empty .collection-card-caption {
	opacity: 1;
}
/* カバーが無い作品は、題名をカードの真ん中に出す（下に寄せると長い題名が見切れる） */
.collection-card-cover--empty .collection-card-caption {
	top: 50%;
	bottom: auto;
	padding: 0 8px;
	transform: translateY(-50%);
	background: none;
	color: var(--color-text);
	font-weight: 600;
	text-align: center;
	-webkit-line-clamp: 6;
	line-clamp: 6;
}
.collection-card:focus-visible {
	outline: none;
}
.collection-card:focus-visible .collection-card-cover {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.collection-card-rank {
	position: absolute;
	top: 6px;
	left: 6px;
	min-width: 24px;
	padding: 2px 7px;
	border-radius: 999px;
	background: rgb(0 0 0 / 0.65);
	color: #fff;
	font-size: 13px;
	font-weight: 800;
	text-align: center;
}
.collection-card-rank--top {
	background: var(--color-accent);
	color: var(--color-bg);
}
.collection-tiers {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 16px;
}
/* 段の中は、段の名前と作品を隙間なくくっつける（隙間は段と段の間だけ） */
.collection-tier {
	display: flex;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 6px;
}
.collection-tier-label {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 64px;
	margin: 0;
	padding: 4px;
	background: var(--color-surface-hover);
	font-size: 16px;
	font-weight: 800;
	overflow-wrap: anywhere;
	text-align: center;
}
.collection-tier-items {
	display: grid;
	flex: 1;
	grid-template-columns: repeat(auto-fill, 80px);
	gap: 0;
	margin: 0;
	padding: 0;
	list-style: none;
}
.collection-tier-items .collection-card-cover {
	border: none;
	border-radius: 0;
	box-shadow: inset 0 0 0 1px var(--color-border);
}
.collection-tier-items .collection-card:focus-visible .collection-card-cover {
	outline-offset: -2px;
}
.collection-tier-label--colored {
	color: #1a1a1a;
}
.collection-tier-empty {
	display: flex;
	align-items: center;
	margin: 0;
	padding: 12px;
	color: var(--color-text-muted);
	font-size: 13px;
}
</style>
