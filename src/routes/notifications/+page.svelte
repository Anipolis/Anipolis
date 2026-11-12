<script lang="ts">
import { untrack } from "svelte";
import { activityStatusPhrase } from "$lib/activity";
import InfoTip from "$lib/components/InfoTip.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import { groupActivityLikes } from "$lib/notification-groups";
import { notificationPostPreview } from "$lib/notification-post-preview";
import { requestNotificationCountsRefresh } from "$lib/stores/notifications";
import type { Notification } from "$lib/types";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

// アクティビティへのいいねは、同じ記録への分を1件にまとめて出す
const entries = $derived(groupActivityLikes(data.notifications as Notification[]));

// 既読化はページが実際に描画された後にだけ行う。server load で既読化すると、
// hover プリロードやブラウザの先読みで load が走っただけで未読が消える（#242）。
$effect(() => {
	if (data.unreadCount === 0) return;
	void untrack(async () => {
		try {
			const response = await fetch("/api/notifications/read", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ category: "normal" }),
			});
			if (response.ok) requestNotificationCountsRefresh();
		} catch {
			// 失敗時は未読のまま残す（次にページを開いたときに再試行される）
		}
	});
});

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
</script>

<svelte:head> <title>通知 - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column notifications-column">
		<header class="notifications-header">
			<h1 class="with-info-tip">
				通知
				<InfoTip label="通知に届くもの">
					<p>いいね・リポスト・返信・メンション・フォロー・作品のおすすめ・トレードの成立</p>
					<p>カレンダーでベルを付けた番組が始まる前のお知らせは、カレンダーに出ます</p>
					<p>フォロー中の人のマイリストの動きは、タイムラインの「アクティビティ」で見られます</p>
				</InfoTip>
			</h1>
		</header>

		{#if entries.length === 0}
			<div class="notifications-empty">
				<p>通知はまだありません</p>
			</div>
		{:else}
			<ul class="notification-list">
				{#each entries as { notif, others } (notif.id)}
					<li class="notification-item">
						{#if notif.type === "exchange_matched"}
							<div class="notification-room-icon" aria-hidden="true">
								<span class="i-lucide-arrow-left-right"></span>
							</div>
							<div class="notification-body">
								<p class="notification-text">アニメトレードがマッチしました</p>
								<a href="/exchange" class="notification-anime-preview">
									{#if notif.exchange_anime_cover_url}
										<img
											src={coverThumbSrc(notif.exchange_anime_cover_url)}
											{@attach coverThumbFallback(notif.exchange_anime_cover_url)}
											alt={notif.exchange_anime_title ?? "受け取った作品"}
										>
									{/if}
									<span>
										<strong>{notif.exchange_anime_title ?? "受け取った作品"}</strong>
										<small>を受け取りました</small>
									</span>
								</a>
								<span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
							</div>
						{:else if notif.type === "activity_like"}
							<a href="/profile/{notif.actor_username}" class="notification-avatar">
								<UserAvatar src={notif.actor_avatar_url} username={notif.actor_username} size="md" />
							</a>
							<div class="notification-body">
								<p class="notification-text">
									<a href="/profile/{notif.actor_username}" class="notification-actor">
										{notif.actor_display_name ?? notif.actor_username}
									</a>
									{#if others.length > 0}
										ほか{others.length}人
									{/if}
									があなたのアクティビティにいいねしました
								</p>
								{#if notif.activity_anime_id}
									<a href="/anime/{notif.activity_anime_id}" class="notification-anime-preview">
										{#if notif.activity_anime_cover_url}
											<img
												src={coverThumbSrc(notif.activity_anime_cover_url)}
												{@attach coverThumbFallback(notif.activity_anime_cover_url)}
												alt={notif.activity_anime_title ?? "作品"}
											>
										{/if}
										<span>
											<strong>{notif.activity_anime_title ?? "作品"}</strong>
											{#if notif.activity_status}
												<small>を{activityStatusPhrase(notif.activity_status)}</small>
											{/if}
										</span>
									</a>
								{/if}
								<span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
							</div>
						{:else}
							{@const postPreview = notificationPostPreview(notif)}
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
								{#if postPreview?.kind === "link"}
									<!-- 本文なし（画像・作品引用のみ等）でも post_id があれば投稿へ移動できるようにする -->
									<a
										href={postPreview.href}
										class="notification-post-preview"
										class:notification-post-preview--placeholder={postPreview.placeholder}
									>
										{postPreview.text}
									</a>
								{:else if postPreview?.kind === "deleted"}
									<span class="notification-post-preview notification-post-preview--deleted">
										{postPreview.text}
									</span>
								{/if}
								{#if notif.type === "anime_recommendation" && notif.recommendation_anime_id}
									<a href="/anime/{notif.recommendation_anime_id}" class="notification-anime-preview">
										{#if notif.recommendation_anime_cover_url}
											<img
												src={coverThumbSrc(notif.recommendation_anime_cover_url)}
												{@attach coverThumbFallback(notif.recommendation_anime_cover_url)}
												alt={notif.recommendation_anime_title ?? "推薦作品"}
											>
										{/if}
										<span> <strong>{notif.recommendation_anime_title ?? "推薦作品"}</strong> </span>
									</a>
								{/if}
								{#if notif.type === "follow_request"}
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
	corner-shape: round;
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

/* 本文なし投稿の文脈ラベル（「画像の投稿」等）は本文抜粋と区別して斜体にする */
.notification-post-preview--placeholder {
	font-style: italic;
}

/* 削除済み投稿はリンクにせず、薄く表示する */
.notification-post-preview--deleted {
	font-style: italic;
	opacity: 0.7;
	cursor: default;
}

.notification-post-preview--deleted:hover {
	text-decoration: none;
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
	border-radius: var(--radius-sm);
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
</style>
