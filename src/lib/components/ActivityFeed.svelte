<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import { type ActivityGroup, activityStatusPhrase, groupActivities, type MylistActivity } from "$lib/activity";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import { formatRelativeTime } from "$lib/utils/format";
import UserAvatar from "./UserAvatar.svelte";

/**
 * 「アクティビティ」（181）。タイムラインではフォロー中の人の、プロフィールではその人のマイリストの動きを並べる。
 * 同じ人が同じステータスに続けて入れた分は1行にまとめ、まとまりは広げてから作品ごとにいいねする
 * （まとまり全体へのいいねは、何に共感したのかが伝わらないため置かない）
 */
interface Props {
	items: MylistActivity[];
	/** いいねを押せるか。押せないとき（未ログイン・自分の記録）はいいねの数だけ出す */
	canLike: boolean;
	/** 行ごとに人のアイコンと名前を出すか。プロフィールでは全部同じ人なので出さない */
	showUser?: boolean;
}

let { items, canLike, showUser = true }: Props = $props();

const groups = $derived(groupActivities(items));
const expanded = new SvelteSet<string>();

/** このまとまりの表紙を並べる数（残りは「+3」） */
const PREVIEW_COVERS = 5;

// いいねは押した後の値をここに持つ（一覧の再読み込みまで）。保存中の記録は二重に押せないようにする
let likeOverrides = $state<Record<string, { liked: boolean; count: number }>>({});
const saving = new SvelteSet<string>();
let likeError = $state<{ id: string; message: string } | null>(null);
let popping = $state<string | null>(null);

function likeState(item: MylistActivity) {
	return likeOverrides[item.id] ?? { liked: item.liked, count: item.like_count };
}

function groupLikeCount(group: ActivityGroup): number {
	return group.items.reduce((sum, item) => sum + likeState(item).count, 0);
}

async function toggleLike(item: MylistActivity) {
	if (!canLike || saving.has(item.id)) return;
	const before = likeState(item);
	const liked = !before.liked;
	likeOverrides[item.id] = { liked, count: Math.max(0, before.count + (liked ? 1 : -1)) };
	popping = liked ? item.id : null;
	likeError = null;
	saving.add(item.id);
	try {
		const response = await fetch(`/api/activities/${item.id}/like`, { method: liked ? "POST" : "DELETE" });
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { message?: string } | null;
			likeOverrides[item.id] = before;
			likeError = { id: item.id, message: body?.message ?? "いいねできませんでした" };
			return;
		}
		const body = (await response.json()) as { liked: boolean; likeCount: number | null };
		likeOverrides[item.id] = { liked: body.liked, count: body.likeCount ?? likeOverrides[item.id]?.count ?? 0 };
	} catch {
		likeOverrides[item.id] = before;
		likeError = { id: item.id, message: "いいねできませんでした" };
	} finally {
		saving.delete(item.id);
	}
}

function toggleExpanded(key: string) {
	if (expanded.has(key)) expanded.delete(key);
	else expanded.add(key);
}

function userName(group: ActivityGroup): string {
	return group.user.display_name || group.user.username;
}
</script>

