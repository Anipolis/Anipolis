<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { tick } from "svelte";
import { fade, scale } from "svelte/transition";
import { enhance } from "$app/forms";
import { page } from "$app/state";
import { trapFocus } from "$lib/actions/trapFocus";
import AnimeRegisterForm from "$lib/components/AnimeRegisterForm.svelte";
import MyListModal from "$lib/components/MyListModal.svelte";
import type { BroadcastRoomOverride } from "$lib/types";
import {
	type BroadcastOverrideKind,
	formatBroadcastEpisodeNumber,
	formatBroadcastEpisodeSlot,
	formatBroadcastOverrideEpisodeSummary,
	formatBroadcastOverrideKindLabel,
} from "$lib/utils/broadcast-episodes";
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
const ogDescription = $derived(
	displayGenres.length > 0
		? `${displayGenres.slice(0, 3).join(" · ")} — Anipolis`
		: `${data.anime.title}の情報・視聴記録 — Anipolis`,
);
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
// スマホ版左カラム用: ラベルを廃した、タップ検索可能な静的メタ情報チップ
const compactMetaLinks = $derived([
	...displayStudios.map((s) => ({ text: s, href: `/anime?studio=${encodeURIComponent(s)}` })),
	...(data.anime.source
		? [{ text: data.anime.source, href: `/anime?source=${encodeURIComponent(data.anime.source)}` }]
		: []),
	...displayGenres.map((g) => ({ text: g, href: `/anime?genre=${encodeURIComponent(g)}` })),
	...(data.anime.producer ?? []).map((p) => ({ text: p, href: `/anime?producer=${encodeURIComponent(p)}` })),
]);
const prequelRelations = $derived(data.relations.filter((relation) => relation.relation_type === "Prequel"));
const sequelRelations = $derived(data.relations.filter((relation) => relation.relation_type === "Sequel"));
const otherRelations = $derived(
	data.relations.filter((relation) => relation.relation_type !== "Prequel" && relation.relation_type !== "Sequel"),
);
const animeListHref = $derived(getAnimeListHref());
const sortedRoomLogs = $derived([...data.episodes].sort((a, b) => a.date.localeCompare(b.date)));
const latestRoomLog = $derived(sortedRoomLogs.at(-1));
const isAnimeAiring = $derived(data.anime.computed_broadcast_status === "airing");

const broadcastLabels: Record<string, string> = {
	airing: "放送中",
	upcoming: "放送予定",
	finished: "放送終了",
	unknown: "未定",
};
const listedUserStatusColors: Record<string, string> = {
	watching: "var(--status-watching)",
	completed: "var(--status-completed)",
	plan_to_watch: "var(--watch-status-plan)",
	on_hold: "var(--status-on-hold)",
	dropped: "var(--status-dropped)",
};
const listedUserStatusLabels: Record<string, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

function getAnimeListHref() {
	const from = page.url.searchParams.get("from");
	if (!from) return "/anime";

	try {
		const url = new URL(from, page.url.origin);
		if (url.origin !== page.url.origin || url.pathname !== "/anime") return "/anime";
		return `${url.pathname}${url.search}`;
	} catch {
		return "/anime";
	}
}

function formatAiredPeriod(airedFrom: string | null, airedTo: string | null): string | null {
	if (!airedFrom) return null;
	return `${airedFrom.slice(0, 10)} 〜 ${airedTo ? airedTo.slice(0, 10) : "未定"}`;
}

