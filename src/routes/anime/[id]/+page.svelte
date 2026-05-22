<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import type { AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

interface UserResult {
	id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
}

let { data, form }: PageProps = $props();

const displayStudios = $derived(data.anime.studio ?? []);
const displayGenres = $derived(data.anime.genre ?? []);
const displayOfficialLinks = $derived(
	buildDisplayOfficialLinks(data.anime.official_site_url, data.anime.official_x_url),
);
const displayResources = $derived(
	buildDisplayResources(
		data.anime.resources,
		data.anime.mal_id,
		data.anime.official_site_url,
		data.anime.official_x_url,
	),
);

const statusOptions: { value: AnimeStatus; label: string }[] = [
	{ value: "watching", label: "視聴中" },
	{ value: "completed", label: "完了" },
	{ value: "plan_to_watch", label: "視聴予定" },
	{ value: "on_hold", label: "一時停止" },
	{ value: "dropped", label: "断念" },
];

const broadcastLabels: Record<string, string> = {
	airing: "放送中",
	upcoming: "放送予定",
	finished: "放送終了",
	unknown: "未定",
};
const listedUserStatusColors: Record<string, string> = {
	watching: "#34d399",
	completed: "var(--accent, #6366f1)",
	plan_to_watch: "#60a5fa",
	on_hold: "#fbbf24",
	dropped: "#f87171",
};
const listedUserStatusLabels: Record<string, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断中",
	dropped: "断念",
};

function formatAiredPeriod(airedFrom: string | null, airedTo: string | null): string | null {
	if (!airedFrom) return null;
	return `${airedFrom.slice(0, 10)} 〜 ${airedTo ? airedTo.slice(0, 10) : "未定"}`;
}

function isHttpUrl(url: string | null | undefined): url is string {
	return typeof url === "string" && /^https?:\/\//i.test(url);
}

function buildDisplayOfficialLinks(officialSiteUrl: string | null, officialXUrl: string | null) {
	const links: { name: string; url: string }[] = [];

	if (isHttpUrl(officialSiteUrl)) links.push({ name: "公式サイト", url: officialSiteUrl });
	if (isHttpUrl(officialXUrl)) links.push({ name: "X (Twitter)", url: officialXUrl });

	return dedupeLinks(links);
}

function buildDisplayResources(
	resources: { name: string; url: string }[],
	malId: number | null,
	officialSiteUrl: string | null,
	officialXUrl: string | null,
) {
	const links: { name: string; url: string }[] = [];

	if (malId) links.push({ name: "MAL", url: "https://myanimelist.net/" });
	links.push(
		...resources
			.filter((resource) => resource.name && isHttpUrl(resource.url))
			.map((resource) => {
				if (isMalUrl(resource.url) || resource.name.toLowerCase() === "mal") {
					return { name: "MAL", url: "https://myanimelist.net/" };
				}
				if (resource.name === "Home" || resource.name.toLowerCase() === "official site") {
					return null;
				}
				if (resource.url === officialSiteUrl || resource.url === officialXUrl) return null;
				return resource;
			})
			.filter((resource): resource is { name: string; url: string } => resource !== null),
	);

	return dedupeLinks(links);
}

function dedupeLinks(links: { name: string; url: string }[]) {
	const seen = new Set<string>();
	return links.filter((link) => {
		const key = link.url.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function isMalUrl(url: string) {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname === "myanimelist.net" || hostname.endsWith(".myanimelist.net");
	} catch {
		return false;
	}
}

let selectedStatus = $state<AnimeStatus>("plan_to_watch");
let score = $state<string>("");
let progress = $state<string>("0");
let showRemoveWatchlistModal = $state(false);
let removeWatchlistFormEl = $state<HTMLFormElement | null>(null);

$effect(() => {
	selectedStatus = data.anime.user_entry?.status ?? "plan_to_watch";
	score = data.anime.user_entry?.score != null ? String(data.anime.user_entry.score) : "";
	progress = String(data.anime.user_entry?.progress ?? 0);
});

let coverUrl = $state("");

$effect(() => {
	coverUrl = data.anime.cover_url ?? "";
});

async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
	return new Promise((resolve) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(url);
			const ratio = Math.min(maxWidth / img.width, 1);
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(img.width * ratio);
			canvas.height = Math.round(img.height * ratio);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				resolve(file);
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.95);
		};
		img.src = url;
	});
}
let coverUploading = $state(false);
let coverError = $state("");

