<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { replaceState } from "$app/navigation";
import { page } from "$app/state";
import type { AnimeExchangeShare } from "$lib/types";
import { charCountClass } from "$lib/utils/format";
import AnimeExchangeResult from "./AnimeExchangeResult.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface AnimeResult {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
	official_hashtag?: string[] | null;
}

interface UserResult {
	id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
}

interface Props {
	username: string;
	avatarUrl: string | null | undefined;
	initialAnime?: AnimeResult | null;
	initialContent?: string;
	initialExchangeId?: string | null;
	initialExchangeShare?: AnimeExchangeShare | null;
	watchingAnime?: AnimeResult[];
	onsubmitsuccess?: () => void;
}

let {
	username,
	avatarUrl,
	initialAnime = null,
	initialContent = "",
	initialExchangeId = null,
	initialExchangeShare = null,
	watchingAnime = [],
	onsubmitsuccess,
}: Props = $props();

const MAX_LENGTH = 280;
const MAX_IMAGES = 4;

let content = $state("");
let submitting = $state(false);
let errorMessage = $state("");
let imageUrls = $state<string[]>([]);
let uploading = $state(false);
let fileInput = $state<HTMLInputElement | null>(null);
let selectedExchangeId = $state<string | null>(null);
let selectedExchangeShare = $state<AnimeExchangeShare | null>(null);

// アニメ引用
let animeSearchOpen = $state(false);
let animeQuery = $state("");
let animeResults = $state<AnimeResult[]>([]);
let animeSearching = $state(false);
let selectedAnime = $state<AnimeResult | null>(null);
let searchDebounce = $state<ReturnType<typeof setTimeout> | null>(null);

// CW（コンテンツ警告）
let cwSearchOpen = $state(false);
let cwQuery = $state("");
let cwResults = $state<AnimeResult[]>([]);
let cwSearching = $state(false);
let selectedCwAnime = $state<AnimeResult | null>(null);
let cwSearchDebounce: ReturnType<typeof setTimeout> | null = null;
let cwInputEl = $state<HTMLInputElement | null>(null);

// @メンション
let textareaEl = $state<HTMLTextAreaElement | null>(null);
let mentionResults = $state<UserResult[]>([]);
let mentionDropdownOpen = $state(false);
let mentionDebounce = $state<ReturnType<typeof setTimeout> | null>(null);
let appliedInitialValuesKey = $state<string | null>(null);

const initialValuesKey = $derived(
	initialExchangeShare && initialExchangeId
		? `exchange:${initialExchangeId}`
		: initialAnime
			? `anime:${initialAnime.id}`
			: initialContent || null,
);

$effect(() => {
	if (!initialValuesKey || appliedInitialValuesKey === initialValuesKey) return;

	appliedInitialValuesKey = initialValuesKey;
	if (initialAnime && !selectedAnime) {
		selectedAnime = initialAnime;
	}
	if (initialContent && !content) {
		content = initialContent;
	}
	if (initialExchangeShare && !selectedExchangeShare) {
		selectedExchangeId = initialExchangeId;
		selectedExchangeShare = initialExchangeShare;
	}
});

const remaining = $derived(MAX_LENGTH - content.length);
const countClass = $derived(charCountClass(content.length, MAX_LENGTH));
const canSubmit = $derived(
	(content.trim().length > 0 || imageUrls.length > 0 || selectedAnime !== null || selectedExchangeShare !== null) &&
		content.length <= MAX_LENGTH &&
		!submitting &&
		!uploading,
);

