<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onMount } from "svelte";
import { enhance } from "$app/forms";
import { replaceState } from "$app/navigation";
import { page } from "$app/state";
import { autosize } from "$lib/actions/autosize";
import { trapFocus } from "$lib/actions/trapFocus";
import {
	type ComposeDraft,
	clearComposeDraft,
	getBrowserDraftStorage,
	isDraftEmpty,
	loadComposeDraft,
	saveComposeDraft,
} from "$lib/compose-draft";
import type { AnimeExchangeShare, OpenBroadcastRoomSummary } from "$lib/types";
import { animeQuoteChipLabel, cwChipLabel } from "$lib/utils/composer-chips";
import { charCountClass } from "$lib/utils/format";
import { applyMention, findMentionQuery, mentionOptionId, resolveMentionKey } from "$lib/utils/mention-suggest";
import AnimeExchangeResult from "./AnimeExchangeResult.svelte";
import { classifyComposerSubmitResult } from "./post-composer-submit";
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
	focusOnMount?: boolean;
	/**
	 * 下書き保存キー（通常はユーザー ID）。指定すると書きかけを localStorage に退避し、
	 * 次回マウント時に復元する（GitLab #2）。未指定なら従来どおり保存しない。
	 */
	draftKey?: string | null;
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
	focusOnMount = false,
	draftKey = null,
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

// 実況ルームリンク
let selectedRoom = $state<OpenBroadcastRoomSummary | null>(null);
let roomModalOpen = $state(false);
let openRooms = $state<OpenBroadcastRoomSummary[] | null>(null);
let roomsLoading = $state(false);

// @メンション
let textareaEl = $state<HTMLTextAreaElement | null>(null);
let mentionResults = $state<UserResult[]>([]);
let mentionDropdownOpen = $state(false);
let mentionDebounce = $state<ReturnType<typeof setTimeout> | null>(null);
/** キーボードで選択中の候補 index。-1 は未選択 */
let mentionActiveIndex = $state(-1);
// 同じページに複数の PostComposer が乗る（デスクトップ用とモバイルモーダル）ので id は個別に振る
const uid = $props.id();
const mentionListId = `${uid}-mention-list`;
const mentionActiveId = $derived(
	mentionDropdownOpen && mentionActiveIndex >= 0 ? mentionOptionId(mentionListId, mentionActiveIndex) : undefined,
);
const mentionAnnouncement = $derived(
	mentionDropdownOpen && mentionResults.length > 0
		? `メンション候補 ${mentionResults.length}件。上下キーで選択、Enterで確定、Escapeで閉じます`
		: "",
);
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

// ---- 下書き保存（GitLab #2） ----
// モバイルモーダルは閉じるとこのコンポーネントごと破棄されるため、draftKey が指定されたときは
// 入力内容を localStorage に退避し、次回マウント時に復元する。保存形式・期限は compose-draft.ts を参照。
let draftRestored = $state(false);

function currentDraft(): ComposeDraft {
	return { content, imageUrls, anime: selectedAnime, cwAnime: selectedCwAnime, room: selectedRoom };
}

const hasDraft = $derived(!isDraftEmpty(currentDraft()));

function restoreDraft(key: string) {
	const draft = loadComposeDraft(getBrowserDraftStorage(), key);
	if (draft) {
		// 本文は利用者が書いたものを最優先する（共有リンク由来の定型文より価値が高い）。
		// 添付は引用リンク等で既に入っている値を優先し、空の項目だけ下書きで埋める。
		if (draft.content.trim()) content = draft.content;
		if (imageUrls.length === 0) imageUrls = draft.imageUrls;
		if (!selectedAnime) selectedAnime = draft.anime;
		if (!selectedCwAnime) selectedCwAnime = draft.cwAnime;
		if (!selectedRoom) selectedRoom = draft.room;
	}
	draftRestored = true;
}

/** 明示的な破棄操作。フォームを空にして保存済みの下書きも消す。 */
function discardDraft() {
	content = "";
	imageUrls = [];
	selectedAnime = null;
	selectedCwAnime = null;
	selectedRoom = null;
	clearExchangeShare();
	if (draftKey) clearComposeDraft(getBrowserDraftStorage(), draftKey);
	textareaEl?.focus();
}

