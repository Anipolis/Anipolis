<script lang="ts">
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { AnimeStatus, Notification } from "$lib/types";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

type TabId = "normal" | "room" | "mylist";

const tabs: { id: TabId; label: string }[] = [
	{ id: "normal", label: "通常" },
	{ id: "room", label: "ルーム" },
	{ id: "mylist", label: "マイリスト" },
];

const activeTab = $derived(data.tab as TabId);
const activeNotifications = $derived(data.notifications[activeTab] as Notification[]);

function notificationLabel(type: string): string {
	if (type === "like") return "があなたの投稿にいいねしました";
	if (type === "repost") return "があなたの投稿をリポストしました";
	if (type === "reply") return "があなたの投稿に返信しました";
	if (type === "mention") return "があなたをメンションしました";
	if (type === "follow") return "があなたをフォローしました";
	if (type === "anime_recommendation") return "が作品を推薦しました";
	if (type === "follow_request") return "さんからフォロー申請が届きました";
	return "";
}

function mylistStatusLabel(status: AnimeStatus | null): string {
	if (status === "plan_to_watch") return "を視聴予定に追加しました";
	if (status === "watching") return "を視聴中にしました";
	if (status === "completed") return "を完了にしました";
	return "のステータスを変更しました";
}

function formatBroadcastTime(value: string | null): string {
	if (!value) return "";
	return new Date(value).toLocaleString("ja-JP", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function broadcastLabel(value: string | null): string {
	if (value && new Date(value).getTime() <= Date.now()) return "の放送ルームが開始しました";
	return "の放送ルームがまもなく開始します";
}

function eventBroadcastLabel(value: string | null): string {
	if (value && new Date(value).getTime() <= Date.now()) return "が開始しました";
	return "がまもなく開始します";
}

function emptyMessage(tab: TabId): string {
	if (tab === "room") return "ルームの通知はまだありません";
	if (tab === "mylist") return "フォロー中ユーザーのマイリスト通知はまだありません";
	return "通知はまだありません";
}
</script>

<svelte:head> <title>通知 - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column notifications-column">
		<header class="notifications-header">
			<h1>通知</h1>
		</header>

		<nav class="notif-tab-bar" aria-label="通知カテゴリ">
			{#each tabs as tab (tab.id)}
				<a
					href="?tab={tab.id}"
					class="notif-tab notif-tab--{tab.id}"
					class:active={activeTab === tab.id}
					aria-current={activeTab === tab.id ? 'page' : undefined}
					data-sveltekit-noscroll
				>
					<span class="tab-label">{tab.label}</span>
					{#if data.unreadCounts[tab.id] > 0}
						<span class="tab-badge"
							>{data.unreadCounts[tab.id] > 99 ? '99+' : data.unreadCounts[tab.id]}</span
						>
					{/if}
				</a>
			{/each}
		</nav>

		{#if activeNotifications.length === 0}
			<div class="notifications-empty">
				<p>{emptyMessage(activeTab)}</p>
			</div>
		{:else}
			<ul class="notification-list">
				{#each activeNotifications as notif (notif.id)}
					<li class="notification-item">
						{#if notif.type === 'broadcast'}
							<div class="notification-room-icon" aria-hidden="true">
								<span class="i-lucide-calendar-clock"></span>
							</div>
							<div class="notification-body">
								{#if notif.event_id}
									<p class="notification-text">
										<strong>{notif.event_title ?? 'イベント'}</strong>
										{eventBroadcastLabel(notif.broadcast_scheduled_at)}
									</p>
									<a href="/events/{notif.event_id}" class="notification-anime-preview">
										<span>
											<strong>{notif.event_title ?? 'イベントルーム'}</strong>
											<small>{formatBroadcastTime(notif.broadcast_scheduled_at)} 開始</small>
										</span>
									</a>
								{:else}
									<p class="notification-text">
										<strong>{notif.broadcast_anime_title ?? '登録したアニメ'}</strong>
										{broadcastLabel(notif.broadcast_scheduled_at)}
									</p>
									{#if notif.broadcast_anime_id && notif.broadcast_room_date}
										<a
											href="/rooms/anime/{notif.broadcast_anime_id}/{notif.broadcast_room_date}"
											class="notification-anime-preview"
										>
											{#if notif.broadcast_anime_cover_url}
												<img
													src={notif.broadcast_anime_cover_url}
													alt={notif.broadcast_anime_title ?? '放送作品'}
												>
											{/if}
											<span>
												<strong>{notif.broadcast_anime_title ?? '放送ルーム'}</strong>
												<small>{formatBroadcastTime(notif.broadcast_scheduled_at)} 開始</small>
											</span>
										</a>
									{/if}
								{/if}
								<span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
							</div>
						{:else if notif.type === 'exchange_matched'}
							<div class="notification-room-icon" aria-hidden="true">
								<span class="i-lucide-arrow-left-right"></span>
							</div>
							<div class="notification-body">
								<p class="notification-text">アニメトレードがマッチしました</p>
								<a href="/exchange" class="notification-anime-preview">
									{#if notif.exchange_anime_cover_url}
										<img
											src={notif.exchange_anime_cover_url}
											alt={notif.exchange_anime_title ?? '受け取った作品'}
										>
									{/if}
									<span>
										<strong>{notif.exchange_anime_title ?? '受け取った作品'}</strong>
										<small>を受け取りました</small>
									</span>
								</a>
								<span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
							</div>
						{:else if notif.type === 'mylist_status'}
							<a href="/profile/{notif.actor_username}" class="notification-avatar">
								<UserAvatar src={notif.actor_avatar_url} username={notif.actor_username} size="md" />
							</a>
							<div class="notification-body">
								<p class="notification-text">
									<a href="/profile/{notif.actor_username}" class="notification-actor">
										{notif.actor_display_name ?? notif.actor_username}
									</a>
									<strong>{notif.mylist_anime_title ?? '作品'}</strong>
									{mylistStatusLabel(notif.mylist_status)}
								</p>
								{#if notif.mylist_anime_id}
									<a href="/anime/{notif.mylist_anime_id}" class="notification-anime-preview">
										{#if notif.mylist_anime_cover_url}
											<img
												src={notif.mylist_anime_cover_url}
												alt={notif.mylist_anime_title ?? '作品'}
											>
										{/if}
										<span> <strong>{notif.mylist_anime_title ?? '作品'}</strong> </span>
									</a>
								{/if}
								<span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
							</div>
						{:else}
							<a href="/profile/{notif.actor_username}" class="notification-avatar">
								<UserAvatar src={notif.actor_avatar_url} username={notif.actor_username} size="md" />
							</a>
							<div class="notification-body">
								<p class="notification-text">
									<a href="/profile/{notif.actor_username}" class="notification-actor">
										{notif.actor_display_name ?? notif.actor_username}
									</a>
									{notificationLabel(notif.type)}
								</p>
								{#if notif.post_content && notif.post_id}
									<a href="/posts/{notif.post_id}" class="notification-post-preview">
										{notif.post_content.length > 80
											? `${notif.post_content.slice(0, 80)}…`
											: notif.post_content}
									</a>
								{/if}
								{#if notif.type === 'anime_recommendation' && notif.recommendation_anime_id}
									<a href="/anime/{notif.recommendation_anime_id}" class="notification-anime-preview">
										{#if notif.recommendation_anime_cover_url}
											<img
												src={notif.recommendation_anime_cover_url}
												alt={notif.recommendation_anime_title ?? '推薦作品'}
											>
										{/if}
										<span> <strong>{notif.recommendation_anime_title ?? '推薦作品'}</strong> </span>
									</a>
								{/if}
								{#if notif.type === 'follow_request'}
									<a href="/settings/follow-requests" class="notification-action-link">申請を確認</a>
								{/if}
								<span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.notifications-column {
	padding: 0;
}

.notifications-header {
	padding: 1rem 0;
	border-bottom: 1px solid var(--border);
}

.notifications-header h1 {
	font-size: 1.25rem;
	font-weight: 700;
	margin: 0;
}

/* ---- タブバー（デスクトップ = ピル） ---- */
.notif-tab-bar {
	display: flex;
	gap: 8px;
	overflow-x: auto;
	padding: 12px 0;
	scrollbar-width: none;
}

.notif-tab-bar::-webkit-scrollbar {
	display: none;
}

.notif-tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 8px 16px;
	border-radius: 20px;
	font-size: 0.85rem;
	font-weight: 600;
	text-decoration: none;
	white-space: nowrap;
	flex-shrink: 0;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
	color: var(--fg-muted, #94a3b8);
	transition:
		background 0.15s,
		color 0.15s;
}

.notif-tab.active {
	background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	color: var(--color-accent);
}

.tab-badge {
	display: inline-grid;
	place-items: center;
	min-width: 18px;
	height: 18px;
	padding: 0 5px;
	border-radius: 9999px;
	background: var(--color-accent, #6366f1);
	color: #fff;
	font-size: 11px;
	font-weight: 700;
	line-height: 1;
}

.notif-tab.active .tab-badge {
	background: var(--color-accent, #6366f1);
}

.notifications-empty {
	padding: 48px 16px;
	text-align: center;
	color: var(--color-text-muted, #94a3b8);
	font-size: 0.9rem;
}

.notification-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.notification-item {
	display: flex;
	gap: 12px;
	padding: 14px 0;
	border-bottom: 1px solid var(--color-border);
}

.notification-avatar {
	flex-shrink: 0;
}

.notification-room-icon {
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 9999px;
	background: color-mix(in srgb, var(--accent, #6366f1) 16%, transparent);
	color: var(--accent, #6366f1);
	font-size: 20px;
	flex-shrink: 0;
}

.notification-body {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.notification-text {
	margin: 0;
	font-size: 14px;
	color: var(--color-text);
	line-height: 1.4;
}

.notification-actor {
	font-weight: 700;
	color: var(--color-text);
	text-decoration: none;
}

.notification-actor:hover {
	text-decoration: underline;
}

.notification-post-preview {
	display: block;
	font-size: 13px;
	color: var(--color-text-muted);
	text-decoration: none;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.notification-post-preview:hover {
	text-decoration: underline;
}

.notification-anime-preview {
	display: flex;
	gap: 10px;
	align-items: center;
	width: fit-content;
	max-width: 100%;
	margin-top: 4px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	color: inherit;
	text-decoration: none;
	background: var(--color-surface);
}

.notification-anime-preview:hover {
	border-color: var(--color-accent);
}

.notification-anime-preview img {
	width: 34px;
	display: block;
	image-rendering: auto;
	border-radius: 4px;
	flex-shrink: 0;
}

.notification-anime-preview span {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.notification-anime-preview strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.notification-anime-preview strong {
	font-size: 13px;
}

.notification-anime-preview small {
	font-size: 12px;
	color: var(--color-text-muted);
}

.notification-action-link {
	width: fit-content;
	font-size: 13px;
	font-weight: 700;
	color: var(--color-accent, #6366f1);
	text-decoration: none;
}

.notification-action-link:hover {
	text-decoration: underline;
}

.notification-time {
	font-size: 12px;
	color: var(--color-text-muted);
}

/* ---- モバイル = 下線付きフルワイドタブ（マイリストページに準拠） ---- */
@media (max-width: 600px) {
	.notif-tab-bar {
		width: 100%;
		gap: 0;
		padding: 0;
		margin-bottom: 4px;
		border-bottom: 1px solid var(--border, #334155);
		overflow: hidden;
	}

	.notif-tab {
		position: relative;
		flex: 1 1 33%;
		justify-content: center;
		min-width: 0;
		gap: 5px;
		padding: 12px 0;
		border-radius: 0;
		background: transparent;
		font-size: 13px;
	}

	.notif-tab.active {
		background: transparent;
	}

	.notif-tab.active::after {
		position: absolute;
		right: 12px;
		bottom: -1px;
		left: 12px;
		height: 2px;
		border-radius: 2px 2px 0 0;
		background: currentColor;
		content: "";
	}

	.tab-badge {
		min-width: 16px;
		height: 16px;
		font-size: 10px;
	}
}
</style>