function normalizeHashtagLabel(tag: string) {
	const normalized = tag.trim().replace(/^#+/, "");
	return normalized ? `#${normalized}` : "";
}

function animeQuoteChipLabel(anime: AnimeResult) {
	return anime.official_hashtag?.map(normalizeHashtagLabel).find(Boolean) ?? normalizeHashtagLabel(anime.title);
}

async function handleFileChange(e: Event) {
	const input = e.target as HTMLInputElement;
	const files = Array.from(input.files ?? []);
	if (files.length === 0) return;

	const remaining_slots = MAX_IMAGES - imageUrls.length;
	const toUpload = files.slice(0, remaining_slots);

	uploading = true;
	errorMessage = "";

	for (const file of toUpload) {
		const fd = new FormData();
		fd.append("file", file);
		try {
			const res = await fetch("/api/upload", { method: "POST", body: fd });
			if (!res.ok) {
				const msg = await res.text();
				errorMessage = msg || "アップロードに失敗しました";
				break;
			}
			const { url } = await res.json();
			imageUrls = [...imageUrls, url];
		} catch {
			errorMessage = "アップロードに失敗しました";
			break;
		}
	}

	uploading = false;
	input.value = "";
}

function removeImage(index: number) {
	imageUrls = imageUrls.filter((_, i) => i !== index);
}

function openAnimeSearch() {
	animeSearchOpen = true;
	animeQuery = "";
	animeResults = [];
}

function closeAnimeSearch() {
	animeSearchOpen = false;
}

function selectAnime(anime: AnimeResult) {
	selectedAnime = anime;
	animeSearchOpen = false;
	animeQuery = "";
	animeResults = [];
}

function clearAnime() {
	selectedAnime = null;
}

function openCwSearch() {
	cwSearchOpen = true;
	cwQuery = "";
	cwResults = [];
}
$effect(() => {
	if (cwSearchOpen && cwInputEl) setTimeout(() => cwInputEl?.focus(), 50);
});
function closeCwSearch() {
	cwSearchOpen = false;
}
function selectCwAnime(anime: AnimeResult) {
	selectedCwAnime = anime;
	cwSearchOpen = false;
}
function clearCwAnime() {
	selectedCwAnime = null;
}
function handleCwQueryInput() {
	if (cwSearchDebounce) clearTimeout(cwSearchDebounce);
	if (cwQuery.trim().length === 0) {
		cwResults = [];
		return;
	}
	cwSearchDebounce = setTimeout(async () => {
		cwSearching = true;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(cwQuery.trim())}`);
			cwResults = res.ok ? await res.json() : [];
		} catch {
			cwResults = [];
		}
		cwSearching = false;
	}, 300);
}

function clearExchangeShare() {
	selectedExchangeId = null;
	selectedExchangeShare = null;

	if (page.url.searchParams.has("share_exchange")) {
		const url = new URL(page.url);
		url.searchParams.delete("share_exchange");
		replaceState(url, page.state);
	}
}

function handleAnimeQueryInput() {
	if (searchDebounce) clearTimeout(searchDebounce);
	if (animeQuery.trim().length === 0) {
		animeResults = [];
		return;
	}
	searchDebounce = setTimeout(async () => {
		animeSearching = true;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(animeQuery.trim())}`);
			animeResults = res.ok ? await res.json() : [];
		} catch {
			animeResults = [];
		}
		animeSearching = false;
	}, 300);
}

function handleContentInput() {
	if (!textareaEl) return;
	const val = textareaEl.value;
	const cursor = textareaEl.selectionStart ?? val.length;
	const textBeforeCursor = val.slice(0, cursor);
	const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

	if (mentionMatch) {
		if (mentionDebounce) clearTimeout(mentionDebounce);
		const q = mentionMatch[1] ?? "";
		mentionDebounce = setTimeout(async () => {
			if (q.length === 0) {
				mentionDropdownOpen = false;
				return;
			}
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
				mentionResults = res.ok ? await res.json() : [];
				mentionDropdownOpen = mentionResults.length > 0;
			} catch {
				mentionResults = [];
				mentionDropdownOpen = false;
			}
		}, 200);
	} else {
		mentionDropdownOpen = false;
	}
}

function selectMention(user: UserResult) {
	if (!textareaEl) return;
	const val = textareaEl.value;
	const cursor = textareaEl.selectionStart ?? val.length;
	const before = val.slice(0, cursor).replace(/@([a-zA-Z0-9_]*)$/, `@${user.username} `);
	content = before + val.slice(cursor);
	mentionDropdownOpen = false;
	mentionResults = [];
	setTimeout(() => {
		textareaEl?.focus();
		textareaEl?.setSelectionRange(before.length, before.length);
	}, 0);
}

const handleSubmit: SubmitFunction = () => {
	submitting = true;
	errorMessage = "";
	return async ({ result, update }) => {
		submitting = false;
		if (result.type === "failure") {
			errorMessage = (result.data as { message?: string })?.message ?? "投稿に失敗しました";
		} else {
			content = "";
			imageUrls = [];
			selectedAnime = null;
			clearExchangeShare();
			await update();
			onsubmitsuccess?.();
		}
	};
};
</script>

