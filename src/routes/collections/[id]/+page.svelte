<script lang="ts">
import { beforeNavigate, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import { toAnimePick } from "$lib/anime-picker";
import { collectionKindPrefix, collectionTierColor, MAX_COLLECTION_ITEMS, orderByTier } from "$lib/collections";
import AnimePickerModal from "$lib/components/AnimePickerModal.svelte";
import CollectionBoard from "$lib/components/CollectionBoard.svelte";
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
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

// 持ち主だけの道具: 作品を足す（＋。ティア表は未分類の検索から足す）・題名などを直す（鉛筆）
let adding = $state(false);
let editingInfo = $state(false);

async function putJson(path: string, body: unknown, fallback: string, keepalive = false) {
	const response = await fetch(`/api/collections/${collection.id}/${path}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		keepalive,
	});
	const res = (await response.json().catch(() => ({}))) as { message?: string };
	if (!response.ok) throw new Error(res.message ?? fallback);
}

/** 並びを丸ごと保存する（段を送らないときは、DB が今の段を引き継ぐ。192） */
function putItems(animeIds: number[], tiers?: (number | null)[], keepalive = false) {
	return putJson("items", tiers ? { animeIds, tiers } : { animeIds }, "コレクションの保存に失敗しました", keepalive);
}

/** ＋から足したとき。編集面を新しい並びで作り直す */
async function saveItems(animeIds: number[]) {
	await flushItems();
	await putItems(animeIds);
	latest = null;
	await invalidateAll();
	boardVersion += 1;
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
const boardKey = $derived(`${collection.kind}:${boardVersion}`);
type Snapshot = { ids: number[]; tiers: (number | null)[] };
// 最後に知らされた並び（保存待ちを含む）と、元に戻す先
let latest: Snapshot | null = null;
let undoTo = $state<Snapshot | null>(null);
let undoTimer: ReturnType<typeof setTimeout> | null = null;
let itemsTimer: ReturnType<typeof setTimeout> | null = null;
let queued: Snapshot | null = null;
let saveChain: Promise<void> = Promise.resolve();
let saving = $state(0);
let saveError = $state("");

function currentSnapshot(): Snapshot {
	return latest ?? { ids: reorderItems.map((item) => item.id), tiers: reorderItems.map((item) => item.tier) };
}

async function resetBoard() {
	latest = null;
	await invalidateAll();
	boardVersion += 1;
}

function enqueue(task: () => Promise<void>) {
	saving += 1;
	saveChain = saveChain
		.then(task)
		// 続けて動かしていなければ、件数や更新日を読み直す（編集面は作り直さない）
		.then(() => (queued || itemsTimer ? undefined : invalidateAll()))
		.catch(async (taskError: unknown) => {
			saveError = `${taskError instanceof Error ? taskError.message : "保存に失敗しました"}。保存できている状態に戻しました`;
			undoTo = null;
			queued = null;
			if (itemsTimer) clearTimeout(itemsTimer);
			itemsTimer = null;
			await resetBoard();
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
	return enqueue(() => putItems(next.ids, isTier ? next.tiers : undefined, keepalive));
}

function onBoardChange(ids: number[], tiers: (number | null)[]) {
	const previous = currentSnapshot();
	latest = { ids, tiers };
	queued = latest;
	saveError = "";
	// 元に戻す先は、一続きの操作の前の並び（矢印キーで続けて動かしたときなど）
	if (!undoTo) undoTo = previous;
	if (undoTimer) clearTimeout(undoTimer);
	undoTimer = setTimeout(() => (undoTo = null), 6000);
	if (itemsTimer) clearTimeout(itemsTimer);
	itemsTimer = setTimeout(() => void flushItems(), 500);
}

function onTiersChange(tiers: string[], origins: (number | null)[]) {
	saveError = "";
	// 段の番号が変わるので、元に戻すのはやめる（作品の段は DB の関数が一緒に付け替える）
	undoTo = null;
	void flushItems();
	void enqueue(() => putJson("tiers", { tiers, origins }, "段の保存に失敗しました"));
	// 編集面の並びも同じ付け替えをしているので、次の保存の元に戻す先は保存し直したものから取る
	latest = null;
}

async function undo() {
	const target = undoTo;
	if (!target) return;
	undoTo = null;
	if (undoTimer) clearTimeout(undoTimer);
	queued = null;
	if (itemsTimer) clearTimeout(itemsTimer);
	itemsTimer = null;
	await enqueue(() => putItems(target.ids, isTier ? target.tiers : undefined));
	await resetBoard();
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
	if (next) void putItems(next.ids, isTier ? next.tiers : undefined, true).catch(() => {});
}

$effect(() => {
	const onPageHide = sendQueuedNow;
	window.addEventListener("pagehide", onPageHide);
	return () => {
		window.removeEventListener("pagehide", onPageHide);
		if (undoTimer) clearTimeout(undoTimer);
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
				<img src={anime.cover_url} alt="" loading={eager ? 'eager' : 'lazy'}>
			{:else}
				<span class="collection-card-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
			{/if}
			<!-- 題名はカバーに重ね、指すかフォーカスしたときだけ出す -->
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
						{#if !isTier}
							<button
								type="button"
								class="collection-tool"
								aria-label="作品を追加"
								title="作品を追加"
								disabled={collection.items.length >= MAX_COLLECTION_ITEMS}
								onclick={() => (adding = true)}
							>
								<span class="i-lucide-plus" aria-hidden="true"></span>
							</button>
						{/if}
						<button
							type="button"
							class="collection-tool"
							aria-label="題名・説明・公開を編集"
							title="編集"
							onclick={() => (editingInfo = true)}
						>
							<span class="i-lucide-pencil" aria-hidden="true"></span>
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

		{#if data.isOwn && (isTier || collection.items.length > 0)}
			{#key boardKey}
				<CollectionBoard
					items={reorderItems}
					tiers={isTier ? collection.tiers : undefined}
					showRank={collection.kind === 'ranking'}
					onchange={onBoardChange}
					ontierschange={onTiersChange}
				/>
			{/key}
		{:else if collection.items.length === 0}
			<div class="empty-state">
				<p>
					{data.isOwn
						? 'まだ作品がありません。＋から追加できます'
						: 'まだ作品がありません'}
				</p>
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

{#if adding}
	<AnimePickerModal
		title="作品を追加"
		max={MAX_COLLECTION_ITEMS}
		initial={collection.items.map(toAnimePick)}
		addOnly
		onsave={saveItems}
		onclose={() => {
			adding = false;
		}}
	/>
{/if}

{#if undoTo}
	<div class="collection-undo" role="status">
		<span>保存しました</span>
		<button type="button" class="collection-undo-button" onclick={undo}>元に戻す</button>
	</div>
{/if}

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
			await flushItems();
			await resetBoard();
		}}
	/>
{/if}

<style>
.collection-save-state {
	color: var(--color-text-muted);
	font-size: 12px;
}
.collection-undo {
	position: fixed;
	bottom: 24px;
	left: 50%;
	z-index: 1000;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 12px 10px 16px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	background: var(--color-bg-card);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
	font-size: 13px;
	transform: translateX(-50%);
}
.collection-undo-button {
	padding: 4px 10px;
	border: none;
	border-radius: 999px;
	background: transparent;
	color: var(--color-accent);
	font-size: 13px;
	font-weight: 700;
	cursor: pointer;
}
.collection-undo-button:hover {
	background: var(--color-surface-hover);
}
@media (max-width: 960px) {
	.collection-undo {
		bottom: calc(56px + 16px + env(safe-area-inset-bottom));
	}
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
.collection-card-cover-empty {
	width: 24px;
	height: 24px;
	color: var(--color-text-muted);
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
.collection-tier {
	display: flex;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 10px;
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
	grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
	gap: 10px 8px;
	margin: 0;
	padding: 8px;
	list-style: none;
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
