<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onDestroy } from "svelte";
import { enhance } from "$app/forms";
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import MyListModal from "$lib/components/MyListModal.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import WaitingStatus from "$lib/components/WaitingStatus.svelte";
import { EXCHANGE_SUBJECTIVE_TAG_OPTIONS, MAX_EXCHANGE_SUBJECTIVE_TAGS } from "$lib/exchange-tags";
import type { UserAnimeEntry } from "$lib/types";
import type { PageProps } from "./$types";

interface AnimeResult {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
}

type MyListModalAnime = {
	id: string;
	title: string;
	episode_count?: string | null;
	user_entry?: UserAnimeEntry | null;
};

let { data, form }: PageProps = $props();

let animeQuery = $state("");
let animeResults = $state<AnimeResult[]>([]);
let exchangeComment = $state("");
let selectedSubjectiveTags = $state<string[]>([]);
let selectedAnime = $state<AnimeResult | null>(null);
let animeSearching = $state(false);
let searchDebounce = $state<ReturnType<typeof setTimeout> | null>(null);
let exchangeSubmitting = $state(false);
let exchangeFeedback = $state("");
let exchangeError = $state("");
let exchangeTagMessage = $state("");
let cancelSubmitting = $state(false);
let cancelFeedback = $state("");
let cancelError = $state("");
let myListModalAnime = $state<MyListModalAnime | null>(null);
let enhancedActionHandled = $state(false);
let feedbackClearTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMatchedExchange = $state(false);
let activeMatchedExchangeId = $state<string | null>(null);
let lastWaitingExchangeId = $state<string | null>(null);
let trackedInitialWaitingExchange = $state(false);

const activeMatchedExchange = $derived(
	data.latestMatchedExchange?.received_anime && data.latestMatchedExchange.id === activeMatchedExchangeId
		? data.latestMatchedExchange
		: null,
);
const tradeStatus = $derived(activeMatchedExchange ? "MATCHED" : data.waitingExchange ? "WAITING" : "IDLE");
const canExchange = $derived(tradeStatus === "IDLE" && Boolean(selectedAnime) && !exchangeSubmitting);
const commentRemaining = $derived(120 - exchangeComment.length);
const selectedSubjectiveTagCount = $derived(selectedSubjectiveTags.length);
const latestCompletedOfferedAnimeId = $derived(
	data.exchanges.find((entry) => entry.status === "matched")?.offered_anime.id ?? null,
);
const showRepeatAnimeWarning = $derived(Boolean(selectedAnime && latestCompletedOfferedAnimeId === selectedAnime.id));

function clearFeedbackTimer() {
	if (feedbackClearTimer) {
		clearTimeout(feedbackClearTimer);
		feedbackClearTimer = null;
	}
}

function clearActionFeedback() {
	clearFeedbackTimer();
	exchangeFeedback = "";
	cancelFeedback = "";
}

function showTransientActionFeedback(type: "exchange" | "cancel", message: string) {
	clearActionFeedback();
	if (type === "exchange") {
		exchangeFeedback = message;
	} else {
		cancelFeedback = message;
	}

	feedbackClearTimer = setTimeout(() => {
		if (type === "exchange" && exchangeFeedback === message) {
			exchangeFeedback = "";
		}
		if (type === "cancel" && cancelFeedback === message) {
			cancelFeedback = "";
		}
		feedbackClearTimer = null;
	}, 4000);
}

onDestroy(clearFeedbackTimer);

$effect(() => {
	if (pendingMatchedExchange && data.latestMatchedExchange?.received_anime) {
		activeMatchedExchangeId = data.latestMatchedExchange.id;
		pendingMatchedExchange = false;
	}
});

$effect(() => {
	const currentWaitingExchangeId = data.waitingExchange?.id ?? null;
	if (!trackedInitialWaitingExchange) {
		lastWaitingExchangeId = currentWaitingExchangeId;
		trackedInitialWaitingExchange = true;
		return;
	}
	if (lastWaitingExchangeId && !currentWaitingExchangeId && data.latestMatchedExchange?.received_anime) {
		activeMatchedExchangeId = data.latestMatchedExchange.id;
	}
	lastWaitingExchangeId = currentWaitingExchangeId;
});

function handleAnimeQueryInput() {
	selectedAnime = null;
	clearActionFeedback();
	exchangeError = "";
	exchangeTagMessage = "";
	if (searchDebounce) clearTimeout(searchDebounce);
	const q = animeQuery.trim();
	if (!q) {
		animeResults = [];
		return;
	}
	searchDebounce = setTimeout(async () => {
		animeSearching = true;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
			animeResults = res.ok ? await res.json() : [];
		} catch {
			animeResults = [];
		}
		animeSearching = false;
	}, 250);
}

