<script lang="ts">
import { onMount, tick } from "svelte";
import { trapFocus } from "$lib/actions/trapFocus";
import { type CollectionMembership, MAX_COLLECTION_TITLE_LENGTH } from "$lib/collections";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";

/**
 * 作品ページの「コレクションに追加」（#515）。自分のコレクションを並べ、押した時点で出し入れを保存する。
 * 見出しは置かず、コレクションの並びと「新しいコレクション」だけにする（YouTube の保存先と同じ形）。
 * 新しいコレクションは題名だけで作る。公開設定と説明はコレクションのページで決める
 */
interface Props {
	animeId: number;
	animeTitle: string;
	onclose: () => void;
}

let { animeId, animeTitle, onclose }: Props = $props();

let collections = $state<CollectionMembership[] | null>(null);
let limit = $state(20);
let loadError = $state("");
let savingId = $state<string | null>(null);
let rowError = $state<{ id: string; message: string } | null>(null);

let createOpen = $state(false);
let newTitle = $state("");
let creating = $state(false);
let createError = $state("");
let newButton = $state<HTMLButtonElement | null>(null);

const busy = $derived(savingId !== null || creating);
const atLimit = $derived(collections !== null && collections.length >= limit);

async function errorMessage(response: Response, fallback: string): Promise<string> {
	const body = (await response.json().catch(() => null)) as { message?: string } | null;
	return body?.message ?? fallback;
}

onMount(async () => {
	try {
		const response = await fetch(`/api/collections?anime=${animeId}`);
		if (!response.ok) {
			loadError = await errorMessage(response, "コレクションを読み込めませんでした");
			return;
		}
		const body = (await response.json()) as { collections: CollectionMembership[]; limit: number };
		collections = body.collections;
		limit = body.limit;
	} catch {
		loadError = "コレクションを読み込めませんでした";
	}
});

async function toggle(collection: CollectionMembership) {
	if (busy) return;
	savingId = collection.id;
	rowError = null;
	const adding = !collection.has_anime;
	try {
		const response = await fetch(`/api/collections/${collection.id}/items/${animeId}`, {
			method: adding ? "POST" : "DELETE",
		});
		if (!response.ok) {
			rowError = { id: collection.id, message: await errorMessage(response, "保存に失敗しました") };
			return;
		}
		const body = (await response.json()) as { itemCount: number; cover: string | null };
		collections = (collections ?? []).map((item) =>
			item.id === collection.id
				? { ...item, has_anime: adding, item_count: body.itemCount, cover: body.cover }
				: item,
		);
	} catch {
		rowError = { id: collection.id, message: "保存に失敗しました" };
	} finally {
		savingId = null;
	}
}

function openCreate() {
	createOpen = true;
	createError = "";
}

async function closeCreate() {
	if (creating) return;
	createOpen = false;
	newTitle = "";
	createError = "";
	await tick();
	newButton?.focus();
}

async function create(event: SubmitEvent) {
	event.preventDefault();
	if (busy || !newTitle.trim()) return;
	creating = true;
	createError = "";
	const form = new FormData();
	form.set("anime_id", String(animeId));
	form.set("title", newTitle);
	// 公開設定はここでは聞かない。コレクションのページの作成と同じく公開で作る
	form.set("is_public", "on");
	try {
		const response = await fetch("/api/collections", { method: "POST", body: form });
		if (!response.ok) {
			createError = await errorMessage(response, "コレクションの作成に失敗しました");
			return;
		}
		const body = (await response.json()) as { collection: CollectionMembership; message?: string };
		collections = [body.collection, ...(collections ?? [])];
		creating = false;
		await closeCreate();
		if (body.message) createError = body.message;
	} catch {
		createError = "コレクションの作成に失敗しました";
	} finally {
		creating = false;
	}
}

function close() {
	if (!busy) onclose();
}
</script>

<!-- フォーカスがモーダルの外に出ていても Esc で閉じられるようにする -->
<svelte:window
	onkeydown={(event) => {
		if (event.key === "Escape") close();
	}}
/>