<div class="composer">
	<div class="composer-body">
		<UserAvatar src={avatarUrl} {username} size="md" />
		<form method="POST" action="?/createPost" use:enhance={handleSubmit} class="composer-form">
			<div style="position:relative;">
				<textarea
					bind:this={textareaEl}
					name="content"
					class="composer-textarea"
					placeholder="どのアニメ見てる？"
					rows="3"
					bind:value={content}
					maxlength={MAX_LENGTH + 10}
					oninput={handleContentInput}
				></textarea>

				{#if mentionDropdownOpen && mentionResults.length > 0}
					<div class="mention-dropdown">
						{#each mentionResults as user}
							<button
								type="button"
								class="mention-dropdown-item"
								onmousedown={(e) => { e.preventDefault(); selectMention(user); }}
							>
								<span class="mention-dropdown-username">@{user.username}</span>
								{#if user.display_name}
									<span class="mention-dropdown-displayname">{user.display_name}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if selectedAnime || selectedCwAnime}
				<div class="flex flex-wrap gap-2 mt-2 mb-0.5">
					{#if selectedAnime}
						<span
							class="inline-flex items-center gap-1.5 max-w-full rounded-full border border-blue-500/50 bg-blue-950/40 px-3 py-1 text-sm font-semibold leading-tight text-blue-300"
						>
							<span class="i-lucide-clapperboard shrink-0" aria-hidden="true"></span>
							<span class="min-w-0 max-w-[18ch] truncate">{animeQuoteChipLabel(selectedAnime)}</span>
							<button
								type="button"
								class="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-0 bg-transparent p-0 text-current opacity-70 hover:bg-white/15 hover:opacity-100"
								onclick={clearAnime}
								aria-label="アニメ引用を削除"
							>
								✕
							</button>
						</span>
					{/if}

					{#if selectedCwAnime}
						<span
							class="inline-flex items-center gap-1.5 max-w-full rounded-full border border-amber-500/50 bg-amber-950/40 px-3 py-1 text-sm font-semibold leading-tight text-amber-300"
						>
							<span class="i-lucide-triangle-alert shrink-0" aria-hidden="true"></span>
							<span class="min-w-0 max-w-[34ch] truncate">ネタバレ</span>
							<button
								type="button"
								class="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-0 bg-transparent p-0 text-current opacity-70 hover:bg-white/15 hover:opacity-100"
								onclick={clearCwAnime}
								aria-label="CW解除"
							>
								✕
							</button>
						</span>
					{/if}
				</div>
			{/if}

			{#if selectedAnime}
				<input type="hidden" name="anime_id" value={selectedAnime.id}>
			{/if}

			{#if selectedCwAnime}
				<input type="hidden" name="cw_anime_id" value={selectedCwAnime.id}>
			{/if}

			{#if selectedExchangeShare}
				<div class="composer-exchange-preview">
					<AnimeExchangeResult
						offeredAnime={selectedExchangeShare.offered_anime}
						receivedAnime={selectedExchangeShare.received_anime}
						offeredComment={selectedExchangeShare.offered_comment}
						receivedComment={selectedExchangeShare.received_comment}
						mode="timeline"
					/>
					<button
						type="button"
						class="composer-anime-remove"
						onclick={clearExchangeShare}
						aria-label="交換結果の共有を削除"
					>
						✕
					</button>
				</div>
				{#if selectedExchangeId}
					<input type="hidden" name="exchange_id" value={selectedExchangeId}>
				{/if}
			{/if}

			<!-- 画像のプレビュー -->
			{#if imageUrls.length > 0}
				<div class="composer-image-previews">
					{#each imageUrls as url, i}
						<div class="composer-image-preview">
							<img src={url} alt="添付画像 {i + 1}">
							<button
								type="button"
								class="composer-image-remove"
								onclick={() => removeImage(i)}
								aria-label="画像を削除"
							>
								✕
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- 画像URLをフォームに含める -->
			<input type="hidden" name="image_urls" value={JSON.stringify(imageUrls)}>

			{#if errorMessage}
				<p class="flash-error" style="margin-top:8px;">{errorMessage}</p>
			{/if}

			<div class="composer-footer">
				<!-- 画像添付ボタン -->
				<button
					type="button"
					class="composer-image-btn"
					disabled={imageUrls.length >= MAX_IMAGES || uploading}
					onclick={() => fileInput?.click()}
					aria-label="画像を添付"
					title="画像を添付（最大{MAX_IMAGES}枚）"
				>
					{#if uploading}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path
								d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
							/>
						</svg>
					{:else}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<polyline points="21 15 16 10 5 21" />
						</svg>
					{/if}
				</button>

				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/gif,image/webp"
					multiple
					style="display:none"
					onchange={handleFileChange}
				>

				<!-- アニメ引用ボタン -->
				<button
					type="button"
					class="composer-image-btn"
					class:active={selectedAnime !== null}
					disabled={selectedAnime !== null}
					onclick={openAnimeSearch}
					aria-label="アニメを引用"
					title="アニメを引用"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
						<line x1="7" y1="2" x2="7" y2="22" />
						<line x1="17" y1="2" x2="17" y2="22" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<line x1="2" y1="7" x2="7" y2="7" />
						<line x1="2" y1="17" x2="7" y2="17" />
						<line x1="17" y1="17" x2="22" y2="17" />
						<line x1="17" y1="7" x2="22" y2="7" />
					</svg>
				</button>

				<!-- CWボタン -->
				<button
					type="button"
					class="composer-image-btn"
					class:active={selectedCwAnime !== null}
					onclick={openCwSearch}
					aria-label="ネタバレCWを設定"
					title="ネタバレCW（コンテンツ警告）を設定"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
						/>
						<line x1="1" y1="1" x2="23" y2="23" />
					</svg>
				</button>

				<span class="char-count {countClass}">{remaining}</span>
				<button type="submit" class="btn btn-primary" disabled={!canSubmit}>
					{submitting ? '投稿中…' : '投稿'}
				</button>
			</div>
		</form>
	</div>
</div>

<!-- アニメ検索モーダル -->
{#if animeSearchOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="anime-search-overlay"
		onclick={(e) => { if (e.target === e.currentTarget) closeAnimeSearch(); }}
		role="dialog"
		aria-modal="true"
		aria-label="アニメ検索"
		tabindex="-1"
	>
		<div class="anime-search-modal">
			<div class="anime-search-header">
				<span class="anime-search-title">アニメを選択</span>
				<button type="button" class="anime-search-close" onclick={closeAnimeSearch} aria-label="閉じる">
					✕
				</button>
			</div>
			<input
				type="search"
				class="anime-search-input"
				placeholder="タイトルで検索…"
				bind:value={animeQuery}
				oninput={handleAnimeQueryInput}
			>
			<div class="anime-search-results">
				{#if animeSearching}
					<p class="anime-search-empty">検索中…</p>
				{:else if animeQuery.trim().length > 0 && animeResults.length === 0}
					<p class="anime-search-empty">見つかりませんでした</p>
				{:else}
					{#each animeResults as anime}
						<button type="button" class="anime-search-item" onclick={() => selectAnime(anime)}>
							{#if anime.cover_url}
								<img src={anime.cover_url} alt={anime.title} class="anime-search-thumb">
							{:else}
								<div class="anime-search-thumb anime-search-thumb-empty"></div>
							{/if}
							<div class="anime-search-item-info">
								<span class="anime-search-item-title">{anime.title}</span>
								{#if anime.title_en}
									<span class="anime-search-item-sub">{anime.title_en}</span>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- CW（ネタバレ）作品検索モーダル -->
{#if cwSearchOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="anime-search-overlay"
		onclick={(e) => { if (e.target === e.currentTarget) closeCwSearch(); }}
		role="dialog"
		aria-modal="true"
		aria-label="ネタバレ作品を選択"
		tabindex="-1"
	>
		<div class="anime-search-modal">
			<div class="anime-search-header">
				<span class="anime-search-title">ネタバレ作品を選択</span>
				<button type="button" class="anime-search-close" onclick={closeCwSearch} aria-label="閉じる">✕</button>
			</div>
			<input
				type="search"
				class="anime-search-input"
				placeholder="作品名で検索…"
				bind:this={cwInputEl}
				bind:value={cwQuery}
				oninput={handleCwQueryInput}
			>
			<div class="anime-search-results">
				{#if cwSearching}
					<p class="anime-search-empty">検索中…</p>
				{:else if cwQuery.trim().length > 0 && cwResults.length === 0}
					<p class="anime-search-empty">見つかりませんでした</p>
				{:else}
					{#each (cwQuery.trim() ? cwResults : watchingAnime) as anime}
						<button type="button" class="anime-search-item" onclick={() => selectCwAnime(anime)}>
							{#if anime.cover_url}
								<img src={anime.cover_url} alt={anime.title} class="anime-search-thumb">
							{:else}
								<div class="anime-search-thumb anime-search-thumb-empty"></div>
							{/if}
							<div class="anime-search-item-info">
								<span class="anime-search-item-title">{anime.title}</span>
								{#if anime.title_en}
									<span class="anime-search-item-sub">{anime.title_en}</span>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
.mention-dropdown {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	background: var(--bg-card, #1e1e2e);
	border: 1px solid var(--border, #313244);
	border-radius: 8px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	z-index: 50;
	max-height: 200px;
	overflow-y: auto;
}
.mention-dropdown-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 12px;
	background: none;
	border: none;
	cursor: pointer;
	text-align: left;
	color: inherit;
}
.mention-dropdown-item:hover {
	background: var(--bg-hover, #313244);
}
.mention-dropdown-username {
	font-weight: 600;
	font-size: 0.9rem;
	color: var(--accent, #89b4fa);
}
.mention-dropdown-displayname {
	font-size: 0.8rem;
	color: var(--text-muted);
}
.composer-exchange-preview {
	position: relative;
	margin-top: 10px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
}
.composer-exchange-preview .composer-anime-remove {
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 1;
}
</style>