function selectAnime(anime: AnimeResult) {
	selectedAnime = anime;
	animeQuery = anime.title;
	animeResults = [];
	clearActionFeedback();
	exchangeError = "";
	exchangeTagMessage = "";
}

function clearAnime() {
	selectedAnime = null;
	animeQuery = "";
	animeResults = [];
}

function isSubjectiveTagSelected(tag: string) {
	return selectedSubjectiveTags.includes(tag);
}

function toggleSubjectiveTag(tag: string) {
	exchangeTagMessage = "";
	if (isSubjectiveTagSelected(tag)) {
		selectedSubjectiveTags = selectedSubjectiveTags.filter((selectedTag) => selectedTag !== tag);
		return;
	}

	if (selectedSubjectiveTagCount >= MAX_EXCHANGE_SUBJECTIVE_TAGS) {
		exchangeTagMessage = "タグは3個まで選択できます";
		return;
	}

	selectedSubjectiveTags = [...selectedSubjectiveTags, tag];
}

function openMyListModal(anime: MyListModalAnime) {
	myListModalAnime = anime;
}

function closeMyListModal() {
	myListModalAnime = null;
}

const handleExchangeSubmit: SubmitFunction = () => {
	enhancedActionHandled = true;
	exchangeSubmitting = true;
	clearActionFeedback();
	exchangeError = "";
	exchangeTagMessage = "";
	cancelError = "";
	pendingMatchedExchange = false;

	return async ({ result, update }) => {
		exchangeSubmitting = false;

		if (result.type === "failure") {
			exchangeError = (result.data as { exchangeMessage?: string })?.exchangeMessage ?? "トレードに失敗しました";
			return;
		}

		const payload =
			result.type === "success"
				? (result.data as {
						exchangeMatched?: boolean;
						receivedAnime?: { id?: string; title?: string; cover_url?: string | null } | null;
					})
				: undefined;

		if (payload?.exchangeMatched) {
			pendingMatchedExchange = true;
		} else {
			showTransientActionFeedback("exchange", "おすすめを預かりました");
		}

		clearAnime();
		exchangeComment = "";
		selectedSubjectiveTags = [];
		await update();
	};
};

function handleStartAnotherTrade() {
	activeMatchedExchangeId = null;
	pendingMatchedExchange = false;
	clearActionFeedback();
}

const handleCancelExchangeSubmit: SubmitFunction = () => {
	enhancedActionHandled = true;
	cancelSubmitting = true;
	clearActionFeedback();
	exchangeError = "";
	exchangeTagMessage = "";
	cancelError = "";

	return async ({ result, update }) => {
		cancelSubmitting = false;

		if (result.type === "failure") {
			cancelError =
				(result.data as { cancelMessage?: string })?.cancelMessage ?? "マッチングのキャンセルに失敗しました";
			await update();
			return;
		}

		showTransientActionFeedback("cancel", "マッチングをキャンセルしました");
		clearAnime();
		exchangeComment = "";
		selectedSubjectiveTags = [];
		await update();
	};
};
</script>

