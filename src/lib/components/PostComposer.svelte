<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import type { AnimeExchangeShare } from "$lib/types";
import { charCountClass } from "$lib/utils/format";
import AnimeExchangeResult from "./AnimeExchangeResult.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface AnimeResult {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
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
}

let {
	username,
	avatarUrl,
	initialAnime = null,
	initialContent = "",
	initialExchangeId = null,
	initialExchangeShare = null,
}: Props = $props();

$effect(() => {
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

// @メンション
let textareaEl = $state<HTMLTextAreaElement | null>(null);
let mentionResults = $state<UserResult[]>([]);
let mentionDropdownOpen = $state(false);
let mentionDebounce = $state<ReturnType<typeof setTimeout> | null>(null);

const remaining = $derived(MAX_LENGTH - content.length);
const countClass = $derived(charCountClass(content.length, MAX_LENGTH));
const canSubmit = $derived(
	(content.trim().length > 0 || imageUrls.length > 0 || selectedAnime !== null || selectedExchangeShare !== null) &&
		content.length <= MAX_LENGTH &&
		!submitting &&
		!uploading,
);

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

function clearExchangeShare() {
	selectedExchangeId = null;
	selectedExchangeShare = null;
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
					placeholder="いまなにしてる？"
					rows="3"
					bind:value={content}
					maxlength={MAX_LENGTH + 10}
					oninput={handleContentInput}
					aria-label="投稿内容"
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

			<!-- 選択済みアニメプレビュー -->
			{#if selectedAnime}
				<div class="composer-anime-preview">
					{#if selectedAnime.cover_url}
						<img
							src={selectedAnime.cover_url}
							alt={selectedAnime.title}
							class="composer-anime-thumb"
							decoding="async"
						>
					{/if}
					<div class="composer-anime-info">
						<span class="composer-anime-title">{selectedAnime.title}</span>
						{#if selectedAnime.title_en}
							<span class="composer-anime-title-en">{selectedAnime.title_en}</span>
						{/if}
					</div>
					<button
						type="button"
						class="composer-anime-remove"
						onclick={clearAnime}
						aria-label="アニメ引用を削除"
					>
						✕
					</button>
				</div>
				<input type="hidden" name="anime_id" value={selectedAnime.id}>
			{/if}

			{#if selectedExchangeShare}
				<div class="composer-exchange-preview">
					<AnimeExchangeResult
						offeredAnime={selectedExchangeShare.offered_anime}
						receivedAnime={selectedExchangeShare.received_anime}
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
				aria-label="アニメタイトルで検索"
			>
			<div class="anime-search-results" aria-live="polite" aria-busy={animeSearching}>
				{#if animeSearching}
					<p class="anime-search-empty">検索中…</p>
				{:else if animeQuery.trim().length > 0 && animeResults.length === 0}
					<p class="anime-search-empty">見つかりませんでした</p>
				{:else}
					{#each animeResults as anime}
						<button type="button" class="anime-search-item" onclick={() => selectAnime(anime)}>
							{#if anime.cover_url}
								<img
									src={anime.cover_url}
									alt={anime.title}
									class="anime-search-thumb"
									loading="lazy"
									decoding="async"
								>
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
	background: var(--color-surface);
	border: 1px solid var(--color-border);
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
	background: var(--color-surface-hover);
}
.mention-dropdown-username {
	font-weight: 600;
	font-size: 0.9rem;
	color: var(--color-accent);
}
.mention-dropdown-displayname {
	font-size: 0.8rem;
	color: var(--color-text-muted);
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