async function uploadCover(e: Event) {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	coverUploading = true;
	coverError = "";
	const resized = await resizeImage(file, 2000);
	const form = new FormData();
	form.append("file", resized, file.name.replace(/\.[^.]+$/, ".jpg"));
	form.append("anime_id", String(data.anime.id));

	const res = await fetch("/api/upload/anime-cover", { method: "POST", body: form });
	if (res.ok) {
		const json = await res.json();
		coverUrl = json.url;
	} else {
		const json = await res.json().catch(() => ({}));
		coverError = json.message ?? "アップロードに失敗しました";
	}
	coverUploading = false;
	input.value = "";
}
let recipientQuery = $state("");
let recipientResults = $state<UserResult[]>([]);
let selectedRecipient = $state<UserResult | null>(null);
let recipientSearching = $state(false);
let recipientDebounce = $state<ReturnType<typeof setTimeout> | null>(null);
let recommendSubmitting = $state(false);
let recommendFeedback = $state("");
let recommendError = $state("");

function handleRecipientInput() {
	selectedRecipient = null;
	recommendFeedback = "";
	recommendError = "";
	if (recipientDebounce) clearTimeout(recipientDebounce);
	const q = recipientQuery.trim().replace(/^@/, "");
	if (q.length === 0) {
		recipientResults = [];
		return;
	}
	recipientDebounce = setTimeout(async () => {
		recipientSearching = true;
		try {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
			const users: UserResult[] = res.ok ? await res.json() : [];
			recipientResults = users.filter((user) => user.id !== data.user?.id);
		} catch {
			recipientResults = [];
		}
		recipientSearching = false;
	}, 250);
}

function selectRecipient(user: UserResult) {
	selectedRecipient = user;
	recipientQuery = `@${user.username}`;
	recipientResults = [];
	recommendFeedback = "";
	recommendError = "";
}

function clearRecipient() {
	selectedRecipient = null;
	recipientQuery = "";
	recipientResults = [];
}

const handleRecommendSubmit: SubmitFunction = () => {
	recommendSubmitting = true;
	recommendFeedback = "";
	recommendError = "";
	return async ({ result, update }) => {
		recommendSubmitting = false;
		if (result.type === "failure") {
			recommendError =
				(result.data as { recommendMessage?: string })?.recommendMessage ?? "推薦の送信に失敗しました";
		} else {
			recommendFeedback = "推薦を送信しました";
			clearRecipient();
			await update();
		}
	};
};
</script>

<svelte:head> <title>{data.anime.title} — Anipolis</title> </svelte:head>