{#snippet cover(item: MylistActivity, size: 'sm' | 'md')}
	<span class="activity-cover activity-cover--{size}">
		{#if item.anime.cover_url}
			<img
				src={coverThumbSrc(item.anime.cover_url)}
				{@attach coverThumbFallback(item.anime.cover_url)}
				alt=""
				loading="lazy"
			>
		{/if}
	</span>
{/snippet}

{#snippet likeButton(item: MylistActivity)}
	{@const state = likeState(item)}
	{#if !canLike}
		{#if state.count > 0}
			<span class="activity-like activity-like--static" aria-label="いいね {state.count}">
				<span class="i-lucide-heart" aria-hidden="true"></span>
				{state.count}
			</span>
		{/if}
	{:else}
		<span class="activity-like">
			<button
				type="button"
				class="post-action-btn post-like-btn reaction-icon-hitbox activity-like-btn"
				class:active={state.liked}
				class:popping={popping === item.id}
				aria-pressed={state.liked}
				aria-label={state.liked ? `「${item.anime.title}」へのいいねを取り消す` : `「${item.anime.title}」にいいね`}
				disabled={!canLike}
				onclick={() => void toggleLike(item)}
				onanimationend={() => (popping = null)}
			>
				<svg
					width="17"
					height="17"
					viewBox="0 0 24 24"
					fill={state.liked ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
					/>
				</svg>
			</button>
			<span class="activity-like-count" class:activity-like-count--active={state.liked}>
				{state.count > 0 ? state.count : ''}
			</span>
		</span>
	{/if}
{/snippet}

{#snippet animeRow(item: MylistActivity)}
	<div class="activity-anime">
		<a href="/anime/{item.anime.id}" class="activity-anime-link">
			{@render cover(item, 'md')}
			<span class="activity-anime-text">
				<span class="activity-anime-title">{item.anime.title}</span>
				{#if item.score != null}
					<span class="activity-score" aria-label="スコア {item.score}">★ {item.score}</span>
				{/if}
			</span>
		</a>
		{@render likeButton(item)}
	</div>
	{#if likeError?.id === item.id}
		<p class="activity-error" role="alert">{likeError.message}</p>
	{/if}
{/snippet}

<ul class="activity-list">
	{#each groups as group (group.key)}
		{@const first = group.items[0]}
		{@const isGroup = group.items.length > 1}
		{@const isOpen = expanded.has(group.key)}
		{#if first}
			<li class="activity-item">
				{#if showUser}
					<a href="/profile/{group.user.username}" class="activity-avatar" aria-label={userName(group)}>
						<UserAvatar src={group.user.avatar_url} username={group.user.username} size="sm" />
					</a>
				{/if}
				<div class="activity-body">
					<p class="activity-text">
						{#if showUser}
							<a href="/profile/{group.user.username}" class="activity-user">{userName(group)}</a>
							<span>
								が{isGroup ? `${group.items.length}作品を` : ''}{activityStatusPhrase(group.status)}
							</span>
						{:else}
							<span
								>{isGroup ? `${group.items.length}作品を` : ''}
								{activityStatusPhrase(group.status)}</span
							>
						{/if}
						<time class="activity-time" datetime={first.created_at}
							>{formatRelativeTime(first.created_at)}</time
						>
					</p>

					{#if !isGroup}
						{@render animeRow(first)}
					{:else if isOpen}
						<div class="activity-expanded">
							{#each group.items as item (item.id)}
								{@render animeRow(item)}
							{/each}
						</div>
						<button
							type="button"
							class="activity-toggle"
							aria-expanded="true"
							onclick={() => toggleExpanded(group.key)}
						>
							<span class="i-lucide-chevron-up" aria-hidden="true"></span>
							たたむ
						</button>
					{:else}
						{@const totalLikes = groupLikeCount(group)}
						<button
							type="button"
							class="activity-collapsed"
							aria-expanded="false"
							aria-label="{group.items.length}作品を広げる"
							onclick={() => toggleExpanded(group.key)}
						>
							<span class="activity-cover-strip" aria-hidden="true">
								{#each group.items.slice(0, PREVIEW_COVERS) as item (item.id)}
									{@render cover(item, 'sm')}
								{/each}
								{#if group.items.length > PREVIEW_COVERS}
									<span class="activity-cover-more">+{group.items.length - PREVIEW_COVERS}</span>
								{/if}
							</span>
							{#if totalLikes > 0}
								<!-- 中のいいねが閉じたままでも分かるように、合計だけ出す -->
								<span class="activity-group-likes" aria-label="いいね {totalLikes}">
									<span class="i-lucide-heart" aria-hidden="true"></span>
									{totalLikes}
								</span>
							{/if}
							<span class="activity-toggle-label">
								広げる
								<span class="i-lucide-chevron-down" aria-hidden="true"></span>
							</span>
						</button>
					{/if}
				</div>
			</li>
		{/if}
	{/each}
</ul>

<style>
.activity-list {
	margin: 0;
	padding: 0;
	list-style: none;
}
.activity-item {
	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border-bottom: 1px solid var(--color-border);
}
.activity-avatar {
	flex-shrink: 0;
	align-self: flex-start;
}
.activity-body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
}
.activity-text {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	column-gap: 2px;
	margin: 0;
	font-size: 14px;
	line-height: 1.5;
}
.activity-user {
	color: var(--color-text);
	font-weight: 700;
	text-decoration: none;
}
.activity-user:hover {
	text-decoration: underline;
}
.activity-time {
	margin-left: 6px;
	color: var(--color-text-muted);
	font-size: 12px;
}
.activity-anime {
	display: flex;
	align-items: center;
	gap: 8px;
}
.activity-anime-link {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 10px;
	min-width: 0;
	padding: 4px;
	margin: -4px;
	border-radius: 8px;
	color: var(--color-text);
	text-decoration: none;
}
.activity-anime-link:hover {
	background: var(--color-surface-hover);
}
.activity-anime-text {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.activity-anime-title {
	overflow: hidden;
	font-size: 13px;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.activity-score {
	color: var(--status-score);
	font-size: 12px;
	font-weight: 700;
}
.activity-cover {
	display: block;
	flex-shrink: 0;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 4px;
	background: var(--color-bg-card);
}
.activity-cover--md {
	width: 36px;
}
.activity-cover--sm {
	width: 32px;
}
.activity-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.activity-like {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
}
.activity-like--static {
	gap: 3px;
	padding-right: 4px;
	color: var(--color-text-muted);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}
.activity-like--static span {
	width: 14px;
	height: 14px;
}
.activity-like-btn {
	position: relative;
	justify-content: center;
	width: 32px;
	height: 32px;
}
.activity-like-count {
	min-width: 1.5em;
	color: var(--color-text-muted);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}
.activity-like-count--active {
	color: #f43f5e;
}
.activity-expanded {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.activity-collapsed {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 4px;
	margin: -4px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	text-align: left;
}
.activity-collapsed:hover {
	background: var(--color-surface-hover);
}
.activity-cover-strip {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}
.activity-cover-more {
	padding-left: 2px;
	font-size: 12px;
	font-weight: 700;
	white-space: nowrap;
}
.activity-group-likes {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 3px;
	color: #f43f5e;
	font-size: 12px;
	font-weight: 700;
}
.activity-group-likes span {
	width: 13px;
	height: 13px;
}
.activity-toggle-label,
.activity-toggle {
	display: inline-flex;
	flex-shrink: 0;
	white-space: nowrap;
	align-items: center;
	gap: 2px;
	margin-left: auto;
	font-size: 12px;
	font-weight: 600;
}
.activity-toggle {
	align-self: flex-start;
	margin-left: 0;
	padding: 4px 8px;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-family: inherit;
}
.activity-toggle:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.activity-toggle span,
.activity-toggle-label span {
	width: 14px;
	height: 14px;
}
/* スマホでは表紙を小さくして、いいねの合計と「広げる」を1行に収める */
@media (max-width: 640px) {
	.activity-cover--sm {
		width: 26px;
	}
	.activity-collapsed {
		gap: 8px;
	}
}
.activity-error {
	margin: 0;
	color: var(--color-error-text);
	font-size: 12px;
}
</style>