<svelte:head> <title>トレード - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column exchange-page">
		<div class="exchange-container">
			<header class="exchange-header">
				<div>
					<h1>アニメトレード</h1>
				</div>
				<div class="exchange-header-actions">
					<a href="/exchange/history" class="exchange-link">履歴</a>
					<a href="/anime" class="exchange-link">作品を探す</a>
				</div>
			</header>

			<section class="exchange-panel" class:exchange-panel--status={tradeStatus !== "IDLE"}>
				<div class="exchange-copy">
					<h2>1作品を渡して、1作品を受け取る</h2>
				</div>

				{#if exchangeError || (!enhancedActionHandled && form?.exchangeMessage)}
					<p class="form-error">{exchangeError || form?.exchangeMessage}</p>
				{/if}
				{#if exchangeFeedback || (!enhancedActionHandled && form?.exchangeSuccess)}
					<p class="form-success">{exchangeFeedback || "おすすめを預かりました"}</p>
				{/if}
				{#if cancelError || (!enhancedActionHandled && form?.cancelMessage)}
					<p class="form-error">{cancelError || form?.cancelMessage}</p>
				{/if}
				{#if cancelFeedback || (!enhancedActionHandled && form?.cancelSuccess)}
					<p class="form-success">{cancelFeedback || "マッチングをキャンセルしました"}</p>
				{/if}

				{#if tradeStatus === "IDLE"}
					<form
						method="POST"
						action="?/exchangeAnime"
						use:enhance={handleExchangeSubmit}
						class="exchange-form"
					>
						<div class="anime-picker">
							<input
								id="anime-query"
								class="exchange-input"
								type="search"
								placeholder="渡したいアニメをタイトルで検索"
								aria-label="渡したいアニメをタイトルで検索"
								bind:value={animeQuery}
								oninput={handleAnimeQueryInput}
							>
							{#if animeResults.length > 0}
								<div class="anime-results">
									{#each animeResults as anime (anime.id)}
										<button type="button" class="anime-result" onclick={() => selectAnime(anime)}>
											{#if anime.cover_url}
												<img src={anime.cover_url} alt={anime.title}>
											{:else}
												<span class="anime-result-cover"></span>
											{/if}
											<span>
												<strong>{anime.title}</strong>
												{#if anime.title_en}
													<small>{anime.title_en}</small>
												{/if}
											</span>
										</button>
									{/each}
								</div>
							{:else if animeSearching}
								<p class="search-hint">検索中…</p>
							{/if}
							{#if selectedAnime}
								<div class="selected-anime">
									{#if selectedAnime.cover_url}
										<img src={selectedAnime.cover_url} alt={selectedAnime.title}>
									{/if}
									<span>{selectedAnime.title}</span>
									<button type="button" onclick={clearAnime} aria-label="選択を解除">×</button>
								</div>
								<input type="hidden" name="anime_id" value={selectedAnime.id}>
							{/if}
							{#if showRepeatAnimeWarning}
								<p class="exchange-repeat-warning" role="status">
									<span class="i-lucide-megaphone" aria-hidden="true"></span>
									この作品はトレードが集中しています。別のアニメを贈ってみませんか？
								</p>
							{/if}
						</div>

						<div class="exchange-comment-field">
							<textarea
								id="exchange-comment"
								name="comment"
								class="exchange-comment-input"
								placeholder="一言メッセージ（任意）"
								aria-label="一言メッセージ（任意）"
								rows="2"
								maxlength="120"
								bind:value={exchangeComment}
							></textarea>
							<small class:comment-over={commentRemaining < 0}>{commentRemaining}</small>
						</div>

						<div class="exchange-tag-field">
							<div class="exchange-tag-header">
								<span>主観タグ</span>
								<small>{selectedSubjectiveTagCount}/{MAX_EXCHANGE_SUBJECTIVE_TAGS}</small>
							</div>
							<div class="exchange-tag-options">
								{#each EXCHANGE_SUBJECTIVE_TAG_OPTIONS as tag}
									{@const selected = isSubjectiveTagSelected(tag)}
									<button
										type="button"
										class="exchange-tag-chip"
										class:exchange-tag-chip--selected={selected}
										class:exchange-tag-chip--locked={!selected && selectedSubjectiveTagCount >= MAX_EXCHANGE_SUBJECTIVE_TAGS}
										aria-pressed={selected}
										aria-disabled={!selected && selectedSubjectiveTagCount >= MAX_EXCHANGE_SUBJECTIVE_TAGS}
										onclick={() => toggleSubjectiveTag(tag)}
									>
										{tag}
									</button>
								{/each}
							</div>
							{#if exchangeTagMessage}
								<small class="exchange-tag-message">{exchangeTagMessage}</small>
							{/if}
							{#each selectedSubjectiveTags as tag}
								<input type="hidden" name="subjective_tags" value={tag}>
							{/each}
						</div>

						<button type="submit" class="exchange-submit" disabled={!canExchange}>
							{exchangeSubmitting ? "トレード中…" : "トレードする"}
						</button>
					</form>
				{:else if activeMatchedExchange?.received_anime}
					{@const matchedExchange = activeMatchedExchange}
					{@const matchedReceivedAnime = activeMatchedExchange.received_anime}
					<WaitingStatus
						mode="matched"
						offeredAnime={matchedExchange.offered_anime}
						comment={matchedExchange.comment}
						subjectiveTags={matchedExchange.subjective_tags}
						receivedAnime={matchedReceivedAnime}
						receivedComment={matchedExchange.received_comment}
						receivedSubjectiveTags={matchedExchange.received_subjective_tags}
					>
						{#snippet receivedCardActions()}
							<div class="received-card-action">
								<button
									type="button"
									class="btn-action"
									onclick={() => openMyListModal(matchedReceivedAnime)}
								>
									マイリストに追加
								</button>
							</div>
						{/snippet}
						{#snippet actions()}
							<div class="exchange-matched-actions">
								<button
									type="button"
									class="btn-action btn-action--ghost"
									onclick={handleStartAnotherTrade}
								>
									もう一度トレードする
								</button>
								<a href="/?share_exchange={matchedExchange.id}#compose" class="btn-action">
									結果をシェアする
								</a>
							</div>
						{/snippet}
					</WaitingStatus>
				{:else if data.waitingExchange}
					<WaitingStatus
						offeredAnime={data.waitingExchange.offered_anime}
						comment={data.waitingExchange.comment}
						subjectiveTags={data.waitingExchange.subjective_tags}
					>
						{#snippet actions()}
							<form
								class="exchange-waiting-actions"
								method="POST"
								action="?/cancelExchange"
								use:enhance={handleCancelExchangeSubmit}
							>
								<button
									type="submit"
									class="btn-action btn-action--danger-ghost"
									disabled={cancelSubmitting}
								>
									<span class="i-lucide-x" aria-hidden="true"></span>
									{cancelSubmitting ? "キャンセル中…" : "マッチングをやめる"}
								</button>
							</form>
						{/snippet}
					</WaitingStatus>
				{/if}
			</section>

			{#if data.latestMatchedExchange && !activeMatchedExchange}
				{@const latestMatchedExchange = data.latestMatchedExchange}
				{#if latestMatchedExchange.received_anime}
					{@const receivedAnime = latestMatchedExchange.received_anime}
					<section class="received-section">
						<div class="received-section-header">
							<div>
								<span class="received-label">トレード完了</span>
								<h2>最近のトレード結果</h2>
							</div>
						</div>
						<AnimeExchangeResult
							offeredAnime={latestMatchedExchange.offered_anime}
							{receivedAnime}
							offeredComment={latestMatchedExchange.comment}
							receivedComment={latestMatchedExchange.received_comment}
							offeredSubjectiveTags={latestMatchedExchange.subjective_tags}
							receivedSubjectiveTags={latestMatchedExchange.received_subjective_tags}
						>
							{#snippet receivedCardActions()}
								<div class="received-card-action">
									<button
										type="button"
										class="btn-action"
										onclick={() => openMyListModal(receivedAnime)}
									>
										マイリストに追加
									</button>
								</div>
							{/snippet}
							{#snippet actions()}
								<a
									href="/?share_exchange={latestMatchedExchange.id}#compose"
									class="btn-action btn-action--ghost"
								>
									結果をシェアする
								</a>
							{/snippet}
						</AnimeExchangeResult>
					</section>
				{/if}
			{/if}
		</div>

		{#if myListModalAnime}
			<MyListModal
				open
				animeId={myListModalAnime.id}
				animeTitle={myListModalAnime.title}
				episodeCount={myListModalAnime.episode_count ?? null}
				entry={myListModalAnime.user_entry ?? null}
				action="/anime?/upsertWatchlist"
				variant="status-only"
				onclose={closeMyListModal}
			/>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.exchange-page {
	padding: 0;
}

.exchange-container {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.exchange-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 16px;
}

.exchange-header h1,
.exchange-copy h2,
.received-section h2 {
	margin: 0;
	color: var(--color-text);
}

.exchange-header h1 {
	font-size: 1.5rem;
	line-height: 1.2;
}

.exchange-header-actions {
	display: flex;
	align-items: center;
	gap: 16px;
}

.exchange-link {
	color: var(--color-accent);
	font-weight: 700;
	font-size: 0.9rem;
}

.exchange-panel {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.exchange-panel--status {
	padding: 0;
	border: 0;
	background: transparent;
	gap: 12px;
}

.exchange-copy {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.exchange-copy h2,
.received-section h2 {
	font-size: 1rem;
}

.exchange-form {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 12px;
	align-items: end;
}

.anime-picker {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.exchange-comment-field,
.exchange-tag-field {
	grid-column: 1 / -1;
	min-width: 0;
}

.exchange-tag-field {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.exchange-input,
.exchange-comment-input {
	width: 100%;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
}

.exchange-comment-input {
	display: block;
	min-height: 72px;
	resize: vertical;
	line-height: 1.5;
}

.exchange-comment-field small {
	display: block;
	margin-top: 4px;
	color: var(--color-text-muted);
	font-size: 0.75rem;
	text-align: right;
}

.exchange-comment-field small.comment-over {
	color: var(--color-danger);
}

.exchange-tag-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	color: var(--color-text-muted);
	font-size: 0.78rem;
	font-weight: 800;
}

.exchange-tag-header small {
	font-size: 0.74rem;
	font-weight: 700;
}

.exchange-tag-options {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.exchange-tag-chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 32px;
	padding: 0 10px;
	border: 1px solid color-mix(in srgb, var(--color-accent) 24%, var(--color-border));
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-surface-hover) 80%, transparent);
	color: var(--color-text);
	font-size: 0.82rem;
	font-weight: 700;
	line-height: 1;
	transition:
		background 0.16s ease,
		border-color 0.16s ease,
		color 0.16s ease,
		opacity 0.16s ease;
}

.exchange-tag-chip:hover {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.exchange-tag-chip--selected {
	border-color: var(--color-accent);
	background: var(--color-accent);
	color: #fff;
}

.exchange-tag-chip--locked:not(.exchange-tag-chip--selected) {
	opacity: 0.45;
	cursor: not-allowed;
}

.exchange-tag-message {
	color: var(--color-danger);
	font-size: 0.75rem;
}

.exchange-input:focus,
.exchange-comment-input:focus {
	outline: none;
	border-color: var(--color-accent);
}

.anime-results {
	position: absolute;
	z-index: 20;
	top: calc(100% + 6px);
	left: 0;
	right: 0;
	max-height: 280px;
	overflow-y: auto;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}

.anime-result {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 9px 10px;
	text-align: left;
	background: transparent;
	border-bottom: 1px solid var(--color-border);
}

.anime-result:last-child {
	border-bottom: none;
}

.anime-result:hover {
	background: var(--color-surface-hover);
}

.anime-result img,
.anime-result-cover,
.selected-anime img {
	width: 40px;
	border-radius: 4px;
	background: var(--color-border);
	flex: 0 0 auto;
}
.anime-result img,
.selected-anime img {
	display: block;
	image-rendering: auto;
}
.anime-result-cover {
	aspect-ratio: 5 / 7;
}

.anime-result span:last-child {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.anime-result strong,
.anime-result small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.anime-result small,
.search-hint {
	color: var(--color-text-muted);
	font-size: 0.8rem;
}

.selected-anime {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	max-width: 100%;
	padding: 8px 10px;
	border: 1px solid var(--color-accent);
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	color: var(--color-text);
}

.selected-anime span {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.selected-anime button {
	color: var(--color-text-muted);
	font-size: 1.1rem;
}

.exchange-repeat-warning {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin: 0;
	color: var(--color-text-muted);
	font-size: 0.82rem;
	font-weight: 700;
	line-height: 1.45;
}

.exchange-repeat-warning :global(.i-lucide-megaphone) {
	color: var(--status-plan);
	flex: 0 0 auto;
	font-size: 1rem;
}

.exchange-submit,
.btn-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 42px;
	padding: 0 18px;
	border-radius: 8px;
	background: var(--color-accent);
	color: #fff;
	font-weight: 700;
	white-space: nowrap;
}

.exchange-submit {
	align-self: start;
}

.exchange-submit:disabled,
.btn-action:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.form-error,
.form-success {
	margin: 0;
	font-size: 0.86rem;
}

.form-error {
	color: var(--color-danger);
}

.form-success {
	color: var(--status-watching);
}

.received-section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.received-section-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 12px;
}

.received-label {
	color: var(--status-watching);
	font-size: 0.78rem;
	font-weight: 800;
}

.exchange-waiting-actions {
	display: flex;
	justify-content: center;
	margin: 0;
}

.exchange-matched-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	justify-content: center;
}

.btn-action {
	min-height: 36px;
	font-size: 0.85rem;
}

.btn-action--ghost {
	background: transparent;
	color: var(--color-accent);
	border: 1px solid var(--color-accent);
}

.btn-action--danger-ghost {
	min-height: 34px;
	padding-inline: 12px;
	background: transparent;
	color: var(--color-danger);
	border: 1px solid color-mix(in srgb, var(--color-danger) 52%, var(--color-border));
}

.btn-action--danger-ghost:hover {
	background: color-mix(in srgb, var(--color-danger) 10%, transparent);
	border-color: var(--color-danger);
}

.btn-action--danger-ghost :global(.i-lucide-x) {
	font-size: 1rem;
}

.received-card-action,
.received-card-action .btn-action {
	width: 100%;
}

@media (max-width: 640px) {
	.exchange-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.exchange-form {
		grid-template-columns: 1fr;
	}

	.exchange-submit {
		width: 100%;
	}
}
</style>