import { isHttpUrl, isMalUrl } from "$lib/utils/url";

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

	if (malId) links.push({ name: "MAL", url: `https://myanimelist.net/anime/${malId}` });
	links.push(
		...resources
			.filter((resource) => resource.name && isHttpUrl(resource.url))
			.map((resource) => {
				if (isMalUrl(resource.url) || resource.name.toLowerCase() === "mal") {
					return null;
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

let myListModalOpen = $state(false);
let showUserListModal = $state(false);
let recommendModalOpen = $state(false);
let hideRecommendFormResult = $state(false);
const recommendFormMessage = $derived(hideRecommendFormResult ? "" : (form?.recommendMessage ?? ""));
const recommendFormSuccess = $derived(!hideRecommendFormResult && Boolean(form?.recommendSuccess));
// svelte-ignore state_referenced_locally
let adminEditOpen = $state(Boolean(form?.success || form?.message));
let activeAdminTab = $state<"basic" | "overrides">("basic");
let activeRoomTab = $state<"log" | "event">("log");
let overrideFormOpen = $state(false);
let selectedOverrideKind = $state<BroadcastOverrideKind>("cancelled");
let overrideAdvancedOpen = $state(false);
$effect(() => {
	if (form?.success || form?.message) adminEditOpen = true;
});

$effect(() => {
	if (form?.recommendSuccess || form?.recommendMessage) {
		hideRecommendFormResult = false;
		recommendModalOpen = true;
	}
});

const overrideKindOptions: { kind: BroadcastOverrideKind; label: string; description: string }[] = [
	{ kind: "cancelled", label: "放送休止", description: "休止カードを表示" },
	{ kind: "recap", label: "総集編/特別編", description: "話数を進めずに表示" },
	{ kind: "time_change", label: "放送時間変更", description: "開始時刻や枠を変更" },
	{ kind: "marathon", label: "一挙放送", description: "話数範囲をまとめて表示" },
	{ kind: "custom", label: "詳細設定", description: "全項目を直接指定" },
];

function selectOverrideKind(kind: BroadcastOverrideKind) {
	selectedOverrideKind = kind;
	overrideAdvancedOpen = kind === "custom";
}

function handleModalKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	if (showUserListModal) showUserListModal = false;
	if (recommendModalOpen) recommendModalOpen = false;
}

function handleUserListBackdropClick(event: MouseEvent) {
	if (event.target === event.currentTarget) showUserListModal = false;
}

function handleRecommendBackdropClick(event: MouseEvent) {
	if (event.target === event.currentTarget) recommendModalOpen = false;
}

function openRecommendModal() {
	recommendError = "";
	recommendFeedback = "";
	hideRecommendFormResult = true;
	recommendModalOpen = true;
}

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
let liveRoomDates = $state(new Set<string>());

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
	hideRecommendFormResult = true;
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

function parseDateInput(value: string): Date {
	return new Date(`${value}T00:00:00`);
}

function overrideForDate(dateStr: string): BroadcastRoomOverride | null {
	return data.broadcastOverrides.find((override) => override.room_date.slice(0, 10) === dateStr) ?? null;
}

function effectiveBroadcastTime(dateStr: string): string | null {
	return overrideForDate(dateStr)?.broadcast_time ?? data.anime.broadcast_time;
}

function effectiveDurationMinutes(dateStr: string): number {
	const overrideDuration = overrideForDate(dateStr)?.duration_minutes;
	return overrideDuration != null && overrideDuration > 0 ? overrideDuration : data.anime.broadcast_duration_minutes;
}

function effectivePostCloseMinutes(dateStr: string): number {
	const overridePostClose = overrideForDate(dateStr)?.post_close_minutes;
	return overridePostClose != null && overridePostClose >= 0
		? overridePostClose
		: data.anime.broadcast_room_post_close_minutes;
}

function minutesUntilBroadcast(now: Date, roomDate: string): number | null {
	const broadcastTime = effectiveBroadcastTime(roomDate);
	if (!broadcastTime) return null;
	const match = broadcastTime.match(/^(\d{1,2}):(\d{2})/);
	if (!match) return null;

	const broadcastHour = Number(match[1]);
	const broadcastMin = Number(match[2]);
	const scheduledAt = parseDateInput(roomDate);
	scheduledAt.setHours(broadcastHour, broadcastMin, 0, 0);
	return Math.round((scheduledAt.getTime() - now.getTime()) / 60_000);
}

function getLiveWindowMinutes(roomDate: string): number {
	const durationMinutes = effectiveDurationMinutes(roomDate) > 0 ? effectiveDurationMinutes(roomDate) : 30;
	const postCloseMinutes = effectivePostCloseMinutes(roomDate) >= 0 ? effectivePostCloseMinutes(roomDate) : 30;
	return durationMinutes + postCloseMinutes;
}

function isRoomLive(now: Date, roomDate: string): boolean {
	const mins = minutesUntilBroadcast(now, roomDate);
	return mins !== null && mins <= 0 && mins > -getLiveWindowMinutes(roomDate);
}

function refreshLiveRoomDates() {
	const now = new Date();
	const next = new Set<string>();
	for (const episode of data.episodes) {
		if (isRoomLive(now, episode.date)) next.add(episode.date);
	}
	liveRoomDates = next;
}

$effect(() => {
	data.anime.id;
	refreshLiveRoomDates();
	const id = setInterval(refreshLiveRoomDates, 30_000);
	return () => clearInterval(id);
});
</script>

<svelte:head>
	<title>{data.anime.title} — Anipolis</title>
	<meta property="og:title" content="{data.anime.title} — Anipolis">
	<meta property="og:description" content={ogDescription}>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if data.anime.cover_url}
		<meta property="og:image" content={data.anime.cover_url}>
		<meta name="twitter:card" content="summary_large_image">
	{/if}
</svelte:head>

{#snippet relationsSection()}
	{#if data.relations.length > 0}
		<section class="relations-section">
			<h2>関連作品</h2>
			{#each [
				{ label: '前作', relations: prequelRelations },
				{ label: '続編', relations: sequelRelations },
				{ label: '関連作品', relations: otherRelations },
			] as group (group.label)}
				{#if group.relations.length > 0}
					<div class="relation-group">
						<h3>{group.label}</h3>
						<div class="relation-list">
							{#each group.relations as relation (`${relation.relation_type}-${relation.related_anime_mal_id}`)}
								{#if relation.anime}
									<a href="/anime/{relation.anime.id}" class="relation-card">
										{#if relation.anime.cover_url}
											<img class="relation-card-thumb" src={relation.anime.cover_url} alt="">
										{:else}
											<span
												class="relation-card-thumb relation-card-thumb--placeholder"
												aria-hidden="true"
											></span>
										{/if}
										<span class="relation-card-body">
											<strong>{relation.anime.title}</strong>
											{#if group.label === '関連作品'}
												<small>{relation.relation_type}</small>
											{/if}
										</span>
									</a>
								{:else}
									<div class="relation-card relation-card--unavailable">
										<span
											class="relation-card-thumb relation-card-thumb--placeholder"
											aria-hidden="true"
										></span>
										<span class="relation-card-body">
											<strong>{relation.related_title}</strong>
											<small>
												{group.label === '関連作品' ? relation.relation_type : '未登録'}
											</small>
										</span>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</section>
	{/if}
{/snippet}

<div class="detail-page">
	<a href={animeListHref} class="back-link">← アニメ一覧</a>

	<div class="anime-layout">
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
					<a href="/anime?season={encodeURIComponent(data.anime.season)}" class="meta-chip meta-chip--link"
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

		<!-- Left: Cover + production info -->
		<aside class="left-panel">
			<div class="cover-col">
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
				{#if data.anime.copyright}
					<p class="copyright-notice">{data.anime.copyright}</p>
				{/if}
			</div>
			<!-- スマホ版のみ: 画像下に圧縮メタ＋ハッシュタグ＋公式アイコンを集約（PC版は .prod-info を使用） -->
			<div class="mobile-meta">
				{#if compactMetaLinks.length}
					<div class="mobile-meta-chips">
						{#each compactMetaLinks as item (item.href + item.text)}
							<a href={item.href} class="mobile-meta-chip">{item.text}</a>
						{/each}
					</div>
				{/if}
				{#if data.anime.official_hashtag?.length}
					<div class="mobile-hashtags">
						{#each data.anime.official_hashtag as tag}
							<a href="/hashtag/{tag.replace(/^#/, '')}" class="mobile-hashtag"
								>#{tag.replace(/^#/, '')}</a
							>
						{/each}
					</div>
				{/if}
				{#if displayOfficialLinks.length}
					<div class="mobile-official-icons">
						{#each displayOfficialLinks as link (link.url)}
							<a
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								class="mobile-icon-link"
								aria-label={link.name}
								title={link.name}
							>
								{#if link.name.includes("公式サイト")}
									<span class="i-lucide-globe-2" aria-hidden="true"></span>
								{:else}
									𝕏
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
			<div class="left-panel-info">
				{#if coverError}
					<p class="cover-error">{coverError}</p>
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
								<dd>
									<a href="/anime?source={encodeURIComponent(data.anime.source)}" class="genre-chip"
										>{data.anime.source}</a
									>
								</dd>
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
			</div>
		</aside>

		<!-- Right column: スマホ版はアクション専用リモコン / PC版はmain上部に従来配置 -->
		<div class="remote">
			<!-- Score hero -->
			<div class="stats-grid">
				<div class="stat-card stat-card--score">
					<span class="stat-card-label">スコア</span>
					{#if data.anime.avg_score != null && (data.anime.score_count ?? 0) > 0}
						<span class="stat-card-value">★ {data.anime.avg_score.toFixed(2)}</span>
						<span class="stat-card-sub">{data.anime.score_count}件の評価</span>
					{:else}
						<span class="stat-card-value">—</span>
					{/if}
				</div>
				{#if data.anime.list_count}
					<button
						type="button"
						class="stat-card stat-card--interactive"
						onclick={() => (showUserListModal = true)}
						aria-haspopup="dialog"
					>
						<span class="stat-card-label">リスト登録</span>
						<span class="stat-card-value">{data.anime.list_count}</span>
						<span class="stat-card-sub">ユーザー</span>
					</button>
				{/if}
			</div>
			<!-- アクションバー -->

			{#if data.user}
				<div class="action-bar">
					<a href="/?quote_anime={data.anime.id}#compose" class="action-bar-btn action-bar-btn--link">
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
							<path d="M12 20h9" />
							<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
						</svg>
						<span>投稿する</span>
					</a>
					<button
						type="button"
						class="action-bar-btn"
						class:active={myListModalOpen}
						onclick={() => (myListModalOpen = true)}
						aria-pressed={myListModalOpen}
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
							<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
						</svg>
						<span>マイリスト</span>
					</button>
					<button
						type="button"
						class="action-bar-btn"
						class:active={recommendModalOpen}
						onclick={openRecommendModal}
						aria-haspopup="dialog"
						aria-expanded={recommendModalOpen}
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
							<line x1="22" y1="2" x2="11" y2="13" />
							<polygon points="22 2 15 22 11 13 2 9 22 2" />
						</svg>
						<span>推薦</span>
					</button>
				</div>
			{/if}
			{#if data.isAdmin}
				<button
					type="button"
					class="remote-admin-btn"
					aria-expanded={adminEditOpen}
					onclick={async () => {
						adminEditOpen = !adminEditOpen;
						if (adminEditOpen) {
							await tick();
							document
								.getElementById("admin-edit-section")
								?.scrollIntoView({ behavior: "smooth", block: "start" });
						}
					}}
				>
					{adminEditOpen ? "作品情報フォームを閉じる" : "作品情報を編集"}
				</button>
			{/if}
			{#if data.relations.length > 0}
				<div class="mobile-relations-slot">
					{@render relationsSection()}
				</div>
			{/if}
		</div>

		<!-- Main: synopsis, panels, relations, room log -->
		<div class="main-content">
			<!-- Synopsis -->
			{#if data.anime.synopsis}
				<section class="synopsis">
					<h2>あらすじ</h2>
					<p>{data.anime.synopsis}</p>
				</section>
			{/if}

			{#if data.isAdmin}
				<section
					id="admin-edit-section"
					class="admin-edit-section"
					class:admin-edit-section--open={adminEditOpen}
				>
					<button
						type="button"
						class="admin-edit-toggle"
						aria-expanded={adminEditOpen}
						onclick={() => {
							adminEditOpen = !adminEditOpen;
						}}
					>
						{adminEditOpen ? "作品情報フォームを閉じる" : "作品情報を編集"}
					</button>
					{#if adminEditOpen}
						<div class="admin-tab-list" role="tablist" aria-label="作品管理">
							<button
								type="button"
								class="admin-tab"
								class:admin-tab--active={activeAdminTab === "basic"}
								role="tab"
								aria-selected={activeAdminTab === "basic"}
								onclick={() => {
									activeAdminTab = "basic";
								}}
							>
								<span class="i-lucide-file-pen-line" aria-hidden="true"></span>
								基本情報を編集
							</button>
							<button
								type="button"
								class="admin-tab"
								class:admin-tab--active={activeAdminTab === "overrides"}
								role="tab"
								aria-selected={activeAdminTab === "overrides"}
								onclick={() => {
									activeAdminTab = "overrides";
								}}
							>
								<span class="i-lucide-calendar-cog" aria-hidden="true"></span>
								イレギュラー放送設定
							</button>
						</div>

						{#if activeAdminTab === "basic"}
							<div class="admin-edit-form">
								<AnimeRegisterForm {form} mode="edit" anime={data.anime} action="?/updateAnime" />
							</div>
						{:else}
							<section class="broadcast-override-section">
								<div>
									<h2 class="broadcast-override-heading">イレギュラー放送設定</h2>
									<p class="broadcast-override-hint">
										特定の話だけ放送時刻・放送時間を変更したい場合（拡大放送・特番など）に登録します。
									</p>
								</div>

								<div class="broadcast-override-table-wrap">
									<table class="broadcast-override-table">
										<thead>
											<tr>
												<th>日付</th>
												<th>タイプ / 表示ラベル</th>
												<th>対象話数</th>
												<th>メモ</th>
												<th><span class="sr-only">操作</span></th>
											</tr>
										</thead>
										<tbody>
											{#if data.broadcastOverrides.length > 0}
												{#each data.broadcastOverrides as override (override.id)}
													<tr>
														<td class="broadcast-override-date">{override.room_date}</td>
														<td>
															<div class="broadcast-override-table-tags">
																<span
																	class="broadcast-override-tag broadcast-override-tag--kind"
																	>{formatBroadcastOverrideKindLabel(override)}</span
																>
																{#if override.announcement_label}
																	<span class="broadcast-override-tag"
																		>{override.announcement_label}</span
																	>
																{/if}
																{#if override.broadcast_time}
																	<span class="broadcast-override-tag"
																		>{override.broadcast_time}〜</span
																	>
																{/if}
																{#if override.duration_minutes != null}
																	<span class="broadcast-override-tag"
																		>{override.duration_minutes}分</span
																	>
																{/if}
															</div>
														</td>
														<td>
															<div class="broadcast-override-table-tags">
																{#if formatBroadcastOverrideEpisodeSummary(override)}
																	<span class="broadcast-override-tag"
																		>{formatBroadcastOverrideEpisodeSummary(override)}</span
																	>
																{/if}
																{#if override.episode_count_increment != null}
																	<span class="broadcast-override-tag"
																		>+{override.episode_count_increment}</span
																	>
																{/if}
															</div>
														</td>
														<td>
															{#if override.note}
																<span class="broadcast-override-note"
																	>{override.note}</span
																>
															{:else}
																<span class="broadcast-override-empty">—</span>
															{/if}
														</td>
														<td class="broadcast-override-action-cell">
															<form
																method="POST"
																action="?/deleteBroadcastOverride"
																use:enhance
															>
																<input
																	type="hidden"
																	name="override_id"
																	value={override.id}
																>
																<button type="submit" class="broadcast-override-delete">
																	削除
																</button>
															</form>
														</td>
													</tr>
												{/each}
											{:else}
												<tr>
													<td colspan="5" class="broadcast-override-empty-row">
														登録済みのイレギュラー設定はありません
													</td>
												</tr>
											{/if}
										</tbody>
									</table>
								</div>

								{#if !overrideFormOpen}
									<button
										type="button"
										class="broadcast-override-add-toggle"
										onclick={() => {
											overrideFormOpen = true;
										}}
									>
										＋ イレギュラー設定を追加
									</button>
								{:else}
									<div class="broadcast-override-accordion">
										<form
											method="POST"
											action="?/addBroadcastOverride"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													overrideFormOpen = false;
												};
											}}
											class="broadcast-override-form"
										>
											<div class="broadcast-override-field">
												<label for="override-room-date">日付</label>
												<input id="override-room-date" type="date" name="room_date" required>
											</div>
											<div
												class="broadcast-override-kind-picker"
												role="radiogroup"
												aria-label="シチュエーション"
											>
												{#each overrideKindOptions as option}
													<label
														class="broadcast-override-kind-option"
														class:broadcast-override-kind-option--active={selectedOverrideKind === option.kind}
													>
														<input
															type="radio"
															name="override_kind"
															value={option.kind}
															checked={selectedOverrideKind === option.kind}
															onchange={() => selectOverrideKind(option.kind)}
														>
														<span>{option.label}</span>
														<small>{option.description}</small>
													</label>
												{/each}
											</div>

											{#if selectedOverrideKind === "cancelled"}
												<div class="broadcast-override-field">
													<label for="override-announcement-label">休止時の表示文</label>
													<input
														id="override-announcement-label"
														type="text"
														name="announcement_label"
														placeholder="今週は放送休止"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-note">管理用メモ（任意）</label>
													<input
														id="override-note"
														type="text"
														name="note"
														placeholder="公式X確認済み"
													>
												</div>
											{:else if selectedOverrideKind === "recap"}
												<div class="broadcast-override-field">
													<label for="override-episode-label"
														>話数の代わりに表示するラベル</label
													>
													<input
														id="override-episode-label"
														type="text"
														name="episode_label"
														value="総集編"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-episode-count-increment"
														>話数カウント進行</label
													>
													<input
														id="override-episode-count-increment"
														type="number"
														name="episode_count_increment"
														min="0"
														max="99"
														value="0"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-note">管理用メモ（任意）</label>
													<input
														id="override-note"
														type="text"
														name="note"
														placeholder="総集編で通常話数は進めない"
													>
												</div>
											{:else if selectedOverrideKind === "time_change"}
												<div class="broadcast-override-field">
													<label for="override-broadcast-time">変更後の放送時刻</label>
													<input
														id="override-broadcast-time"
														type="text"
														name="broadcast_time"
														placeholder="23:30"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-duration">放送時間・分（任意）</label>
													<input
														id="override-duration"
														type="number"
														name="duration_minutes"
														min="1"
														max="1440"
														placeholder="60"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-note">管理用メモ（任意）</label>
													<input
														id="override-note"
														type="text"
														name="note"
														placeholder="特番編成で15分押し"
													>
												</div>
											{:else if selectedOverrideKind === "marathon"}
												<div class="broadcast-override-field">
													<label for="override-episode-start">対象話数（開始）</label>
													<input
														id="override-episode-start"
														type="number"
														name="episode_start"
														min="1"
														placeholder="1"
														required
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-episode-end">対象話数（終了）</label>
													<input
														id="override-episode-end"
														type="number"
														name="episode_end"
														min="1"
														placeholder="3"
														required
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-broadcast-time">放送時刻（任意）</label>
													<input
														id="override-broadcast-time"
														type="text"
														name="broadcast_time"
														placeholder="23:30"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-duration">放送時間・分（任意）</label>
													<input
														id="override-duration"
														type="number"
														name="duration_minutes"
														min="1"
														max="1440"
														placeholder="90"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-note">管理用メモ（任意）</label>
													<input
														id="override-note"
														type="text"
														name="note"
														placeholder="第1話〜第3話"
													>
												</div>
											{:else}
												<label class="broadcast-override-checkbox">
													<input type="checkbox" name="is_cancelled">
													<span>放送休止として告知する</span>
												</label>
												<div class="broadcast-override-field">
													<label for="override-announcement-label"
														>休止時の表示文（任意）</label
													>
													<input
														id="override-announcement-label"
														type="text"
														name="announcement_label"
														placeholder="今週は放送休止"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-broadcast-time"
														>放送時刻（任意・未指定で通常値）</label
													>
													<input
														id="override-broadcast-time"
														type="text"
														name="broadcast_time"
														placeholder="23:30"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-duration">放送時間・分（任意）</label>
													<input
														id="override-duration"
														type="number"
														name="duration_minutes"
														min="1"
														max="1440"
														placeholder="60"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-episode-start">対象話数（開始・任意）</label>
													<input
														id="override-episode-start"
														type="number"
														name="episode_start"
														min="1"
														placeholder="1"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-episode-end">対象話数（終了・任意）</label>
													<input
														id="override-episode-end"
														type="number"
														name="episode_end"
														min="1"
														placeholder="2"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-episode-label"
														>話数の代わりに表示するラベル（任意）</label
													>
													<input
														id="override-episode-label"
														type="text"
														name="episode_label"
														placeholder="総集編"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-episode-count-increment"
														>話数カウント進行（任意）</label
													>
													<input
														id="override-episode-count-increment"
														type="number"
														name="episode_count_increment"
														min="0"
														max="99"
														placeholder="0"
													>
												</div>
												<div class="broadcast-override-field">
													<label for="override-note">管理用メモ（任意）</label>
													<input
														id="override-note"
														type="text"
														name="note"
														placeholder="1時間拡大SP"
													>
												</div>
											{/if}

											{#if selectedOverrideKind !== "custom"}
												<div class="broadcast-override-advanced-toggle">
													<button
														type="button"
														class="broadcast-override-secondary"
														onclick={() => (overrideAdvancedOpen = !overrideAdvancedOpen)}
														aria-expanded={overrideAdvancedOpen}
													>
														詳細設定
													</button>
												</div>
											{/if}

											{#if overrideAdvancedOpen}
												<div class="broadcast-override-advanced-fields">
													<div class="broadcast-override-field">
														<label for="override-pre-open"
															>投稿開始の前倒し・分（任意）</label
														>
														<input
															id="override-pre-open"
															type="number"
															name="pre_open_minutes"
															min="0"
															max="1440"
														>
													</div>
													<div class="broadcast-override-field">
														<label for="override-post-close"
															>投稿終了の延長・分（任意）</label
														>
														<input
															id="override-post-close"
															type="number"
															name="post_close_minutes"
															min="0"
															max="1440"
														>
													</div>
												</div>
											{/if}
											<div class="broadcast-override-form-actions">
												<button type="submit" class="broadcast-override-submit">登録</button>
												<button
													type="button"
													class="broadcast-override-cancel"
													onclick={() => {
														overrideFormOpen = false;
													}}
												>
													キャンセル
												</button>
											</div>
										</form>
									</div>
								{/if}
							</section>
						{/if}
					{/if}
				</section>
			{/if}

			<section class="room-tabs-section">
				<div class="room-tabs" role="tablist" aria-label="ルーム表示切り替え">
					<button
						type="button"
						role="tab"
						id="room-tab-log"
						class="room-tab"
						class:room-tab--active={activeRoomTab === "log"}
						aria-selected={activeRoomTab === "log"}
						aria-controls="room-tabpanel"
						onclick={() => (activeRoomTab = "log")}
					>
						ルームログ
					</button>
					<button
						type="button"
						role="tab"
						id="room-tab-event"
						class="room-tab"
						class:room-tab--active={activeRoomTab === "event"}
						aria-selected={activeRoomTab === "event"}
						aria-controls="room-tabpanel"
						onclick={() => (activeRoomTab = "event")}
					>
						イベント
					</button>
				</div>

				<div
					id="room-tabpanel"
					role="tabpanel"
					aria-labelledby={activeRoomTab === "log" ? "room-tab-log" : "room-tab-event"}
				>
					{#if activeRoomTab === "log"}
						{#if data.anime.room_type === "global"}
							<section class="global-lobby-section">
								<a href="/rooms/anime/{data.anime.id}/lobby" class="global-lobby-link">
									<span class="i-lucide-messages-square" aria-hidden="true"></span>
									<span>
										<strong>この作品の総合実況・雑談ロビーへ入る</strong>
									</span>
								</a>
							</section>
						{:else if data.episodes.length > 0}
							<section class="room-log-section">
								<h2 class="room-log-heading">ルームログ</h2>
								<ol class="room-log-list">
									{#if isAnimeAiring && latestRoomLog}
										<li class="room-log-latest-slot">
											<a
												href="/rooms/anime/{data.anime.id}/{latestRoomLog.date}"
												class="room-log-item room-log-item--latest"
											>
												<span class="room-log-latest-label">
													<span class="i-lucide-zap" aria-hidden="true"></span>
													Latest
												</span>
												<span class="room-log-ep"
													>{formatBroadcastEpisodeSlot(latestRoomLog)}</span
												>
												<span class="room-log-ep-compact"
													>{formatBroadcastEpisodeNumber(latestRoomLog)}</span
												>
												{#if liveRoomDates.has(latestRoomLog.date)}
													<span class="room-log-live-badge">LIVE</span>
												{/if}
												<span class="room-log-date">{latestRoomLog.date}</span>
											</a>
										</li>
									{/if}
									{#each sortedRoomLogs as ep (ep.date)}
										<li>
											<a href="/rooms/anime/{data.anime.id}/{ep.date}" class="room-log-item">
												<span class="room-log-ep">{formatBroadcastEpisodeSlot(ep)}</span>
												<span class="room-log-ep-compact"
													>{formatBroadcastEpisodeNumber(ep)}</span
												>
												{#if liveRoomDates.has(ep.date)}
													<span class="room-log-live-badge">LIVE</span>
												{/if}
												<span class="room-log-date">{ep.date}</span>
											</a>
										</li>
									{/each}
								</ol>
							</section>
						{:else}
							<p class="room-tab-empty">このアニメにはルームがありません。</p>
						{/if}
					{:else if data.events.length === 0}
						<p class="room-tab-empty">このアニメに紐づくイベントはまだありません。</p>
					{:else}
						<ol class="event-log-list">
							{#each data.events as event (event.id)}
								<li>
									<a
										href="/events/{event.id}"
										class="event-log-item"
										class:event-log-item--cancelled={event.is_cancelled}
									>
										<span class="event-log-title">{event.title}</span>
										<span class="event-log-date">
											{new Date(event.scheduled_at).toLocaleString("ja-JP", {
											timeZone: "Asia/Tokyo",
											year: "numeric",
											month: "numeric",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
										</span>
										{#if event.is_cancelled}
											<span class="event-log-cancelled-badge">キャンセル済み</span>
										{/if}
									</a>
								</li>
							{/each}
						</ol>
					{/if}
				</div>
			</section>

			{#if data.relations.length > 0}
				<div class="desktop-relations-slot">
					{@render relationsSection()}
				</div>
			{/if}
		</div>
	</div>
</div>

<svelte:window onkeydown={handleModalKeydown} />

{#if showUserListModal}
	<div
		class="user-list-modal-backdrop"
		role="presentation"
		onclick={handleUserListBackdropClick}
		transition:fade={{ duration: 180 }}
	>
		<div
			class="user-list-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="user-list-modal-title"
			tabindex="-1"
			use:trapFocus
			in:scale={{ duration: 200, start: 0.95 }}
		>
			<header class="user-list-modal-header">
				<h2 id="user-list-modal-title">リスト登録中のユーザー <span>({data.listedUsers.length}人)</span></h2>
				<button
					type="button"
					class="user-list-modal-close"
					onclick={() => (showUserListModal = false)}
					aria-label="閉じる"
				>
					<span class="i-lucide-x" aria-hidden="true"></span>
				</button>
			</header>

			<div class="listed-users-list">
				{#each data.listedUsers as u (u.user_id)}
					<a href="/profile/{u.username}" class="listed-user-card">
						<div class="listed-user-avatar">
							{#if u.avatar_url}
								<img src={u.avatar_url} alt="{u.display_name ?? u.username}のアバター">
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
						<div class="listed-user-details">
							<span class="listed-user-name">{u.display_name ?? u.username}</span>
							<span class="listed-user-handle">@{u.username}</span>
						</div>
						{#if u.score != null && u.score > 0}
							<span class="listed-user-score">★ {u.score}</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	</div>
{/if}

{#if recommendModalOpen}
	<div
		class="user-list-modal-backdrop"
		role="presentation"
		onclick={handleRecommendBackdropClick}
		transition:fade={{ duration: 180 }}
	>
		<div
			class="user-list-modal recommend-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="recommend-modal-title"
			tabindex="-1"
			use:trapFocus
			in:scale={{ duration: 200, start: 0.95 }}
		>
			<header class="user-list-modal-header">
				<h2 id="recommend-modal-title">この作品を推薦する</h2>
				<button
					type="button"
					class="user-list-modal-close"
					onclick={() => (recommendModalOpen = false)}
					aria-label="閉じる"
				>
					<span class="i-lucide-x" aria-hidden="true"></span>
				</button>
			</header>

			{#if recommendFormMessage || recommendError}
				<p class="form-error">{recommendError || recommendFormMessage}</p>
			{/if}
			{#if recommendFormSuccess || recommendFeedback}
				<p class="form-success">{recommendFeedback || '推薦を送信しました'}</p>
			{/if}

			<form method="POST" action="?/recommendAnime" use:enhance={handleRecommendSubmit} class="recommend-form">
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
		</div>
	</div>
{/if}

<MyListModal
	open={myListModalOpen}
	animeId={data.anime.id}
	animeTitle={data.anime.title}
	episodeCount={data.anime.episode_count}
	entry={data.anime.user_entry}
	onclose={() => { myListModalOpen = false; }}
/>
<style>
.detail-page {
	width: 100%;
	box-sizing: border-box;
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
	color: var(--color-text-muted);
	text-decoration: none;
	font-size: 0.9rem;
}
.back-link:hover {
	color: var(--text);
}

/* Two-column layout */
.anime-layout {
	display: grid;
	width: 100%;
	box-sizing: border-box;
	grid-template-columns: 220px minmax(0, 1fr);
	grid-template-rows: auto auto 1fr;
	grid-template-areas:
		"left title"
		"left remote"
		"left main";
	column-gap: 32px;
	row-gap: 24px;
	align-items: flex-start;
}

/* ── Left panel ── */
.left-panel {
	grid-area: left;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.cover-col {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.left-panel-info {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.anime-cover {
	width: 100%;
	aspect-ratio: 1 / 1.414;
	border-radius: 10px;
	overflow: hidden;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
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
	color: var(--color-text-muted);
	background: var(--color-surface-hover);
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
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
}
.prod-row {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.8rem;
}
.prod-row dt {
	color: var(--color-text-muted);
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
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
	border: 1px solid var(--color-border);
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
	color: var(--color-text-muted);
}
.copyright-notice {
	font-size: 0.68rem;
	color: var(--color-text-muted);
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
	grid-area: main;
	display: flex;
	flex-direction: column;
	gap: 24px;
	width: 100%;
	min-width: 0;
}

/* Action remote column (PC: main上部 / スマホ: 右カラム) */
.remote {
	grid-area: remote;
	display: flex;
	flex-direction: column;
	gap: 24px;
	min-width: 0;
}
/* スマホ版のみ表示するリモコン内の管理者編集トグル */
.remote-admin-btn {
	display: none;
}

/* スマホ版のみ表示する画像下の圧縮メタ（PC版は .prod-info を使用） */
.mobile-meta {
	display: none;
}

.title-block {
	grid-area: title;
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
	color: var(--color-text-muted);
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
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
}
.status-unknown {
	background: var(--hover-bg);
	color: var(--text-muted);
}
.meta-chip {
	font-size: 0.78rem;
	padding: 3px 9px;
	border-radius: 4px;
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
}
.meta-chip.aired {
	font-size: 0.75rem;
}
.meta-chip--link {
	text-decoration: none;
	color: var(--accent);
	background: color-mix(in srgb, var(--accent) 10%, var(--color-surface-hover));
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
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 10px;
	min-width: 120px;
}
.stat-card--interactive {
	font: inherit;
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		transform 0.15s,
		background 0.15s,
		border-color 0.15s;
}
.stat-card--interactive:hover {
	background: var(--hover-bg);
	border-color: var(--color-border-hover);
}
.stat-card--interactive:active {
	transform: scale(0.95);
}
.stat-card--interactive:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
	background: var(--hover-bg);
	border-color: var(--accent);
}
.stat-card-label {
	font-size: 0.72rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--color-text-muted);
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
	color: var(--color-text-muted);
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

.admin-edit-section {
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding: 24px;
	border: 1px solid var(--border);
	border-radius: 16px;
	background: var(--card-bg);
}
.admin-edit-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 40px;
	padding: 9px 16px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	color: var(--text);
	font-size: 0.88rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}
.admin-edit-toggle:hover {
	background: var(--hover-bg);
	border-color: var(--accent);
	color: var(--accent);
}
.admin-tab-list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	padding: 4px;
	border: 1px solid var(--border);
	border-radius: 12px;
	background: var(--hover-bg);
}
.admin-tab {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	min-height: 40px;
	padding: 8px 12px;
	border: 1px solid transparent;
	border-radius: 9px;
	background: transparent;
	color: var(--text-muted);
	font-size: 0.86rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}
.admin-tab:hover {
	color: var(--text);
	background: var(--card-bg);
}
.admin-tab--active {
	border-color: var(--color-border-hover);
	background: var(--card-bg);
	color: var(--text);
	box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.admin-edit-form {
	min-width: 0;
}

.broadcast-override-section {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.broadcast-override-heading {
	font-size: 1rem;
	font-weight: 600;
	margin: 0;
}
.broadcast-override-hint {
	font-size: 0.8rem;
	color: var(--text-muted);
	margin: 0;
}
.broadcast-override-table-wrap {
	overflow-x: auto;
	border: 1px solid #27272a;
	border-radius: 12px;
	background: #111113;
}
.broadcast-override-table {
	width: 100%;
	border-collapse: collapse;
	min-width: 680px;
	font-size: 0.82rem;
}
.broadcast-override-table th,
.broadcast-override-table td {
	padding: 10px 12px;
	border-bottom: 1px solid var(--border);
	text-align: left;
	vertical-align: middle;
}
.broadcast-override-table th {
	color: var(--text-muted);
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	background: var(--hover-bg);
}
.broadcast-override-table tr:last-child td {
	border-bottom: 0;
}
.broadcast-override-table-tags {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}
.broadcast-override-date {
	font-weight: 600;
	color: var(--text);
}
.broadcast-override-tag {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 2px 8px;
	border: 1px solid var(--border);
	border-radius: 999px;
	background: var(--card-bg);
	color: var(--text-muted);
	font-size: 0.76rem;
}
.broadcast-override-tag--kind {
	border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
	color: var(--accent);
}
.broadcast-override-note {
	color: var(--text-muted);
	font-size: 0.8rem;
	font-style: italic;
}
.broadcast-override-empty,
.broadcast-override-empty-row {
	color: var(--text-muted);
}
.broadcast-override-empty-row {
	padding: 18px 12px;
	text-align: center;
}
.broadcast-override-action-cell {
	width: 1%;
	white-space: nowrap;
}
.broadcast-override-delete {
	border: 1px solid var(--border);
	background: var(--card-bg);
	color: var(--text);
	border-radius: 6px;
	padding: 4px 10px;
	font-size: 0.78rem;
	cursor: pointer;
}
.broadcast-override-delete:hover {
	border-color: #ef4444;
	color: #ef4444;
}
.broadcast-override-add-toggle {
	align-self: flex-start;
	min-height: 40px;
	padding: 0 16px;
	border: 1px solid var(--border);
	border-radius: 9px;
	background: var(--card-bg);
	color: var(--text);
	font-size: 0.86rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}
.broadcast-override-add-toggle:hover {
	border-color: var(--accent);
	color: var(--accent);
	background: var(--hover-bg);
}
.broadcast-override-accordion {
	animation: override-form-enter 0.18s ease-out;
	padding: 14px;
	border: 1px solid var(--border);
	border-radius: 12px;
	background: var(--card-bg);
}
.broadcast-override-form {
	display: grid;
	grid-template-columns: repeat(1, minmax(0, 1fr));
	gap: 12px;
}
.broadcast-override-kind-picker,
.broadcast-override-advanced-toggle,
.broadcast-override-advanced-fields {
	grid-column: 1 / -1;
}
.broadcast-override-kind-picker {
	display: grid;
	grid-template-columns: repeat(1, minmax(0, 1fr));
	gap: 8px;
}
.broadcast-override-kind-option {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	min-height: 56px;
	padding: 9px 11px;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--card-bg);
	color: var(--text);
	text-align: left;
	cursor: pointer;
}
.broadcast-override-kind-option input {
	position: absolute;
	inset: 0;
	opacity: 0;
	cursor: pointer;
}
.broadcast-override-kind-option:focus-within {
	outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
	outline-offset: 2px;
}
.broadcast-override-kind-option span {
	font-size: 0.86rem;
	font-weight: 700;
}
.broadcast-override-kind-option small {
	font-size: 0.72rem;
	color: var(--text-muted);
}
.broadcast-override-kind-option--active {
	border-color: var(--accent);
	background: color-mix(in srgb, var(--accent) 14%, var(--card-bg));
}
.broadcast-override-kind-option--active small {
	color: var(--text);
}
.broadcast-override-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.broadcast-override-field label {
	font-size: 0.75rem;
	color: var(--text-muted);
}
.broadcast-override-field input {
	height: 36px;
	padding: 0 10px;
	border-radius: 6px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	color: var(--text);
	font-size: 0.85rem;
}
.broadcast-override-checkbox {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 36px;
	font-size: 0.82rem;
	color: var(--text);
}
.broadcast-override-checkbox input {
	width: 16px;
	height: 16px;
	accent-color: var(--accent);
}
.broadcast-override-advanced-toggle {
	display: flex;
	justify-content: flex-start;
}
.broadcast-override-secondary {
	min-height: 34px;
	padding: 0 12px;
	border: 1px solid var(--border);
	border-radius: 7px;
	background: transparent;
	color: var(--text-muted);
	font-size: 0.8rem;
	font-weight: 700;
	cursor: pointer;
}
.broadcast-override-secondary:hover {
	background: var(--hover-bg);
	color: var(--text);
}
.broadcast-override-advanced-fields {
	display: grid;
	grid-template-columns: repeat(1, minmax(0, 1fr));
	gap: 12px;
	padding: 12px;
	border: 1px dashed var(--border);
	border-radius: 9px;
	background: var(--hover-bg);
}
.broadcast-override-form-actions {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}
.broadcast-override-submit,
.broadcast-override-cancel {
	height: 40px;
	border-radius: 8px;
	font-weight: 700;
	font-size: 0.88rem;
	cursor: pointer;
	padding: 0 20px;
}
.broadcast-override-submit {
	border: 1px solid var(--accent);
	background: var(--accent);
	color: #fff;
}
.broadcast-override-submit:hover {
	opacity: 0.9;
}
.broadcast-override-cancel {
	border: 1px solid var(--border);
	background: transparent;
	color: var(--text-muted);
}
.broadcast-override-cancel:hover {
	background: var(--hover-bg);
	color: var(--text);
}

@keyframes override-form-enter {
	from {
		opacity: 0;
		transform: translateY(-6px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (min-width: 768px) {
	.broadcast-override-form {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.broadcast-override-kind-picker {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
	.broadcast-override-advanced-fields {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 640px) {
	.admin-edit-section {
		padding: 16px;
		border-radius: 14px;
	}

	.admin-tab-list {
		grid-template-columns: 1fr;
	}
}

.global-lobby-section {
	padding-top: 20px;
	border-top: 1px solid var(--border);
}
.global-lobby-link {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	box-sizing: border-box;
	padding: 14px 16px;
	border-radius: 8px;
	border: 1px solid color-mix(in srgb, #0f766e 36%, var(--border));
	background: color-mix(in srgb, #14b8a6 13%, var(--card-bg));
	color: var(--text);
	text-decoration: none;
}
.global-lobby-link:hover {
	border-color: #0f766e;
	background: color-mix(in srgb, #14b8a6 18%, var(--card-bg));
}
.global-lobby-link > span:first-child {
	flex: 0 0 auto;
	font-size: 1.35rem;
	color: #0f766e;
}
.global-lobby-link strong {
	display: block;
}
.global-lobby-link strong {
	font-size: 0.95rem;
	line-height: 1.35;
}

/* Related anime */
.relations-section {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
	gap: 12px;
}
.relations-section h2 {
	grid-column: 1 / -1;
	font-size: 1rem;
	font-weight: 600;
	margin: 0;
}
.relation-group {
	display: flex;
	flex-direction: column;
	gap: 7px;
}
.relation-group h3 {
	font-size: 0.76rem;
	color: var(--text-muted);
	margin: 0;
	font-weight: 600;
}
.relation-list {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.relation-card {
	display: flex;
	gap: 9px;
	align-items: center;
	box-sizing: border-box;
	height: 64px;
	min-height: 52px;
	max-width: 290px;
	padding: 7px 10px 7px 7px;
	background: var(--card-bg);
	border: 1px solid var(--border);
	border-radius: 8px;
	color: var(--text);
	text-decoration: none;
}
a.relation-card:hover {
	border-color: var(--accent);
	background: var(--hover-bg);
}
.relation-card-thumb {
	width: 34px;
	aspect-ratio: 1 / 1.414;
	display: block;
	image-rendering: auto;
	border-radius: 4px;
	flex-shrink: 0;
	object-fit: cover;
}
.relation-card-thumb--placeholder {
	background: var(--hover-bg);
	border: 1px solid var(--border);
}
.relation-card-body {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.relation-card strong {
	display: -webkit-box;
	overflow: hidden;
	font-size: 0.84rem;
	line-height: 1.35;
	font-weight: 600;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.relation-card small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.72rem;
	color: var(--text-muted);
}
.relation-card--unavailable {
	color: var(--text-muted);
}
.mobile-relations-slot {
	display: none;
}

/* Action bar */
.action-bar {
	display: flex;
	gap: 10px;
	width: 100%;
	min-width: 0;
}
.action-bar-btn {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 4px;
	padding: 12px 8px;
	background: var(--card-bg);
	border: 1px solid var(--border);
	border-radius: 10px;
	cursor: pointer;
	color: var(--text-muted);
	text-decoration: none;
	text-align: center;
	font-size: 0.78rem;
	transition:
		background 0.12s,
		color 0.12s;
}

.action-bar-btn:hover {
	background: var(--hover-bg);
	color: var(--text);
}
.action-bar-btn.active {
	background: var(--accent);
	color: #fff;
}
.action-bar-btn--link {
	border-style: dashed;
}
.form-row {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
	min-width: 0;
	margin-bottom: 14px;
}
.form-label {
	display: flex;
	flex: 1 1 130px;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	font-size: 0.82rem;
	color: var(--color-text-muted);
	font-weight: 500;
}
.form-select,
.form-input {
	width: 100%;
	box-sizing: border-box;
	padding: 6px 10px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background: var(--bg);
	color: var(--text);
	font-size: 0.9rem;
	min-width: 130px;
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
	box-shadow: 0 2px 8px color-mix(in srgb, var(--color-accent) 40%, transparent);
}
.btn-primary--add {
	background: var(--accent);
	min-width: 170px;
	justify-content: center;
}
.btn-primary--update {
	background: color-mix(in srgb, var(--color-accent) 75%, #000);
}
.btn-primary:hover {
	opacity: 0.92;
	transform: translateY(-1px);
	box-shadow: 0 4px 14px color-mix(in srgb, var(--color-accent) 50%, transparent);
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

.recommend-form {
	display: grid;
	grid-template-columns: minmax(180px, 320px) auto;
	gap: 12px;
	align-items: end;
	min-width: 0;
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
	border: 1px solid var(--color-border);
	border-radius: 999px;
	font-size: 0.78rem;
	color: var(--text);
	background: var(--color-surface-hover);
	max-width: 100%;
}

.selected-recipient img,
.recommend-user-result img,
.recommend-user-avatar-fallback {
	width: 24px;
	aspect-ratio: 1;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.selected-recipient button {
	border: none;
	background: transparent;
	color: var(--color-text-muted);
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
	background: var(--color-surface);
	border: 1px solid var(--color-border);
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
	background: var(--color-surface-hover);
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
	color: var(--color-text-muted);
	font-size: 0.74rem;
}

.recommend-user-avatar-fallback {
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
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

/* Listed users modal */
.user-list-modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(4px);
}
.user-list-modal {
	width: 100%;
	max-width: 448px;
	padding: 24px;
	border: 1px solid #27272a;
	border-radius: 16px;
	background: #18181b;
	box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65);
}
.recommend-modal {
	max-width: 460px;
}
.recommend-modal .recommend-form {
	grid-template-columns: minmax(0, 1fr);
	align-items: stretch;
}
.recommend-modal .recommend-submit {
	width: 100%;
}
.user-list-modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 20px;
}
.user-list-modal-header h2 {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}
.user-list-modal-header h2 span {
	color: var(--text-muted);
	font-weight: 500;
}
.user-list-modal-close {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	flex-shrink: 0;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--text-muted);
	cursor: pointer;
}
.user-list-modal-close:hover {
	background: #27272a;
	color: var(--text);
}
.user-list-modal-close:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
}
.user-list-modal-close :global(.i-lucide-x) {
	width: 20px;
	height: 20px;
}
.listed-users-list {
	display: flex;
	max-height: 240px;
	flex-direction: column;
	gap: 12px;
	overflow-y: auto;
	padding-right: 4px;
}

.listed-user-card {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px;
	border-radius: 10px;
	text-decoration: none;
	color: inherit;
	transition: background 0.12s;
}
.listed-user-card:hover {
	background: #27272a;
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
	aspect-ratio: 1;
	border-radius: 50%;
	object-fit: cover;
}

.listed-user-avatar-fallback {
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
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
	border: 2px solid #18181b;
}

.listed-user-details {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 2px;
}
.listed-user-name {
	font-size: 0.9rem;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	transition: color 0.12s;
}
.listed-user-handle {
	color: var(--text-muted);
	font-size: 0.75rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.listed-user-card:hover .listed-user-name {
	color: var(--accent);
}

.listed-user-score {
	font-size: 0.68rem;
	color: var(--status-score);
	font-weight: 600;
}

/* Room tabs (ルームログ / イベント) */
.room-tabs-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.room-tabs {
	display: flex;
	gap: 6px;
	border-bottom: 1px solid var(--border);
}
.room-tab {
	appearance: none;
	background: none;
	border: none;
	border-bottom: 2px solid transparent;
	padding: 8px 4px;
	font-size: 0.9rem;
	font-weight: 600;
	color: var(--text-muted);
	cursor: pointer;
}
.room-tab:hover {
	color: var(--text);
}
.room-tab--active {
	color: var(--text);
	border-bottom-color: var(--text);
}
.room-tab-empty {
	color: var(--text-muted);
	font-size: 0.85rem;
	text-align: center;
	padding: 24px 0;
}
.event-log-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.event-log-item {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 10px 12px;
	border-radius: 10px;
	text-decoration: none;
	color: var(--text);
	border: 1px solid var(--border);
	background: var(--card-bg);
	transition:
		background 0.12s,
		border-color 0.12s;
}
.event-log-item:hover {
	background: var(--hover-bg);
	border-color: var(--text-muted);
}
.event-log-item--cancelled {
	opacity: 0.6;
}
.event-log-title {
	font-weight: 600;
	font-size: 0.9rem;
}
.event-log-date {
	color: var(--text-muted);
	font-size: 0.75rem;
}
.event-log-cancelled-badge {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	height: 18px;
	margin-top: 4px;
	padding: 0 6px;
	border-radius: 999px;
	background: #ef4444;
	color: #fff;
	font-size: 0.66rem;
	font-weight: 800;
	line-height: 1;
}

/* Room log */
.room-log-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.room-log-heading {
	font-size: 1rem;
	font-weight: 600;
	margin: 0;
}
.room-log-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
	gap: 8px;
}
.room-log-item {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 7px;
	aspect-ratio: 1;
	padding: 10px 6px;
	border-radius: 10px;
	text-decoration: none;
	color: var(--text);
	border: 1px solid var(--border);
	background: var(--card-bg);
	font-size: 0.85rem;
	transition:
		transform 0.12s,
		background 0.12s,
		border-color 0.12s;
}
.room-log-item:hover {
	background: var(--hover-bg);
	border-color: var(--text-muted);
	transform: translateY(-2px);
}
.room-log-item--latest {
	border-color: color-mix(in srgb, #2dd4bf 50%, var(--border));
	background: color-mix(in srgb, #2dd4bf 6%, var(--card-bg));
}
.room-log-item--latest:hover {
	border-color: color-mix(in srgb, #2dd4bf 70%, var(--border));
	background: color-mix(in srgb, #2dd4bf 10%, var(--card-bg));
}
.room-log-latest-slot + li {
	grid-column-start: 1;
}
.room-log-latest-label {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	color: #5eead4;
	font-size: 0.65rem;
	font-weight: 750;
	line-height: 1;
}
.room-log-ep {
	font-size: 1rem;
	font-weight: 750;
	line-height: 1.2;
	text-align: center;
}
/* スマホ版のみ使用する数字のみの短縮表示 */
.room-log-ep-compact {
	display: none;
}
.room-log-live-badge {
	position: absolute;
	top: 6px;
	right: 6px;
	display: inline-flex;
	align-items: center;
	height: 18px;
	padding: 0 6px;
	border-radius: 999px;
	background: #ef4444;
	color: #fff;
	font-size: 0.66rem;
	font-weight: 800;
	line-height: 1;
}
.room-log-date {
	color: var(--text-muted);
	font-size: 0.68rem;
	line-height: 1;
}

/* Responsive */
@media (max-width: 768px) {
	/* 左=情報カラム / 右=アクションリモコン の2カラム。title/mainは全幅 */
	.anime-layout {
		display: grid;
		grid-template-columns: minmax(0, 150px) minmax(0, 1fr);
		grid-template-rows: auto auto auto;
		grid-template-areas:
			"title title"
			"left remote"
			"main main";
		align-items: start;
		column-gap: 14px;
		row-gap: 16px;
	}
	/* 左カラム: カバー画像の下に静的データを縦積み */
	.left-panel {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}
	.cover-col {
		width: 100%;
	}
	.anime-cover {
		max-width: none;
	}
	/* PC版の冗長なラベル付きdlは隠し、圧縮メタを表示（Resourcesは維持） */
	.left-panel-info .prod-info {
		display: none;
	}
	.mobile-meta {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 8px;
	}
	.mobile-meta-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.mobile-meta-chip {
		font-size: 11px;
		line-height: 1.3;
		padding: 2px 7px;
		border-radius: 10px;
		background: var(--hover-bg);
		color: var(--text-muted);
		border: 1px solid var(--border);
		text-decoration: none;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.mobile-meta-chip:hover,
	.mobile-meta-chip:active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.mobile-hashtags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.mobile-hashtag {
		font-size: 11px;
		color: var(--accent);
		text-decoration: none;
	}
	.mobile-hashtag:hover {
		text-decoration: underline;
	}
	.mobile-official-icons {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 2px;
	}
	.mobile-icon-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--hover-bg);
		color: var(--text);
		font-size: 0.95rem;
		text-decoration: none;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.mobile-icon-link [class^="i-lucide"] {
		width: 1em;
		height: 1em;
	}
	.mobile-icon-link:hover {
		border-color: var(--accent);
		background: var(--card-bg);
	}
	/* 右カラム: 純粋なアクションリモコン化（スコア＋リストを横並び→ボタン→管理者） */
	.remote {
		gap: 12px;
	}
	.remote .stats-grid {
		gap: 8px;
		flex-wrap: nowrap;
	}
	.remote .stat-card {
		flex: 1 1 0;
		min-width: 0;
		padding: 10px 12px;
	}
	.remote .stat-card-value {
		font-size: 1.35rem;
	}
	.remote .action-bar {
		gap: 8px;
	}
	.remote .action-bar-btn {
		padding: 10px 4px;
		font-size: 0.68rem;
	}
	.mobile-relations-slot {
		display: block;
		min-width: 0;
	}
	.desktop-relations-slot {
		display: none;
	}
	.remote .relations-section {
		gap: 10px;
	}
	.remote .relations-section h2 {
		font-size: 0.9rem;
	}
	.remote .relation-group {
		gap: 6px;
	}
	.remote .relation-list {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
	}
	.remote .relation-card {
		width: 100%;
		height: 56px;
		max-width: none;
		min-width: 0;
		min-height: 48px;
		padding: 6px 8px 6px 6px;
	}
	.remote .relation-card-thumb {
		width: 30px;
	}
	.remote .relation-card strong,
	.remote .relation-card small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.remote-admin-btn {
		display: inline-block;
		align-self: flex-start;
		margin-top: 2px;
		padding: 4px 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font-size: 11px;
		text-align: left;
		cursor: pointer;
	}
	.remote-admin-btn:hover {
		color: var(--text);
		text-decoration: underline;
	}
	/* スマホではカード内トグルを隠し、リモコン側ボタンで開閉。閉時はカードを畳む */
	.admin-edit-toggle {
		display: none;
	}
	.admin-edit-section:not(.admin-edit-section--open) {
		display: none;
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
	/* ルームログ: 数字のみの小型ボックスで一覧性を向上 */
	.room-log-list {
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 6px;
	}
	.room-log-item {
		gap: 0;
		padding: 4px;
		border-radius: 8px;
	}
	.room-log-ep,
	.room-log-date,
	.room-log-latest-label {
		display: none;
	}
	.room-log-ep-compact {
		display: block;
		font-size: 0.9rem;
		font-weight: 750;
		line-height: 1.1;
		text-align: center;
	}
	.room-log-live-badge {
		top: 3px;
		right: 3px;
		height: 14px;
		padding: 0 4px;
		font-size: 0.55rem;
	}
}

@media (max-width: 480px) {
	.anime-layout {
		grid-template-columns: minmax(0, 128px) minmax(0, 1fr);
		column-gap: 10px;
	}
	.anime-title {
		font-size: 1.1rem;
	}
	.detail-page {
		padding-left: 8px;
		padding-right: 8px;
	}
}
</style>
