<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

interface AnimeResult {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
}

interface ExchangeReceivedAnime {
	id: string;
	title: string;
	cover_url: string | null;
}

let { data, form }: PageProps = $props();

let animeQuery = $state("");
let animeResults = $state<AnimeResult[]>([]);
let exchangeComment = $state("");
let selectedAnime = $state<AnimeResult | null>(null);
let animeSearching = $state(false);
let searchDebounce = $state<ReturnType<typeof setTimeout> | null>(null);
let exchangeSubmitting = $state(false);
let exchangeFeedback = $state("");
let exchangeError = $state("");
let latestReceived = $state<ExchangeReceivedAnime | null>(null);
let listSubmitting = $state(false);
let listFeedback = $state("");
let listError = $state("");

const canExchange = $derived(Boolean(selectedAnime) && !exchangeSubmitting);
const commentRemaining = $derived(120 - exchangeComment.length);

function handleAnimeQueryInput() {
	selectedAnime = null;
	exchangeFeedback = "";
	exchangeError = "";
	latestReceived = null;
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
	exchangeFeedback = "";
	exchangeError = "";
	latestReceived = null;
}

function clearAnime() {
	selectedAnime = null;
	animeQuery = "";
	animeResults = [];
}

const handleAddToMyListSubmit: SubmitFunction = () => {
	listSubmitting = true;
	listFeedback = "";
	listError = "";

	return async ({ result, update }) => {
		listSubmitting = false;

		if (result.type === "failure") {
			listError = (result.data as { listMessage?: string })?.listMessage ?? "マイリスト更新に失敗しました";
			return;
		}

		listFeedback = "マイリストに追加しました";
		await update();
	};
};

const handleExchangeSubmit: SubmitFunction = () => {
	exchangeSubmitting = true;
	exchangeFeedback = "";
	exchangeError = "";
	latestReceived = null;

	return async ({ result, update }) => {
		exchangeSubmitting = false;

		if (result.type === "failure") {
			exchangeError = (result.data as { exchangeMessage?: string })?.exchangeMessage ?? "交換に失敗しました";
			return;
		}

		const payload =
			result.type === "success"
				? (result.data as {
						exchangeMatched?: boolean;
						receivedAnime?: { id?: string; title?: string; cover_url?: string | null } | null;
					})
				: undefined;

		if (payload?.exchangeMatched && payload.receivedAnime?.id && payload.receivedAnime?.title) {
			latestReceived = {
				id: payload.receivedAnime.id,
				title: payload.receivedAnime.title,
				cover_url: payload.receivedAnime.cover_url ?? null,
			};
			exchangeFeedback = `「${payload.receivedAnime.title}」が返ってきました！`;
		} else {
			exchangeFeedback = "おすすめをプールに追加しました。次の交換で受け取れます。";
		}

		clearAnime();
		exchangeComment = "";
		await update();
	};
};
</script>