<div class="add-collection-overlay" role="presentation" onclick={close}>
	<div
		use:trapFocus
		class="add-collection-card"
		role="dialog"
		aria-modal="true"
		aria-label="「{animeTitle}」をコレクションに追加"
		tabindex="-1"
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => {
			event.stopPropagation();
			if (event.key !== "Escape") return;
			// 題名の入力中は、入力をやめるだけにする
			if (createOpen) void closeCreate();
			else close();
		}}
	>
		{#if loadError}
			<p class="add-collection-message" role="alert">{loadError}</p>
		{:else if collections === null}
			<p class="add-collection-message">読み込み中…</p>
		{:else}
			{#if collections.length > 0}
				<ul class="add-collection-list">
					{#each collections as collection (collection.id)}
						<li>
							<!-- 保存が終わるまでは今の状態のまま出す。保存中も押せないようにはしない（フォーカスが外れて Esc が効かなくなる） -->
							<button
								type="button"
								class="add-collection-row"
								aria-pressed={collection.has_anime}
								aria-busy={savingId === collection.id}
								onclick={() => void toggle(collection)}
							>
								<span class="add-collection-thumb" aria-hidden="true">
									{#if collection.cover}
										<img
											src={coverThumbSrc(collection.cover)}
											{@attach coverThumbFallback(collection.cover)}
											alt=""
											loading="lazy"
										>
									{:else}
										<span class="i-lucide-library-big"></span>
									{/if}
								</span>
								<span class="add-collection-row-body">
									<span class="add-collection-row-title">{collection.title}</span>
									<span class="add-collection-row-meta">
										{#if savingId === collection.id}
											保存中…
										{:else}
											{collection.item_count}作品
											{#if !collection.is_public}
												<span class="add-collection-private">
													·
													<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>非公開
												</span>
											{/if}
										{/if}
									</span>
								</span>
								<span
									class={[
										'add-collection-mark',
										collection.has_anime ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark',
									]}
									aria-hidden="true"
								></span>
							</button>
							{#if rowError?.id === collection.id}
								<p class="add-collection-error" role="alert">{rowError.message}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			<div class="add-collection-footer" class:add-collection-footer--alone={collections.length === 0}>
				{#if atLimit}
					<p class="add-collection-message">コレクションは{limit}個まで作れます</p>
				{:else if createOpen}
					<form class="add-collection-create" onsubmit={create}>
						<input
							type="text"
							class="field-input"
							placeholder="新しいコレクションの題名"
							aria-label="新しいコレクションの題名"
							maxlength={MAX_COLLECTION_TITLE_LENGTH}
							autocomplete="off"
							readonly={creating}
							bind:value={newTitle}
							{@attach (input) => input.focus()}
						>
						<button type="submit" class="btn btn-primary" disabled={busy || !newTitle.trim()}>
							{creating ? '作成中…' : '作成'}
						</button>
					</form>
				{:else}
					<button
						type="button"
						class="add-collection-new"
						bind:this={newButton}
						disabled={busy}
						onclick={openCreate}
					>
						<span class="i-lucide-plus" aria-hidden="true"></span>
						新しいコレクション
					</button>
				{/if}
				{#if createError}
					<p class="add-collection-error" role="alert">{createError}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
.add-collection-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(15 23 42 / 0.68);
}
.add-collection-card {
	display: flex;
	flex-direction: column;
	width: min(100%, 360px);
	max-height: calc(100dvh - 32px);
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.36);
	outline: none;
}
.add-collection-list {
	display: flex;
	flex-direction: column;
	min-height: 0;
	margin: 0;
	padding: 8px 0;
	overflow-y: auto;
	list-style: none;
}
.add-collection-row {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 8px 16px;
	border: 0;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font: inherit;
	text-align: left;
}
.add-collection-row:hover {
	background: var(--color-surface-hover);
}
.add-collection-row:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: -2px;
}
.add-collection-row[aria-busy="true"] {
	cursor: wait;
}
.add-collection-thumb {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 36px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 4px;
	background: var(--color-bg-card);
	color: var(--color-text-muted);
}
.add-collection-thumb img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.add-collection-thumb span {
	width: 18px;
	height: 18px;
}
.add-collection-row-body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.add-collection-row-title {
	overflow: hidden;
	font-size: 14px;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.add-collection-row-meta {
	display: flex;
	align-items: center;
	gap: 4px;
	color: var(--color-text-muted);
	font-size: 12px;
}
.add-collection-private {
	display: inline-flex;
	align-items: center;
	gap: 3px;
}
.add-collection-private span {
	width: 12px;
	height: 12px;
}
.add-collection-mark {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	color: var(--color-text-muted);
}
.add-collection-row[aria-pressed="true"] .add-collection-mark {
	color: var(--color-accent);
}
.add-collection-message {
	margin: 0;
	padding: 14px 16px;
	color: var(--color-text-muted);
	font-size: 13px;
}
.add-collection-error {
	margin: 0 16px 6px;
	color: var(--color-error-text);
	font-size: 12px;
}
.add-collection-footer {
	flex-shrink: 0;
	padding: 4px 0;
	border-top: 1px solid var(--color-border);
}
.add-collection-footer--alone {
	border-top: 0;
}
.add-collection-new {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 12px 16px;
	border: 0;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font: inherit;
	font-size: 14px;
	font-weight: 600;
	text-align: left;
}
.add-collection-new:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.add-collection-new:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: -2px;
}
.add-collection-new:disabled {
	cursor: wait;
}
/* サムネイルの幅にそろえて、＋を題名の列の左に置く */
.add-collection-new span {
	width: 20px;
	height: 20px;
	margin: 0 8px;
}
.add-collection-create {
	display: flex;
	gap: 8px;
	padding: 8px 16px;
}
.add-collection-create input {
	flex: 1;
	min-width: 0;
}
.add-collection-create button {
	flex-shrink: 0;
}
.add-collection-footer .add-collection-error {
	margin-top: 2px;
	margin-bottom: 8px;
}
</style>