<div class="detail-page">
	<a href="/anime" class="back-link">← アニメ一覧</a>

	<div class="anime-layout">
		<!-- Left: Cover + production info -->
		<aside class="left-panel">
			<div class="anime-cover">
				{#if coverUrl}
					<img src={coverUrl} alt={data.anime.title}>
				{:else}
					<div class="anime-cover-placeholder">
						<svg
							width="56"
							height="56"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<rect x="2" y="2" width="20" height="20" rx="2" />
							<path d="M10 8l6 4-6 4V8z" />
						</svg>
					</div>
				{/if}
				{#if data.isAdmin}
					<label class="cover-upload-btn" title="カバー画像を変更" class:uploading={coverUploading}>
						{#if coverUploading}
							<span>...</span>
						{:else}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
						{/if}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp"
							onchange={uploadCover}
							disabled={coverUploading}
						>
					</label>
				{/if}
			</div>
			{#if coverError}
				<p class="cover-error">{coverError}</p>
			{/if}

			{#if data.anime.copyright}
				<p class="copyright-notice">{data.anime.copyright}</p>
			{/if}

			<!-- Production info below cover -->
			{#if displayStudios.length || data.anime.producer?.length || data.anime.source || displayGenres.length || data.anime.official_hashtag?.length || displayOfficialLinks.length}
				<dl class="prod-info">
					{#if displayStudios.length}
						<div class="prod-row prod-row--wrap">
							<dt>スタジオ</dt>
							<dd class="genre-list">
								{#each displayStudios as s}
									<a href="/anime?studio={encodeURIComponent(s)}" class="genre-chip">{s}</a>
								{/each}
							</dd>
						</div>
					{/if}
					{#if data.anime.producer?.length}
						<div class="prod-row prod-row--wrap">
							<dt>制作</dt>
							<dd class="genre-list">
								{#each data.anime.producer as p}
									<a href="/anime?producer={encodeURIComponent(p)}" class="genre-chip">{p}</a>
								{/each}
							</dd>
						</div>
					{/if}
					{#if data.anime.source}
						<div class="prod-row">
							<dt>原作</dt>
							<dd>{data.anime.source}</dd>
						</div>
					{/if}
					{#if displayGenres.length}
						<div class="prod-row prod-row--wrap">
							<dt>ジャンル</dt>
							<dd class="genre-list">
								{#each displayGenres as g}
									<a href="/anime?genre={encodeURIComponent(g)}" class="genre-chip">{g}</a>
								{/each}
							</dd>
						</div>
					{/if}
					{#if data.anime.official_hashtag?.length}
						<div class="prod-row prod-row--wrap">
							<dt>ハッシュタグ</dt>
							<dd class="genre-list">
								{#each data.anime.official_hashtag as tag}
									<a href="/hashtag/{tag.replace(/^#/, '')}" class="hashtag-link"
										>#{tag.replace(/^#/, '')}</a
									>
								{/each}
							</dd>
						</div>
					{/if}
					{#if displayOfficialLinks.length}
						<div class="prod-row prod-row--wrap">
							<dt>公式リンク</dt>
							<dd class="links-list">
								{#each displayOfficialLinks as resource (resource.url)}
									<a
										href={resource.url}
										target="_blank"
										rel="noopener noreferrer"
										class="official-link"
										>{resource.name}</a
									>
								{/each}
							</dd>
						</div>
					{/if}
				</dl>
			{/if}
			{#if displayResources.length}
				<div class="resource-links">
					<div class="resource-links-title">Resources</div>
					<div class="links-list">
						{#each displayResources as resource (resource.url)}
							<a
								href={resource.url}
								target="_blank"
								rel="noopener noreferrer"
								class:resource-link--muted={resource.name === 'MAL'}
								class="official-link resource-link"
								>{resource.name}</a
							>
						{/each}
					</div>
				</div>
			{/if}
		</aside>

		<!-- Main: title, score, synopsis, watchlist -->
		<div class="main-content">
			<div class="title-block">
				<h1 class="anime-title">{data.anime.title}</h1>
				{#if data.anime.title_en}
					<p class="anime-title-en">{data.anime.title_en}</p>
				{/if}
				<div class="meta-row">
					<span class="status-badge status-{data.anime.computed_broadcast_status}">
						{broadcastLabels[data.anime.computed_broadcast_status] ?? data.anime.computed_broadcast_status}
					</span>
					{#if data.anime.type}
						<span class="meta-chip">{data.anime.type}</span>
					{/if}
					{#if data.anime.season}
						<a
							href="/anime?season={encodeURIComponent(data.anime.season)}"
							class="meta-chip meta-chip--link"
							>{data.anime.season}</a
						>
					{/if}
					{#if data.anime.episode_count}
						<span class="meta-chip">{data.anime.episode_count}話</span>
					{/if}
					{#if data.anime.aired_from}
						<span class="meta-chip aired">
							{formatAiredPeriod(data.anime.aired_from, data.anime.aired_to)}
						</span>
					{/if}
				</div>
			</div>

			<!-- 引用投稿 -->
			{#if data.user}
				<div class="quote-post-bar">
					<a href="/?quote_anime={data.anime.id}" class="btn-quote-post">
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
						この作品について投稿
					</a>
				</div>
			{/if}

			<!-- Score hero -->
			<div class="stats-grid">
				{#if data.anime.avg_score != null}
					<div class="stat-card stat-card--score">
						<span class="stat-card-label">スコア</span>
						<span class="stat-card-value">★ {data.anime.avg_score.toFixed(2)}</span>
						{#if data.anime.score_count}
							<span class="stat-card-sub">{data.anime.score_count}件の評価</span>
						{/if}
					</div>
				{/if}
				{#if data.anime.list_count}
					<div class="stat-card">
						<span class="stat-card-label">リスト登録</span>
						<span class="stat-card-value">{data.anime.list_count}</span>
						<span class="stat-card-sub">ユーザー</span>
					</div>
				{/if}
			</div>

			<!-- Synopsis -->
			{#if data.anime.synopsis}
				<section class="synopsis">
					<h2>あらすじ</h2>
					<p>{data.anime.synopsis}</p>
				</section>
			{/if}

			<!-- Watchlist -->
			{#if data.user}
				<section class="watchlist-section">
					<h2>マイリスト</h2>

					{#if form?.message}
						<p class="form-error">{form.message}</p>
					{/if}

					<form method="POST" action="?/upsertWatchlist" use:enhance>
						<input type="hidden" name="anime_id" value={data.anime.id}>

						<div class="form-row">
							<label class="form-label">
								ステータス
								<select name="status" bind:value={selectedStatus} class="form-select">
									{#each statusOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>

							<label class="form-label">
								スコア (1〜10)
								<input
									type="number"
									name="score"
									min="1"
									max="10"
									step="0.5"
									bind:value={score}
									placeholder="未評価"
									class="form-input"
								>
							</label>

							{#if data.anime.episode_count}
								<label class="form-label">
									進捗 ({data.anime.episode_count}話中)
									<input
										type="number"
										name="progress"
										min="0"
										max={data.anime.episode_count}
										bind:value={progress}
										class="form-input"
									>
								</label>
							{:else}
								<label class="form-label">
									進捗
									<input
										type="number"
										name="progress"
										min="0"
										bind:value={progress}
										class="form-input"
									>
								</label>
							{/if}
						</div>

						<div class="form-actions">
							<button
								type="submit"
								class="btn-primary {data.anime.user_entry ? 'btn-primary--update' : 'btn-primary--add'}"
							>
								{#if data.anime.user_entry}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M20 6L9 17l-5-5" />
									</svg>
									更新
								{:else}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<line x1="12" y1="5" x2="12" y2="19" />
										<line x1="5" y1="12" x2="19" y2="12" />
									</svg>
									マイリストに追加
								{/if}
							</button>

							{#if data.anime.user_entry}
								<button
									type="button"
									class="btn-danger"
									onclick={() => (showRemoveWatchlistModal = true)}
								>
									削除
								</button>
							{/if}
						</div>
					</form>

					<form
						method="POST"
						action="?/removeWatchlist"
						bind:this={removeWatchlistFormEl}
						style="display:none"
					>
						<input type="hidden" name="anime_id" value={data.anime.id}>
					</form>

					{#if showRemoveWatchlistModal}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="remove-watchlist-modal-overlay"
							role="presentation"
							onclick={() => (showRemoveWatchlistModal = false)}
						>
							<div
								class="remove-watchlist-modal-card"
								role="dialog"
								aria-modal="true"
								aria-labelledby="remove-watchlist-modal-title"
								tabindex="-1"
								onclick={(e) => e.stopPropagation()}
							>
								<div class="remove-watchlist-modal-header">
									<span id="remove-watchlist-modal-title" class="remove-watchlist-modal-title"
										>マイリストから削除</span
									>
								</div>
								<div class="remove-watchlist-modal-body">
									<p>このアニメをマイリストから削除しますか？</p>
								</div>
								<div class="remove-watchlist-modal-footer">
									<button
										type="button"
										class="btn btn-ghost"
										onclick={() => (showRemoveWatchlistModal = false)}
									>
										キャンセル
									</button>
									<button
										type="button"
										class="btn btn-danger"
										onclick={() => { showRemoveWatchlistModal = false; removeWatchlistFormEl?.requestSubmit(); }}
									>
										削除する
									</button>
								</div>
							</div>
						</div>
					{/if}
				</section>
			{:else}
				<section class="watchlist-section watchlist-section--guest">
					<p class="login-prompt"><a href="/" class="login-prompt-link">ログイン</a>してマイリストに追加</p>
				</section>
			{/if}

			{#if data.user}
				<section class="recommend-section">
					<h2>作品を推薦</h2>

					{#if form?.recommendMessage || recommendError}
						<p class="form-error">{recommendError || form?.recommendMessage}</p>
					{/if}
					{#if form?.recommendSuccess || recommendFeedback}
						<p class="form-success">{recommendFeedback || '推薦を送信しました'}</p>
					{/if}

					<form
						method="POST"
						action="?/recommendAnime"
						use:enhance={handleRecommendSubmit}
						class="recommend-form"
					>
						<input type="hidden" name="anime_id" value={data.anime.id}>
						<input type="hidden" name="recipient_id" value={selectedRecipient?.id ?? ''}>

						<div class="recommend-recipient-field">
							<label class="form-label">
								相手
								<input
									type="search"
									class="form-input recommend-user-input"
									placeholder="@username"
									bind:value={recipientQuery}
									oninput={handleRecipientInput}
									autocomplete="off"
								>
							</label>

							{#if selectedRecipient}
								<div class="selected-recipient">
									{#if selectedRecipient.avatar_url}
										<img src={selectedRecipient.avatar_url} alt={selectedRecipient.username}>
									{/if}
									<span>{selectedRecipient.display_name ?? selectedRecipient.username}</span>
									<button type="button" onclick={clearRecipient} aria-label="相手をクリア">×</button>
								</div>
							{/if}

							{#if recipientResults.length > 0}
								<div class="recommend-user-results">
									{#each recipientResults as user (user.id)}
										<button
											type="button"
											class="recommend-user-result"
											onclick={() => selectRecipient(user)}
										>
											{#if user.avatar_url}
												<img src={user.avatar_url} alt={user.username}>
											{:else}
												<span class="recommend-user-avatar-fallback">
													{(user.display_name ?? user.username).charAt(0).toUpperCase()}
												</span>
											{/if}
											<span>
												<strong>{user.display_name ?? user.username}</strong>
												<small>@{user.username}</small>
											</span>
										</button>
									{/each}
								</div>
							{:else if recipientSearching}
								<p class="recommend-search-hint">検索中…</p>
							{/if}
						</div>

						<button
							type="submit"
							class="btn-primary recommend-submit"
							disabled={!selectedRecipient || recommendSubmitting}
						>
							{recommendSubmitting ? '送信中…' : '推薦する'}
						</button>
					</form>
				</section>
			{/if}

			{#if data.listedUsers.length > 0}
				<section class="listed-users-section">
					<h2 class="listed-users-heading">
						リスト登録中のユーザー
						<span class="listed-users-count">{data.listedUsers.length}</span>
					</h2>
					<div class="listed-users-grid">
						{#each data.listedUsers as u (u.user_id)}
							<a href="/profile/{u.username}" class="listed-user-card">
								<div class="listed-user-avatar">
									{#if u.avatar_url}
										<img src={u.avatar_url} alt={u.username}>
									{:else}
										<div class="listed-user-avatar-fallback">
											{(u.display_name ?? u.username).charAt(0).toUpperCase()}
										</div>
									{/if}
									<span
										class="listed-user-status-dot"
										style="background: {listedUserStatusColors[u.status] ?? 'var(--fg-muted)'};"
										title={listedUserStatusLabels[u.status] ?? u.status}
									></span>
								</div>
								<span class="listed-user-name">{u.display_name ?? u.username}</span>
								{#if u.score != null}
									<span class="listed-user-score">★{u.score}</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
.remove-watchlist-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgba(0, 0, 0, 0.58);
	backdrop-filter: blur(3px);
}

.remove-watchlist-modal-card {
	width: min(360px, 100%);
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-bg-card);
	box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.remove-watchlist-modal-header {
	padding: 16px 16px 0;
}

.remove-watchlist-modal-title {
	font-size: 15px;
	font-weight: 800;
}

.remove-watchlist-modal-body {
	padding: 12px 16px 16px;
	color: var(--color-text-secondary);
	font-size: 14px;
}

.remove-watchlist-modal-body p {
	margin: 0;
}

.remove-watchlist-modal-footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 16px;
	border-top: 1px solid var(--color-border);
}

.detail-page {
	padding-top: calc(var(--nav-height) + 24px);
	padding-bottom: 48px;
	padding-left: 24px;
	padding-right: 24px;
	max-width: 1100px;
	margin: 0 auto;
}

.back-link {
	display: inline-block;
	margin-bottom: 20px;
	color: var(--text-muted);
	text-decoration: none;
	font-size: 0.9rem;
}
.back-link:hover {
	color: var(--text);
}

/* Two-column layout */
.anime-layout {
	display: grid;
	grid-template-columns: 220px 1fr;
	gap: 32px;
	align-items: flex-start;
}

/* ── Left panel ── */
.left-panel {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.anime-cover {
	width: 100%;
	aspect-ratio: 1 / 1.414;
	border-radius: 10px;
	overflow: hidden;
	background: var(--card-bg);
	border: 1px solid var(--border);
	position: relative;
}
.anime-cover img {
	width: 100%;
	display: block;
	-webkit-backface-visibility: hidden;
	backface-visibility: hidden;
	image-rendering: auto;
}
.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--text-muted);
	background: var(--hover-bg);
}

.cover-upload-btn {
	position: absolute;
	bottom: 8px;
	right: 8px;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.65);
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	opacity: 0;
	transition: opacity 0.15s;
}
.cover-upload-btn input {
	display: none;
}
.cover-upload-btn.uploading {
	opacity: 1;
	cursor: wait;
}
.anime-cover:hover .cover-upload-btn {
	opacity: 1;
}
.cover-error {
	font-size: 0.78rem;
	color: var(--danger, #ef4444);
	margin: 0;
}

/* Production info */
.prod-info {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin: 0;
	padding: 14px;
	background: var(--card-bg);
	border: 1px solid var(--border);
	border-radius: 8px;
}
.prod-row {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.8rem;
}
.prod-row dt {
	color: var(--text-muted);
	font-weight: 600;
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.prod-row dd {
	margin: 0;
	color: var(--text);
	line-height: 1.4;
}
.genre-list {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}
.genre-chip {
	font-size: 0.72rem;
	padding: 2px 7px;
	border-radius: 10px;
	background: var(--hover-bg);
	color: var(--text-muted);
	border: 1px solid var(--border);
	text-decoration: none;
	transition:
		background 0.15s,
		color 0.15s;
}
.genre-chip:hover {
	background: var(--accent);
	color: #fff;
	border-color: var(--accent);
}
.links-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.official-link {
	font-size: 0.78rem;
	color: var(--accent);
	text-decoration: none;
	padding: 2px 8px;
	border: 1px solid var(--accent);
	border-radius: 4px;
}
.official-link:hover {
	background: var(--accent);
	color: #fff;
}
.resource-link--muted {
	border-color: var(--border);
	color: var(--text-muted);
}
.resource-link--muted:hover {
	background: var(--hover-bg);
	border-color: var(--border);
	color: var(--text);
}
.resource-links {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 0 14px;
}
.resource-links-title {
	color: var(--text-muted);
	font-size: 0.72rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}
.copyright {
	font-size: 0.72rem;
	color: var(--text-muted);
}
.copyright-notice {
	font-size: 0.68rem;
	color: var(--text-muted);
	line-height: 1.4;
	margin: 6px 0 0;
	word-break: break-all;
}
.filter-link {
	color: var(--accent);
	text-decoration: none;
	font-size: inherit;
}
.filter-link:hover {
	text-decoration: underline;
}

/* ── Main content ── */
.main-content {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.title-block {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.anime-title {
	font-size: 1.6rem;
	font-weight: 700;
	margin: 0;
	line-height: 1.3;
}
.anime-title-en {
	font-size: 0.88rem;
	color: var(--text-muted);
	margin: 0;
}

.meta-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: center;
}
.status-badge {
	font-size: 0.75rem;
	padding: 3px 10px;
	border-radius: 4px;
	font-weight: 600;
}
.status-airing {
	background: color-mix(in srgb, var(--status-watching) 15%, transparent);
	color: var(--status-watching);
}
.status-upcoming {
	background: color-mix(in srgb, var(--status-plan) 15%, transparent);
	color: var(--status-plan);
}
.status-finished {
	background: var(--hover-bg);
	color: var(--text-muted);
}
.status-unknown {
	background: var(--hover-bg);
	color: var(--text-muted);
}
.meta-chip {
	font-size: 0.78rem;
	padding: 3px 9px;
	border-radius: 4px;
	background: var(--hover-bg);
	color: var(--text-muted);
}
.meta-chip.aired {
	font-size: 0.75rem;
}
.meta-chip--link {
	text-decoration: none;
	transition:
		background 0.15s,
		color 0.15s;
}
.meta-chip--link:hover {
	background: var(--accent);
	color: #fff;
}

/* Stats cards */
.stats-grid {
	display: flex;
	gap: 12px;
	flex-wrap: wrap;
}
.stat-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 16px 24px;
	background: var(--card-bg);
	border: 1px solid var(--border);
	border-radius: 10px;
	min-width: 120px;
}
.stat-card-label {
	font-size: 0.72rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-muted);
}
.stat-card-value {
	font-size: 1.8rem;
	font-weight: 700;
	line-height: 1;
}
.stat-card--score .stat-card-value {
	color: var(--status-score);
}
.stat-card-sub {
	font-size: 0.75rem;
	color: var(--text-muted);
}

/* Synopsis */
.synopsis h2 {
	font-size: 1rem;
	font-weight: 600;
	margin: 0 0 8px;
}
.synopsis p {
	font-size: 0.9rem;
	line-height: 1.7;
	color: var(--text-secondary, var(--text));
	margin: 0;
}

/* Watchlist */
.watchlist-section {
	border: 1px solid var(--accent, #6366f1);
	border-radius: 12px;
	padding: 20px;
	background: var(--card-bg);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #6366f1) 12%, transparent);
}
.watchlist-section h2 {
	font-size: 1rem;
	font-weight: 700;
	margin: 0 0 14px;
	color: var(--accent, #6366f1);
	display: flex;
	align-items: center;
	gap: 6px;
}
.watchlist-section h2::before {
	content: "★";
	font-size: 0.9rem;
}

.form-row {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
	margin-bottom: 14px;
}
.form-label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.82rem;
	color: var(--text-muted);
	font-weight: 500;
}
.form-select,
.form-input {
	padding: 6px 10px;
	border-radius: 6px;
	border: 1px solid var(--border);
	background: var(--bg);
	color: var(--text);
	font-size: 0.9rem;
	min-width: 130px;
}
.form-input[type="number"] {
	width: 100px;
}

.form-actions {
	display: flex;
	gap: 10px;
	align-items: center;
	margin-top: 4px;
}
.btn-primary {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	padding: 11px 24px;
	border-radius: 8px;
	background: var(--accent);
	color: #fff;
	border: none;
	font-weight: 700;
	cursor: pointer;
	font-size: 1rem;
	letter-spacing: 0.01em;
	transition:
		background 0.15s,
		transform 0.1s,
		box-shadow 0.15s;
	box-shadow: 0 2px 8px color-mix(in srgb, var(--accent, #6366f1) 40%, transparent);
}
.btn-primary--add {
	background: var(--accent);
	min-width: 170px;
	justify-content: center;
}
.btn-primary--update {
	background: color-mix(in srgb, var(--accent, #6366f1) 75%, #000);
}
.btn-primary:hover {
	opacity: 0.92;
	transform: translateY(-1px);
	box-shadow: 0 4px 14px color-mix(in srgb, var(--accent, #6366f1) 50%, transparent);
}
.btn-primary:active {
	transform: translateY(0);
}
.btn-danger {
	padding: 8px 18px;
	border-radius: 6px;
	background: transparent;
	color: var(--danger, #ef4444);
	border: 1px solid var(--danger, #ef4444);
	font-weight: 600;
	cursor: pointer;
	font-size: 0.9rem;
}
.btn-danger:hover {
	background: #ef444422;
}

.form-error {
	color: var(--danger, #ef4444);
	font-size: 0.85rem;
	margin-bottom: 10px;
}
.form-success {
	color: var(--status-watching);
	font-size: 0.85rem;
	margin: 0 0 10px;
}
.watchlist-section--guest {
	border-color: var(--border);
	box-shadow: none;
}
.login-prompt {
	color: var(--text-muted);
	font-size: 0.9rem;
	margin: 0;
}
.login-prompt-link {
	color: #fff;
	background: var(--accent);
	padding: 2px 10px;
	border-radius: 5px;
	font-weight: 600;
	text-decoration: none;
	margin-right: 4px;
}
.login-prompt-link:hover {
	opacity: 0.85;
}

.recommend-section {
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 18px;
	background: var(--card-bg);
}

.recommend-section h2 {
	font-size: 1rem;
	font-weight: 700;
	margin: 0 0 14px;
}

.recommend-form {
	display: grid;
	grid-template-columns: minmax(180px, 320px) auto;
	gap: 12px;
	align-items: end;
}

.recommend-recipient-field {
	position: relative;
	min-width: 0;
}

.recommend-user-input {
	width: 100%;
	min-width: 0;
}

.selected-recipient {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 8px;
	padding: 4px 8px;
	border: 1px solid var(--border);
	border-radius: 999px;
	font-size: 0.78rem;
	color: var(--text);
	background: var(--hover-bg);
	max-width: 100%;
}

.selected-recipient img,
.recommend-user-result img,
.recommend-user-avatar-fallback {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.selected-recipient button {
	border: none;
	background: transparent;
	color: var(--text-muted);
	cursor: pointer;
	font-size: 1rem;
	line-height: 1;
}

.recommend-user-results {
	position: absolute;
	z-index: 20;
	top: calc(100% + 6px);
	left: 0;
	right: 0;
	background: var(--card-bg);
	border: 1px solid var(--border);
	border-radius: 8px;
	box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
	max-height: 240px;
	overflow-y: auto;
}

.recommend-user-result {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 9px 10px;
	border: none;
	background: transparent;
	color: var(--text);
	text-align: left;
	cursor: pointer;
}

.recommend-user-result:hover {
	background: var(--hover-bg);
}

.recommend-user-result span:last-child {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.recommend-user-result strong,
.recommend-user-result small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.recommend-user-result small,
.recommend-search-hint {
	color: var(--text-muted);
	font-size: 0.74rem;
}

.recommend-user-avatar-fallback {
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--hover-bg);
	color: var(--text-muted);
	font-weight: 700;
}

.recommend-submit {
	min-width: 96px;
	justify-content: center;
	padding: 9px 16px;
	font-size: 0.9rem;
}

.recommend-submit:disabled {
	opacity: 0.55;
	cursor: not-allowed;
	transform: none;
}

/* Listed users */
.listed-users-section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.listed-users-heading {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 1rem;
	font-weight: 600;
	margin: 0;
}

.listed-users-count {
	font-size: 0.8rem;
	font-weight: 400;
	color: var(--text-muted);
	background: var(--hover-bg);
	padding: 1px 8px;
	border-radius: 10px;
}

.listed-users-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.listed-user-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 5px;
	text-decoration: none;
	color: inherit;
	width: 64px;
}

.listed-user-avatar {
	position: relative;
	width: 44px;
	height: 44px;
	flex-shrink: 0;
}

.listed-user-avatar img,
.listed-user-avatar-fallback {
	width: 44px;
	height: 44px;
	border-radius: 50%;
	object-fit: cover;
}

.listed-user-avatar-fallback {
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--hover-bg);
	color: var(--text-muted);
	font-weight: 700;
	font-size: 1.1rem;
}

.listed-user-status-dot {
	position: absolute;
	bottom: 1px;
	right: 1px;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	border: 2px solid var(--bg);
}

.listed-user-name {
	font-size: 0.7rem;
	color: var(--text-muted);
	text-align: center;
	max-width: 64px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	transition: color 0.12s;
}

.listed-user-card:hover .listed-user-name {
	color: var(--accent);
}

.listed-user-score {
	font-size: 0.68rem;
	color: var(--status-score);
	font-weight: 600;
}

/* Responsive */
@media (max-width: 700px) {
	.anime-layout {
		grid-template-columns: 1fr;
	}
	.anime-cover {
		max-width: 200px;
	}
	.detail-page {
		padding-left: 14px;
		padding-right: 14px;
	}
	.recommend-form {
		grid-template-columns: 1fr;
		align-items: stretch;
	}
	.recommend-submit {
		width: 100%;
	}
}
</style>