// 復元が終わってから入力の変化を追って保存する（復元前に空の状態で上書きしないため）。
// 投稿成功でフォームが空になると saveComposeDraft が保存を消すので、投稿後に下書きは残らない。
$effect(() => {
	if (!draftKey || !draftRestored) return;
	saveComposeDraft(getBrowserDraftStorage(), draftKey, currentDraft());
});

onMount(() => {
	// 初期値の反映（上の $effect）より後に走る宣言順なので、引用リンクの値が先に入る
	if (draftKey) restoreDraft(draftKey);
	if (focusOnMount) textareaEl?.focus();
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

async function openRoomSearch() {
	roomModalOpen = true;
	roomsLoading = true;
	try {
		const res = await fetch("/api/rooms/open");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		openRooms = await res.json();
	} catch {
		openRooms = [];
	} finally {
		roomsLoading = false;
	}
}
function closeRoomModal() {
	roomModalOpen = false;
}
function selectRoom(room: OpenBroadcastRoomSummary) {
	selectedRoom = room;
	roomModalOpen = false;
}
function clearRoom() {
	selectedRoom = null;
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

function closeMentionDropdown() {
	mentionDropdownOpen = false;
	mentionActiveIndex = -1;
}

function handleContentInput() {
	if (!textareaEl) return;
	const val = textareaEl.value;
	const cursor = textareaEl.selectionStart ?? val.length;
	const q = findMentionQuery(val, cursor);

	if (q !== null) {
		if (mentionDebounce) clearTimeout(mentionDebounce);
		mentionDebounce = setTimeout(async () => {
			if (q.length === 0) {
				closeMentionDropdown();
				return;
			}
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
				mentionResults = res.ok ? await res.json() : [];
				mentionDropdownOpen = mentionResults.length > 0;
				// 候補が入れ替わったら先頭を選択状態にして、Enter/Tab ですぐ確定できるようにする
				mentionActiveIndex = mentionDropdownOpen ? 0 : -1;
			} catch {
				mentionResults = [];
				closeMentionDropdown();
			}
		}, 200);
	} else {
		closeMentionDropdown();
	}
}

/**
 * textarea 上のキー操作で候補を選ぶ（GitLab #4）。フォーカスは textarea に置いたまま
 * aria-activedescendant で選択中の候補を支援技術へ伝える。IME 変換中は何もしない。
 */
function handleContentKeydown(e: KeyboardEvent) {
	const action = resolveMentionKey(e.key, {
		open: mentionDropdownOpen,
		count: mentionResults.length,
		activeIndex: mentionActiveIndex,
		// keyCode 229 は一部ブラウザーで isComposing が立たない IME 確定 Enter の互換判定
		composing: e.isComposing || e.keyCode === 229,
	});
	if (action.type === "none") return;
	e.preventDefault();
	if (action.type === "close") {
		// 外側のモーダルの Escape（閉じる）まで届かせない
		e.stopPropagation();
		closeMentionDropdown();
		return;
	}
	if (action.type === "move") {
		mentionActiveIndex = action.index;
		return;
	}
	const user = mentionResults[action.index];
	if (user) selectMention(user);
}

// 選択中の候補がリストのスクロール範囲外に出たら見える位置まで送る
$effect(() => {
	if (!mentionActiveId) return;
	const el = document.getElementById(mentionActiveId);
	if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
});

function selectMention(user: UserResult) {
	if (!textareaEl) return;
	const val = textareaEl.value;
	const cursor = textareaEl.selectionStart ?? val.length;
	const applied = applyMention(val, cursor, user.username);
	content = applied.text;
	closeMentionDropdown();
	mentionResults = [];
	setTimeout(() => {
		textareaEl?.focus();
		textareaEl?.setSelectionRange(applied.cursor, applied.cursor);
	}, 0);
}

/** ネストしたダイアログの Escape。外側の投稿モーダルまで伝播させずに自分だけ閉じる。 */
function handleOverlayEscape(e: KeyboardEvent, close: () => void) {
	if (e.key !== "Escape") return;
	e.preventDefault();
	e.stopPropagation();
	close();
}

const handleSubmit: SubmitFunction = ({ cancel }) => {
	if (!canSubmit) {
		cancel();
		return;
	}
	submitting = true;
	errorMessage = "";
	return async ({ result, update }) => {
		submitting = false;
		const outcome = classifyComposerSubmitResult(result);
		if (outcome.kind === "retry") {
			// failure / error では本文・画像・引用を消さず、理由を表示して再送できるようにする（GitLab #1）。
			// update() も呼ばない: error 結果の既定処理はエラーページ描画で、書きかけが失われる。
			errorMessage = outcome.message;
			return;
		}
		if (outcome.kind === "passthrough") {
			await update();
			return;
		}
		content = "";
		imageUrls = [];
		selectedAnime = null;
		clearExchangeShare();
		await update();
		onsubmitsuccess?.();
	};
};
</script>

<div class="composer compact-composer">
	<div class="composer-body">
		<UserAvatar src={avatarUrl} {username} size="sm" />
		<form method="POST" action="?/createPost" use:enhance={handleSubmit} class="composer-form">
			<div class="composer-input">
				<textarea
					bind:this={textareaEl}
					name="content"
					class="composer-textarea"
					placeholder="ひとこと…"
					rows="1"
					use:autosize={content}
					bind:value={content}
					maxlength={MAX_LENGTH + 10}
					oninput={handleContentInput}
					onkeydown={handleContentKeydown}
					aria-label="投稿内容"
					aria-autocomplete="list"
					aria-haspopup="listbox"
					aria-controls={mentionDropdownOpen && mentionResults.length > 0 ? mentionListId : undefined}
					aria-activedescendant={mentionActiveId}
				></textarea>
				<!-- 候補の出現と操作方法を読み上げ用に通知する（表示はしない） -->
				<span class="sr-only" aria-live="polite">{mentionAnnouncement}</span>

				{#if mentionDropdownOpen && mentionResults.length > 0}
					<div class="mention-dropdown" id={mentionListId} role="listbox" aria-label="メンション候補">
						{#each mentionResults as user, i (user.id)}
							<!--
								textarea にフォーカスを残したまま選べるよう mousedown は既定動作（フォーカス移動）だけ
								止め、確定は click に任せる。button 要素なので支援技術からの Enter/Space でも click が発火する。
							-->
							<button
								type="button"
								class="mention-dropdown-item"
								id={mentionOptionId(mentionListId, i)}
								role="option"
								aria-selected={i === mentionActiveIndex}
								tabindex="-1"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => selectMention(user)}
								onmouseenter={() => {
									mentionActiveIndex = i;
								}}
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

			<!-- 追加機能（画像・アニメ引用・CW・実況ルーム）のタイル -->
			<div class="composer-tools" role="group" aria-label="投稿の追加機能">
				<button
					type="button"
					class="composer-tool-tile"
					disabled={imageUrls.length >= MAX_IMAGES || uploading}
					onclick={() => fileInput?.click()}
					aria-label="画像を添付"
					title="画像を添付（最大{MAX_IMAGES}枚）"
				>
					<span class={uploading ? "i-lucide-loader-circle" : "i-lucide-image"} aria-hidden="true"></span>
				</button>

				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/gif,image/webp"
					multiple
					style="display:none"
					onchange={handleFileChange}
				>

				<button
					type="button"
					class="composer-tool-tile"
					class:active={selectedAnime !== null}
					disabled={selectedAnime !== null}
					onclick={openAnimeSearch}
					aria-label="アニメを引用"
					title="アニメを引用"
				>
					<span class="i-lucide-clapperboard" aria-hidden="true"></span>
				</button>

				<button
					type="button"
					class="composer-tool-tile"
					class:active={selectedCwAnime !== null}
					onclick={openCwSearch}
					aria-label="ネタバレCWを設定"
					title="ネタバレCW（コンテンツ警告）を設定"
				>
					<span class="i-lucide-eye-off" aria-hidden="true"></span>
				</button>

				<button
					type="button"
					class="composer-tool-tile"
					class:active={selectedRoom !== null}
					onclick={openRoomSearch}
					aria-label="実況ルームにリンク"
					title="実況ルームにリンク"
				>
					<span class="i-lucide-door-open" aria-hidden="true"></span>
				</button>
			</div>

			{#if selectedAnime || selectedCwAnime || selectedRoom}
				<div class="flex flex-wrap gap-2 mt-2 mb-0.5">
					{#if selectedAnime}
						<span
							class="inline-flex items-center gap-1.5 max-w-full rounded-full border border-blue-500/50 bg-blue-950/40 px-3 py-1 text-sm font-semibold leading-tight text-blue-300"
						>
							<span class="i-lucide-clapperboard shrink-0" aria-hidden="true"></span>
							<span class="sr-only">引用作品:</span>
							<span class="min-w-0 max-w-[18ch] truncate" title={selectedAnime.title}
								>{animeQuoteChipLabel(selectedAnime)}</span
							>
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
							<!-- 対象作品名を省略せずに表示する（狭い画面では折り返す）: GitLab #9 -->
							<span class="min-w-0 whitespace-normal [overflow-wrap:anywhere]"
								>{cwChipLabel(selectedCwAnime)}</span
							>
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

					{#if selectedRoom}
						<span
							class="inline-flex items-center gap-1.5 max-w-full rounded-full border border-green-500/50 bg-green-950/40 px-3 py-1 text-sm font-semibold leading-tight text-green-300"
						>
							<span class="i-lucide-door-open shrink-0" aria-hidden="true"></span>
							<span class="min-w-0 max-w-[24ch] truncate"
								>{selectedRoom.anime?.title ?? "実況ルーム"}</span
							>
							<button
								type="button"
								class="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-0 bg-transparent p-0 text-current opacity-70 hover:bg-white/15 hover:opacity-100"
								onclick={clearRoom}
								aria-label="ルームリンクを削除"
							>
								✕
							</button>
						</span>
					{/if}
				</div>
			{/if}

			{#if selectedAnime}
				<input type="hidden" name="anime_id" value={selectedAnime.id}>
			{:else if selectedRoom}
				<input type="hidden" name="anime_id" value={selectedRoom.anime_id}>
			{/if}

			{#if selectedCwAnime}
				<input type="hidden" name="cw_anime_id" value={selectedCwAnime.id}>
			{/if}

			{#if selectedRoom}
				<input type="hidden" name="broadcast_room_session_id" value={selectedRoom.id}>
			{/if}

			{#if selectedExchangeShare}
				<div class="composer-exchange-preview">
					<AnimeExchangeResult
						offeredAnime={selectedExchangeShare.offered_anime}
						receivedAnime={selectedExchangeShare.received_anime}
						offeredComment={selectedExchangeShare.offered_comment}
						receivedComment={selectedExchangeShare.received_comment}
						offeredSubjectiveTags={selectedExchangeShare.offered_subjective_tags}
						receivedSubjectiveTags={selectedExchangeShare.received_subjective_tags}
						mode="timeline"
					/>
					<button
						type="button"
						class="composer-anime-remove"
						onclick={clearExchangeShare}
						aria-label="トレード結果の共有を削除"
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
				<p class="flash-error" role="alert" style="margin-top:8px;">{errorMessage}</p>
			{/if}

			<div class="composer-footer">
				{#if draftKey && hasDraft}
					<!-- 下書きの破棄は明示操作にする（閉じるだけでは消えない）: GitLab #2 -->
					<button type="button" class="composer-draft-discard" onclick={discardDraft}>下書きを破棄</button>
				{/if}
				{#if remaining <= 40}
					<span class="char-count {countClass}" aria-label="残り文字数">{remaining}</span>
				{/if}
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
		onkeydown={(e) => handleOverlayEscape(e, closeAnimeSearch)}
		role="dialog"
		aria-modal="true"
		aria-label="アニメ検索"
		tabindex="-1"
		use:trapFocus
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

<!-- CW（ネタバレ）作品検索モーダル -->
{#if cwSearchOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="anime-search-overlay"
		onclick={(e) => { if (e.target === e.currentTarget) closeCwSearch(); }}
		onkeydown={(e) => handleOverlayEscape(e, closeCwSearch)}
		role="dialog"
		aria-modal="true"
		aria-label="ネタバレ作品を選択"
		tabindex="-1"
		use:trapFocus
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

<!-- 実況ルーム選択モーダル -->
{#if roomModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="anime-search-overlay"
		onclick={(e) => { if (e.target === e.currentTarget) closeRoomModal(); }}
		onkeydown={(e) => handleOverlayEscape(e, closeRoomModal)}
		role="dialog"
		aria-modal="true"
		aria-label="実況ルームを選択"
		tabindex="-1"
		use:trapFocus
	>
		<div class="anime-search-modal">
			<div class="anime-search-header">
				<span class="anime-search-title">実況ルームを選択</span>
				<button type="button" class="anime-search-close" onclick={closeRoomModal} aria-label="閉じる">✕</button>
			</div>
			<div class="anime-search-results">
				{#if roomsLoading}
					<p class="anime-search-empty">読み込み中…</p>
				{:else if openRooms !== null && openRooms.length === 0}
					<p class="anime-search-empty">現在開放中のルームはありません</p>
				{:else if openRooms}
					{#each openRooms as room (room.id)}
						<button type="button" class="anime-search-item" onclick={() => selectRoom(room)}>
							{#if room.anime?.cover_url}
								<img src={room.anime.cover_url} alt={room.anime.title} class="anime-search-thumb">
							{:else}
								<div class="anime-search-thumb anime-search-thumb-empty"></div>
							{/if}
							<div class="anime-search-item-info">
								<span class="anime-search-item-title">{room.anime?.title ?? "不明"}</span>
								{#if room.room_kind === "episode"}
									<span class="anime-search-item-sub">{room.room_date}</span>
								{:else}
									<span class="anime-search-item-sub">総合ロビー</span>
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
.compact-composer {
	padding: 14px;
	margin: 0 0 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	background: var(--color-surface);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	transition:
		border-color 0.15s,
		box-shadow 0.15s;
}
.compact-composer .composer-body {
	align-items: flex-start;
	gap: 10px;
}
.compact-composer .composer-body :global(.avatar) {
	width: 28px;
	height: 28px;
	margin-top: 5px;
}
.compact-composer .composer-form {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	column-gap: 8px;
	align-items: start;
}
.compact-composer .composer-form > :not(.composer-input):not(.composer-footer) {
	grid-column: 1 / -1;
}
.composer-input {
	position: relative;
	grid-column: 1;
	grid-row: 1;
}
.compact-composer .composer-textarea {
	display: block;
	min-height: 96px;
	max-height: 280px;
	padding: 6px 0;
	line-height: 26px;
	font-size: 16px;
	overflow-y: auto;
}
.compact-composer:focus-within {
	border-color: var(--color-accent);
	box-shadow: 0 2px 8px color-mix(in srgb, var(--color-accent) 18%, transparent);
}
.compact-composer .composer-footer {
	grid-column: 2;
	grid-row: 1;
	position: relative;
	border: 0;
	padding: 0;
	margin: 0;
	gap: 6px;
}
.compact-composer .composer-footer .btn {
	min-height: 36px;
	padding: 6px 14px;
	border-radius: 6px;
	font-size: 13px;
}
.composer-tools {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 6px;
}
.composer-tool-tile {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	transition:
		background 0.15s,
		color 0.15s;
}
.composer-tool-tile > span {
	width: 18px;
	height: 18px;
}
.composer-tool-tile:hover:not(:disabled),
.composer-tool-tile:focus-visible {
	background: var(--accent-muted);
	color: var(--color-accent);
}
.composer-tool-tile.active {
	color: var(--color-accent);
}
.composer-tool-tile:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

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
.mention-dropdown-item:hover,
.mention-dropdown-item[aria-selected="true"] {
	background: var(--color-surface-hover);
}
.composer-draft-discard {
	background: none;
	border: none;
	padding: 4px 6px;
	font-size: 0.8rem;
	color: var(--color-text-muted);
	cursor: pointer;
	border-radius: var(--radius-sm);
}
.composer-draft-discard:hover {
	color: var(--color-text);
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
