<script lang="ts">
import { onMount } from "svelte";
import { trapFocus } from "$lib/actions/trapFocus";
import { type CollectionMembership, MAX_COLLECTION_TITLE_LENGTH } from "$lib/collections";

/**
 * 作品ページの「コレクションに追加」（#515）。自分のコレクションをチェックボックスで並べ、
 * チェックを付け外しした時点で保存する。一番下で、この作品を入れたコレクションをその場で作れる
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

let newTitle = $state("");
let newIsPublic = $state(true);
let creating = $state(false);
let createError = $state("");

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
		const body = (await response.json()) as { itemCount: number };
		collections = (collections ?? []).map((item) =>
			item.id === collection.id ? { ...item, has_anime: adding, item_count: body.itemCount } : item,
		);
	} catch {
		rowError = { id: collection.id, message: "保存に失敗しました" };
	} finally {
		savingId = null;
	}
}

async function create(event: SubmitEvent) {
	event.preventDefault();
	if (busy || !newTitle.trim()) return;
	creating = true;
	createError = "";
	const form = new FormData();
	form.set("anime_id", String(animeId));
	form.set("title", newTitle);
	if (newIsPublic) form.set("is_public", "on");
	try {
		const response = await fetch("/api/collections", { method: "POST", body: form });
		if (!response.ok) {
			createError = await errorMessage(response, "コレクションの作成に失敗しました");
			return;
		}
		const body = (await response.json()) as { collection: CollectionMembership; message?: string };
		collections = [body.collection, ...(collections ?? [])];
		newTitle = "";
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
		aria-labelledby="add-collection-title"
		tabindex="-1"
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => {
			event.stopPropagation();
			if (event.key === "Escape") close();
		}}
	>
		<div class="add-collection-header">
			<div class="add-collection-heading">
				<span id="add-collection-title">コレクションに追加</span>
				<span class="add-collection-anime">{animeTitle}</span>
			</div>
			<button type="button" class="add-collection-close" aria-label="閉じる" disabled={busy} onclick={close}>
				×
			</button>
		</div>

		<div class="add-collection-body">
			{#if loadError}
				<p class="add-collection-message" role="alert">{loadError}</p>
			{:else if collections === null}
				<p class="add-collection-message">読み込み中…</p>
			{:else if collections.length === 0}
				<p class="add-collection-message">
					まだコレクションがありません。下で作ると、この作品を入れた状態でできます。
				</p>
			{:else}
				<ul class="add-collection-list">
					{#each collections as collection (collection.id)}
						<li>
							<label class="add-collection-row" class:add-collection-row--checked={collection.has_anime}>
								<input
									type="checkbox"
									checked={collection.has_anime}
									aria-busy={savingId === collection.id}
									onchange={(event) => {
										// 保存が終わるまでは今の状態のままにする（失敗したら戻さなくて済む）。
										// 保存中も押せないようにはしない（フォーカスが外れて Esc やキー操作が効かなくなる）
										event.currentTarget.checked = collection.has_anime;
										void toggle(collection);
									}}
								>
								<span class="add-collection-row-body">
									<span class="add-collection-row-title">
										{collection.title}
										{#if !collection.is_public}
											<span class="add-collection-private">
												<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>非公開
											</span>
										{/if}
									</span>
									<span class="add-collection-row-meta">
										{savingId === collection.id ? '保存中…' : `${collection.item_count}作品`}
									</span>
								</span>
							</label>
							{#if rowError?.id === collection.id}
								<p class="add-collection-error" role="alert">{rowError.message}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if collections !== null}
			<div class="add-collection-footer">
				{#if atLimit}
					<p class="add-collection-message">コレクションは{limit}個まで作れます</p>
				{:else}
					<form class="add-collection-create" onsubmit={create}>
						<label for="new-collection-title" class="add-collection-create-label"
							>新しいコレクションを作って追加</label
						>
						<div class="add-collection-create-row">
							<input
								id="new-collection-title"
								type="text"
								class="field-input"
								placeholder="題名"
								maxlength={MAX_COLLECTION_TITLE_LENGTH}
								autocomplete="off"
								readonly={creating}
								bind:value={newTitle}
							>
							<button type="submit" class="btn btn-secondary" disabled={busy || !newTitle.trim()}>
								{creating ? '作成中…' : '作る'}
							</button>
						</div>
						<label class="add-collection-public">
							<input type="checkbox" bind:checked={newIsPublic} disabled={creating}>
							公開する（プロフィールを見られる人に見せる）
						</label>
						{#if createError}
							<p class="add-collection-error" role="alert">{createError}</p>
						{/if}
					</form>
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
	width: min(100%, 440px);
	max-height: calc(100dvh - 32px);
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.36);
	outline: none;
}
.add-collection-header {
	display: flex;
	flex-shrink: 0;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--color-border);
}
.add-collection-heading {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	font-size: 15px;
	font-weight: 800;
}
.add-collection-anime {
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 500;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.add-collection-close {
	flex-shrink: 0;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 20px;
	line-height: 1;
}
.add-collection-close:hover:not(:disabled) {
	background: var(--color-border);
	color: var(--color-text);
}
.add-collection-body {
	min-height: 0;
	padding: 8px;
	overflow-y: auto;
}
.add-collection-list {
	display: flex;
	flex-direction: column;
	gap: 2px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.add-collection-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px;
	border-radius: 10px;
	cursor: pointer;
}
.add-collection-row:hover {
	background: var(--color-surface-hover);
}
.add-collection-row input {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	margin: 0;
	accent-color: var(--color-accent);
	cursor: pointer;
}
.add-collection-row:has(input[aria-busy="true"]) {
	cursor: wait;
}
.add-collection-row-body {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.add-collection-row-title {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	overflow: hidden;
	font-size: 14px;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.add-collection-row--checked .add-collection-row-title {
	font-weight: 800;
}
.add-collection-private {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 2px;
	color: var(--color-text-muted);
	font-size: 11px;
	font-weight: 500;
}
.add-collection-private span {
	width: 12px;
	height: 12px;
}
.add-collection-row-meta {
	color: var(--color-text-muted);
	font-size: 12px;
}
.add-collection-message {
	margin: 0;
	padding: 12px 10px;
	color: var(--color-text-muted);
	font-size: 13px;
}
.add-collection-error {
	margin: 0 10px 6px;
	color: var(--color-error-text);
	font-size: 12px;
}
.add-collection-footer {
	flex-shrink: 0;
	padding: 12px 14px 14px;
	border-top: 1px solid var(--color-border);
}
.add-collection-footer .add-collection-message {
	padding: 0;
}
.add-collection-create {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.add-collection-create .add-collection-error {
	margin: 0;
}
.add-collection-create-label {
	font-size: 13px;
	font-weight: 700;
}
.add-collection-create-row {
	display: flex;
	gap: 8px;
}
.add-collection-create-row input {
	flex: 1;
	min-width: 0;
}
.add-collection-create-row button {
	flex-shrink: 0;
}
.add-collection-public {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--color-text-muted);
	font-size: 12px;
	cursor: pointer;
}
.add-collection-public input {
	margin: 0;
	accent-color: var(--color-accent);
}
</style>