<svelte:head> <title>交流 - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column exchange-page">
		<div class="exchange-container">
			<header class="exchange-header">
				<div>
					<p class="exchange-kicker">交流</p>
					<h1>アニメ交換</h1>
				</div>
				<a href="/anime" class="exchange-link">作品を探す</a>
			</header>

			<section class="exchange-panel">
				<div class="exchange-copy">
					<h2>1作品を渡して、1作品を受け取る</h2>
					<p>あなたのおすすめは匿名でプールに入り、先に入っていた誰かのおすすめが返ってきます。</p>
				</div>

				{#if data.waitingExchange}
					<div class="waiting-strip">
						<span class="waiting-dot"></span>
						<span>「{data.waitingExchange.offered_anime.title}」は次の交換相手を待機中です</span>
					</div>
				{/if}

				{#if form?.exchangeMessage || exchangeError}
					<p class="form-error">{exchangeError || form?.exchangeMessage}</p>
				{/if}
				{#if form?.exchangeSuccess || exchangeFeedback}
					<p class="form-success">{exchangeFeedback || "交換を受け付けました"}</p>
				{/if}
				{#if listError}
					<p class="form-error">{listError}</p>
				{/if}
				{#if listFeedback}
					<p class="form-success">{listFeedback}</p>
				{/if}

				{#if latestReceived}
					<div class="instant-result">
						{#if latestReceived.cover_url}
							<img src={latestReceived.cover_url} alt={latestReceived.title}>
						{:else}
							<div class="received-cover-empty"></div>
						{/if}
						<div>
							<span class="history-label">今回返ってきた作品</span>
							<a href="/anime/{latestReceived.id}" class="received-title">{latestReceived.title}</a>
						</div>
					</div>
				{/if}

				<form method="POST" action="?/exchangeAnime" use:enhance={handleExchangeSubmit} class="exchange-form">
					<div class="anime-picker">
						<label for="anime-query">渡したいアニメ</label>
						<input
							id="anime-query"
							class="exchange-input"
							type="search"
							placeholder="タイトルで検索"
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
					</div>

					<div class="exchange-comment-field">
						<label for="exchange-comment">一言コメント</label>
						<textarea
							id="exchange-comment"
							name="comment"
							class="exchange-comment-input"
							placeholder="この作品をすすめたい理由を一言"
							rows="2"
							maxlength="120"
							bind:value={exchangeComment}
						></textarea>
						<small class:comment-over={commentRemaining < 0}>{commentRemaining}</small>
					</div>

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

					<button type="submit" class="exchange-submit" disabled={!canExchange}>
						{exchangeSubmitting ? "交換中…" : "交換する"}
					</button>
				</form>
			</section>

			{#if data.latestMatchedExchange}
				{@const latestMatchedExchange = data.latestMatchedExchange}
				{#if latestMatchedExchange.received_anime}
					{@const receivedAnime = latestMatchedExchange.received_anime}
					<section class="received-section">
						<div class="received-section-header">
							<div>
								<span class="received-label">交換完了</span>
								<h2>最近の交換結果</h2>
							</div>
						</div>
						<AnimeExchangeResult
							offeredAnime={latestMatchedExchange.offered_anime}
							{receivedAnime}
							offeredComment={latestMatchedExchange.comment}
							receivedComment={latestMatchedExchange.received_comment}
						>
							{#snippet actions()}
								<a
									href="/?share_exchange={latestMatchedExchange.id}#compose"
									class="btn-action btn-action--ghost"
								>
									結果をシェアする
								</a>
								<form
									class="received-action-push"
									method="POST"
									action="?/addToMyList"
									use:enhance={handleAddToMyListSubmit}
								>
									<input type="hidden" name="anime_id" value={receivedAnime.id}>
									<input type="hidden" name="status" value="plan_to_watch">
									<input type="hidden" name="progress" value="0">
									<button type="submit" class="btn-action" disabled={listSubmitting}>
										{listSubmitting ? "追加中…" : "マイリストに追加"}
									</button>
								</form>
							{/snippet}
						</AnimeExchangeResult>
					</section>
				{/if}
			{/if}

			<section class="history-section">
				<h2>交換履歴</h2>
				{#if data.exchanges.length === 0}
					<p class="empty-history">まだ交換履歴はありません。</p>
				{:else}
					<div class="history-list">
						{#each data.exchanges as exchange (exchange.id)}
							<article class="history-item">
								<div class="history-anime">
									{#if exchange.offered_anime.cover_url}
										<img src={exchange.offered_anime.cover_url} alt={exchange.offered_anime.title}>
									{:else}
										<span class="history-cover-empty"></span>
									{/if}
									<div>
										<span class="history-label">渡した作品</span>
										<a href="/anime/{exchange.offered_anime.id}">{exchange.offered_anime.title}</a>
										{#if exchange.comment}
											<p class="history-comment">{exchange.comment}</p>
										{/if}
									</div>
								</div>
								<div class="history-arrow">→</div>
								<div class="history-anime">
									{#if exchange.received_anime?.cover_url}
										<img
											src={exchange.received_anime.cover_url}
											alt={exchange.received_anime.title}
										>
									{:else}
										<span class="history-cover-empty"></span>
									{/if}
									<div>
										<span class="history-label"
											>{exchange.status === "waiting" ? "待機中" : "届いたおすすめ"}</span
										>
										{#if exchange.received_anime}
											<a href="/anime/{exchange.received_anime.id}"
												>{exchange.received_anime.title}</a
											>
											{#if exchange.received_comment}
												<p class="history-comment">{exchange.received_comment}</p>
											{/if}
										{:else}
											<span class="history-muted">次の交換相手を待っています</span>
										{/if}
									</div>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		</div>
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
	gap: 20px;
}

.exchange-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 16px;
}

.exchange-kicker {
	color: var(--color-accent);
	font-size: 0.82rem;
	font-weight: 700;
	margin: 0 0 2px;
}

.exchange-header h1,
.exchange-copy h2,
.received-section h2,
.history-section h2 {
	margin: 0;
	color: var(--color-text);
}

.exchange-header h1 {
	font-size: 1.7rem;
	line-height: 1.2;
}

.exchange-link {
	color: var(--color-accent);
	font-weight: 700;
	font-size: 0.9rem;
}

.exchange-panel,
.history-item,
.instant-result {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
}

.exchange-panel {
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.exchange-copy {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.exchange-copy h2,
.received-section h2,
.history-section h2 {
	font-size: 1rem;
}

.exchange-copy p {
	color: var(--color-text-muted);
	font-size: 0.9rem;
	margin: 0;
	line-height: 1.7;
}

.waiting-strip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--status-plan) 12%, transparent);
	color: var(--color-text);
	font-size: 0.86rem;
}

.waiting-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--status-plan);
	flex: 0 0 auto;
}

.instant-result {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px;
}

.exchange-form {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 12px;
	align-items: end;
}

.anime-picker {
	position: relative;
	min-width: 0;
}

.anime-picker label,
.exchange-comment-field label {
	display: block;
	color: var(--color-text-muted);
	font-size: 0.8rem;
	font-weight: 700;
	margin-bottom: 6px;
}

.exchange-comment-field {
	grid-column: 1 / -1;
	min-width: 0;
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
.selected-anime img,
.received-cover-empty,
.history-anime img,
.history-cover-empty,
.instant-result img {
	width: 40px;
	height: 56px;
	border-radius: 4px;
	object-fit: cover;
	background: var(--color-border);
	flex: 0 0 auto;
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
.search-hint,
.history-label,
.history-muted,
.empty-history {
	color: var(--color-text-muted);
	font-size: 0.8rem;
}

.selected-anime {
	grid-column: 1 / -1;
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

.exchange-submit,
.btn-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 42px;
	padding: 0 18px;
	border-radius: 8px;
	background: var(--color-accent);
	color: #fff;
	font-weight: 700;
	white-space: nowrap;
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

.received-section,
.history-section {
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

.received-cover-empty {
	width: 82px;
	height: 116px;
}

.received-label {
	color: var(--status-watching);
	font-size: 0.78rem;
	font-weight: 800;
}

.received-title {
	color: var(--color-text);
	font-size: 1.1rem;
	font-weight: 800;
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

.received-action-push {
	margin-left: auto;
}

.history-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.history-item {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
	gap: 10px;
	align-items: center;
	padding: 12px;
}

.history-anime {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.history-anime div {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.history-anime a,
.history-muted {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.history-anime a {
	color: var(--color-text);
	font-weight: 700;
	font-size: 0.9rem;
}

.history-comment {
	margin: 3px 0 0;
	color: var(--color-text-muted);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.history-arrow {
	color: var(--color-text-muted);
	text-align: center;
}

@media (max-width: 640px) {
	.exchange-header,
	.instant-result {
		align-items: flex-start;
		flex-direction: column;
	}

	.exchange-form,
	.history-item {
		grid-template-columns: 1fr;
	}

	.exchange-submit {
		width: 100%;
	}

	.history-arrow {
		text-align: left;
		transform: rotate(90deg);
		width: 24px;
	}
}
</style>
