<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { Anime, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const { profile, posts, imagePosts, isOwn, canViewContent } = $derived(data);
const displayName = $derived(profile.display_name ?? profile.username);

let isFollowing = $state(false);
let followRequestStatus = $state<"none" | "pending">("none");
let followerCount = $state(0);
let editDisplayName = $state(untrack(() => data.profile.display_name ?? ""));
let editBio = $state(untrack(() => data.profile.bio ?? ""));
let editProfileId = $state(untrack(() => data.profile.id));
let profileSubmitting = $state(false);
let showUserReportModal = $state(false);
let reportReason = $state("harassment");
let reportDetails = $state("");
let reportSubmitting = $state(false);
let reportMessage = $state("");

$effect(() => {
	isFollowing = data.isFollowing;
	followRequestStatus = data.followRequestStatus;
	followerCount = data.followCounts.followers;
});

$effect(() => {
	if (editProfileId === data.profile.id) return;
	editProfileId = data.profile.id;
	editDisplayName = data.profile.display_name ?? "";
	editBio = data.profile.bio ?? "";
});

const activeTab = $derived(
	(page.url.searchParams.get("tab") ?? "posts") as "posts" | "images" | "list" | "likes" | "edit",
);
const bioRemaining = $derived(160 - editBio.length);

const handleProfileSubmit: SubmitFunction = () => {
	profileSubmitting = true;
	return async ({ result, update }) => {
		profileSubmitting = false;
		await update({ reset: false });
		if (result.type === "success") {
			editDisplayName = data.profile.display_name ?? "";
			editBio = data.profile.bio ?? "";
		}
	};
};

async function submitUserReport() {
	if (reportSubmitting) return;
	reportSubmitting = true;
	reportMessage = "";

	try {
		const fd = new FormData();
		fd.append("target_type", "user");
		fd.append("target_id", profile.id);
		fd.append("reason", reportReason);
		fd.append("details", reportDetails.trim());

		const res = await fetch("/api/reports", { method: "POST", body: fd });
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			reportMessage = body.message ?? "通報の送信に失敗しました";
		} else {
			reportMessage = "通報を受け付けました";
			reportDetails = "";
			setTimeout(() => {
				showUserReportModal = false;
				reportMessage = "";
			}, 900);
		}
	} catch {
		reportMessage = "通報の送信に失敗しました";
	}

	reportSubmitting = false;
}

const statusOrder: AnimeStatus[] = ["watching", "completed", "plan_to_watch", "on_hold", "dropped"];

const statusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断中",
	dropped: "断念",
};

const statusIcon: Record<AnimeStatus, string> = {
	watching: "▶",
	completed: "✓",
	plan_to_watch: "📋",
	on_hold: "⏸",
	dropped: "✕",
};

const animeList = $derived((data.animeList ?? []) as Anime[]);

const grouped = $derived(
	statusOrder.reduce<Record<AnimeStatus, Anime[]>>(
		(acc, status) => {
			acc[status] = animeList.filter((e) => e.user_entry?.status === status);
			return acc;
		},
		{ watching: [], completed: [], plan_to_watch: [], on_hold: [], dropped: [] },
	),
);
</script>

<svelte:head> <title>{displayName} (@{profile.username}) — Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<div class="profile-header">
			<UserAvatar src={profile.avatar_url} username={profile.username} size="lg" />
			<div class="profile-info">
				<div class="profile-display-name">{displayName}</div>
				<div class="profile-username">
					@{profile.username}
					{#if profile.is_private}
						<span class="profile-lock-badge" title="鍵アカウント">鍵</span>
					{/if}
				</div>
				{#if profile.bio}
					<p class="profile-bio">{profile.bio}</p>
				{/if}
				<div class="profile-stats">
					<span class="profile-stat">
						<strong>{posts.length}</strong>
						<span>投稿</span>
					</span>
					<a href="/profile/{profile.username}/followers" class="profile-stat profile-stat--link">
						<strong>{followerCount}</strong>
						<span>フォロワー</span>
					</a>
					<a href="/profile/{profile.username}/following" class="profile-stat profile-stat--link">
						<strong>{data.followCounts.following}</strong>
						<span>フォロー中</span>
					</a>
					{#if canViewContent && (profile.list_is_public || isOwn)}
						<span class="profile-stat">
							<strong>{animeList.length}</strong>
							<span>アニメ</span>
						</span>
					{/if}
				</div>

				{#if isOwn}
					<a
						href="/profile/{profile.username}?tab=edit"
						class="btn btn-outline"
						style="margin-top: 12px; font-size: 13px;"
					>
						プロフィールを編集
					</a>
				{:else if data.user}
					<div class="profile-actions">
						<form
							method="POST"
							action="?/follow"
							use:enhance={() => {
                            return async ({ result }) => {
                                if (result.type === 'success' && result.data) {
                                    const payload = result.data as { followed: boolean; requestStatus?: "none" | "pending" };
                                    const followed = payload.followed;
                                    isFollowing = followed;
                                    followRequestStatus = payload.requestStatus ?? "none";
                                    if (followed !== data.isFollowing) {
                                        followerCount += followed ? 1 : -1;
                                    }
                                    await invalidateAll();
                                }
                            };
                        }}
						>
							<input type="hidden" name="target_id" value={profile.id}>
							<button
								type="submit"
								class="btn {isFollowing || followRequestStatus === 'pending' ? 'btn-outline' : 'btn-primary'}"
								disabled={followRequestStatus === 'pending'}
								style="font-size: 13px;"
							>
								{isFollowing ? 'フォロー中' : followRequestStatus === 'pending' ? '申請中' : profile.is_private ? 'フォロー申請' : 'フォローする'}
							</button>
						</form>
						<button
							type="button"
							class="btn btn-outline"
							style="font-size: 13px;"
							onclick={() => (showUserReportModal = true)}
						>
							通報
						</button>
					</div>
				{/if}
			</div>
		</div>

		{#if showUserReportModal}
			<div class="report-modal-overlay" role="presentation" onclick={() => (showUserReportModal = false)}>
				<div
					class="report-modal-card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="user-report-title"
					tabindex="-1"
					onclick={(event) => event.stopPropagation()}
					onkeydown={(event) => event.stopPropagation()}
				>
					<div class="report-modal-header">
						<span id="user-report-title" class="report-modal-title">@{profile.username} を通報</span>
						<button
							type="button"
							class="report-modal-close"
							aria-label="閉じる"
							onclick={() => (showUserReportModal = false)}
						>
							×
						</button>
					</div>
					<div class="report-modal-body">
						<label class="report-field">
							<span>理由</span>
							<select bind:value={reportReason}>
								<option value="spam">スパム</option>
								<option value="harassment">嫌がらせ</option>
								<option value="sexual">性的コンテンツ</option>
								<option value="violence">暴力的コンテンツ</option>
								<option value="illegal">違法・危険行為</option>
								<option value="other">その他</option>
							</select>
						</label>
						<label class="report-field">
							<span>詳細</span>
							<textarea rows="3" maxlength="500" bind:value={reportDetails}></textarea>
						</label>
						{#if reportMessage}
							<p class="report-message">{reportMessage}</p>
						{/if}
					</div>
					<div class="report-modal-footer">
						<button
							type="button"
							class="btn btn-danger"
							disabled={reportSubmitting}
							onclick={submitUserReport}
						>
							{reportSubmitting ? '送信中...' : '送信'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- タブ -->
		<div class="profile-tabs">
			<a href="/profile/{profile.username}" class="profile-tab" class:active={activeTab === 'posts'}>投稿</a>
			<a href="/profile/{profile.username}?tab=images" class="profile-tab" class:active={activeTab === 'images'}
				>画像</a
			>
			<a href="/profile/{profile.username}?tab=list" class="profile-tab" class:active={activeTab === 'list'}>
				マイリスト
				{#if !canViewContent || (!profile.list_is_public && !isOwn)}
					<span class="tab-lock">🔒</span>
				{/if}
			</a>
			{#if isOwn}
				<a href="/profile/{profile.username}?tab=likes" class="profile-tab" class:active={activeTab === 'likes'}
					>いいね</a
				>
			{/if}
			{#if isOwn}
				<a href="/profile/{profile.username}?tab=edit" class="profile-tab" class:active={activeTab === 'edit'}
					>編集</a
				>
			{/if}
		</div>

		<!-- 投稿タブ -->
		{#if activeTab === 'posts'}
			{#if !canViewContent}
				<div class="empty-state profile-private-state">
					<p>このアカウントの投稿はフォロワーだけが見ることができます</p>
				</div>
			{:else if posts.length === 0}
				<div class="empty-state">
					<p>まだ投稿がありません</p>
				</div>
			{:else}
				{#each posts as post (post.id)}
					<PostCard {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
		{/if}

		<!-- 画像タブ -->
		{#if activeTab === 'images'}
			{#if !canViewContent}
				<div class="empty-state profile-private-state">
					<p>このアカウントの画像投稿はフォロワーだけが見ることができます</p>
				</div>
			{:else if imagePosts.length === 0}
				<div class="empty-state">
					<p>画像付きの投稿がありません</p>
				</div>
			{:else}
				{#each imagePosts as post (post.id)}
					<PostCard {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
		{/if}

		<!-- マイリストタブ -->
		{#if activeTab === 'list'}
			{#if !canViewContent || (!profile.list_is_public && !isOwn)}
				<div class="empty-state list-private">
					<svg
						width="36"
						height="36"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						style="margin-bottom:12px; color: var(--fg-muted)"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<p>
						{!canViewContent ? 'このアカウントのマイリストはフォロワーだけが見ることができます' : 'このユーザーのマイリストは非公開です'}
					</p>
				</div>
			{:else if animeList.length === 0}
				<div class="empty-state">
					<p>まだアニメがありません</p>
				</div>
			{:else}
				<div class="list-summary">
					<span class="list-total">合計 <strong>{animeList.length}</strong> 作品</span>
					{#if isOwn}
						<a href="/mylist" class="list-manage-link">リストを管理</a>
					{/if}
				</div>

				{#each statusOrder as status}
					{#if grouped[status].length > 0}
						<section class="status-section status-section--{status}">
							<h3 class="status-heading">
								<span class="status-icon">{statusIcon[status]}</span>
								{statusLabel[status]}
								<span class="status-count">{grouped[status].length}</span>
							</h3>
							<div class="anime-list">
								{#each grouped[status] as anime (anime.id)}
									<a href="/anime/{anime.id}" class="anime-row">
										<div class="anime-cover">
											{#if anime.cover_url}
												<img src={anime.cover_url} alt={anime.title}>
											{:else}
												<div class="anime-cover-placeholder">?</div>
											{/if}
										</div>
										<div class="anime-info">
											<div class="anime-title">{anime.title}</div>
											<div class="anime-meta">
												{#if anime.episode_count}
													<span class="meta-progress"
														>{anime.user_entry?.progress ?? 0}
														/ {anime.episode_count} 話</span
													>
												{:else if (anime.user_entry?.progress ?? 0) > 0}
													<span class="meta-progress">{anime.user_entry?.progress} 話</span>
												{/if}
												{#if anime.user_entry?.score !== null && anime.user_entry?.score !== undefined}
													<span class="meta-score">★ {anime.user_entry.score}</span>
												{/if}
											</div>
										</div>
										{#if anime.user_entry?.updated_at}
											<div class="anime-updated">
												{new Date(anime.user_entry.updated_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
											</div>
										{/if}
									</a>
								{/each}
							</div>
						</section>
					{/if}
				{/each}
			{/if}
		{/if}

		<!-- いいねタブ -->
		{#if activeTab === 'likes'}
			{#if !isOwn}
				<div class="empty-state profile-private-state">
					<p>他のユーザーのいいねは表示できません</p>
				</div>
			{:else if data.likedPosts.length === 0}
				<div class="empty-state">
					<p>いいねした投稿がありません</p>
				</div>
			{:else}
				{#each data.likedPosts as post (post.id)}
					<PostCard {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
		{/if}

		<!-- 編集タブ -->
		{#if activeTab === 'edit' && isOwn}
			<section class="profile-edit-panel">
				{#if form?.success}
					<div class="flash-success">プロフィールを更新しました。</div>
				{/if}

				{#if form && 'message' in form && !('field' in form)}
					<div class="flash-error">{form.message}</div>
				{/if}

				<form method="POST" action="?/updateProfile" use:enhance={handleProfileSubmit}>
					<div class="field">
						<label for="display_name" class="field-label">表示名</label>
						<input
							id="display_name"
							name="display_name"
							type="text"
							class="field-input"
							class:field-error={form && 'field' in form && form.field === 'display_name'}
							placeholder="アニメ太郎"
							maxlength="50"
							bind:value={editDisplayName}
						>
						{#if form && 'field' in form && form.field === 'display_name'}
							<p class="field-error-msg">{form.message}</p>
						{:else}
							<p class="field-hint">タイムラインやプロフィールで表示される名前です。</p>
						{/if}
					</div>

					<div class="field">
						<label for="bio" class="field-label">自己紹介</label>
						<textarea
							id="bio"
							name="bio"
							class="field-textarea"
							class:field-error={form && 'field' in form && form.field === 'bio'}
							placeholder="好きな作品や今見ているアニメなど"
							rows="3"
							maxlength="160"
							bind:value={editBio}
						></textarea>
						<p class="field-hint" class:danger={bioRemaining < 0}>
							{#if form && 'field' in form && form.field === 'bio'}
								{form.message}
							{:else}
								残り {bioRemaining} 文字
							{/if}
						</p>
					</div>

					<div class="profile-edit-actions">
						<a href="/profile/{profile.username}" class="btn btn-ghost">キャンセル</a>
						<button type="submit" class="btn btn-primary" disabled={profileSubmitting}>
							{profileSubmitting ? '保存中...' : '保存する'}
						</button>
					</div>
				</form>
			</section>
		{:else if activeTab === 'edit'}
			<div class="empty-state">
				<p>プロフィール編集は本人だけが利用できます。</p>
			</div>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} />
	</aside>
</div>

<style>
.profile-stat--link {
	text-decoration: none;
	color: inherit;
	cursor: pointer;
}

.profile-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 12px;
}

.profile-lock-badge {
	display: inline-flex;
	align-items: center;
	margin-left: 6px;
	padding: 1px 6px;
	border: 1px solid var(--border, #334155);
	border-radius: 999px;
	color: var(--fg-muted, #94a3b8);
	font-size: 0.72rem;
	font-weight: 700;
	vertical-align: middle;
}

.profile-tabs {
	display: flex;
	border-bottom: 1px solid var(--border, #334155);
	margin: 16px 0 0;
}

.profile-tab {
	padding: 10px 20px;
	font-size: 0.9rem;
	font-weight: 500;
	color: var(--fg-muted, #94a3b8);
	text-decoration: none;
	border-bottom: 2px solid transparent;
	margin-bottom: -1px;
	transition:
		color 0.15s,
		border-color 0.15s;
	display: flex;
	align-items: center;
	gap: 6px;
}

.profile-tab:hover {
	color: var(--fg, #e2e8f0);
}

.profile-tab.active {
	color: var(--accent, #6366f1);
	border-bottom-color: var(--accent, #6366f1);
	font-weight: 700;
}

.profile-edit-panel {
	padding: 20px 4px;
}

.report-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(15 23 42 / 0.68);
}

.report-modal-card {
	width: min(100%, 420px);
	border: 1px solid var(--color-border, var(--border, #334155));
	border-radius: 8px;
	background: var(--color-surface, var(--surface, #1e293b));
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.36);
}

.report-modal-header,
.report-modal-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--color-border, var(--border, #334155));
}

.report-modal-footer {
	justify-content: flex-end;
	border-top: 1px solid var(--color-border, var(--border, #334155));
	border-bottom: 0;
}

.report-modal-title {
	font-size: 15px;
	font-weight: 800;
}

.report-modal-close {
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--color-text-muted, var(--fg-muted, #94a3b8));
	cursor: pointer;
	font-size: 20px;
	line-height: 1;
}

.report-modal-close:hover {
	background: var(--color-border, var(--border, #334155));
	color: var(--color-text, var(--fg, #e2e8f0));
}

.report-modal-body {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
}

.report-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: var(--color-text-secondary, var(--fg-muted, #94a3b8));
	font-size: 13px;
	font-weight: 700;
}

.report-field select,
.report-field textarea {
	width: 100%;
	border: 1px solid var(--color-border, var(--border, #334155));
	border-radius: 8px;
	background: var(--color-bg, var(--bg, #0f172a));
	color: var(--color-text, var(--fg, #e2e8f0));
	padding: 9px 10px;
	font: inherit;
	font-weight: 500;
}

.report-field textarea {
	resize: vertical;
}

.report-message {
	margin: 0;
	color: var(--color-text-muted, var(--fg-muted, #94a3b8));
	font-size: 13px;
}

.profile-edit-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 18px;
}

.tab-lock {
	font-size: 0.75rem;
}

.empty-state {
	text-align: center;
	padding: 48px 0;
	color: var(--fg-muted, #94a3b8);
}

.list-private {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.list-summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 4px;
	font-size: 0.85rem;
	color: var(--fg-muted, #94a3b8);
}

.list-summary strong {
	color: var(--fg, #e2e8f0);
}

.profile-stat--link:hover strong {
	color: var(--accent, #6366f1);
}

.list-manage-link {
	font-size: 0.8rem;
	color: var(--accent, #6366f1);
	text-decoration: none;
}

.list-manage-link:hover {
	text-decoration: underline;
}

.status-section {
	margin-bottom: 24px;
}

.status-heading {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.85rem;
	font-weight: 700;
	padding: 8px 4px;
	margin: 0 0 4px;
	border-bottom: 1px solid var(--border, #334155);
	color: var(--fg, #e2e8f0);
}

.status-section--watching .status-icon {
	color: var(--status-watching);
}
.status-section--completed .status-icon {
	color: var(--accent, #6366f1);
}
.status-section--plan_to_watch .status-icon {
	color: var(--status-plan);
}
.status-section--on_hold .status-icon {
	color: var(--status-on-hold);
}
.status-section--dropped .status-icon {
	color: var(--status-dropped);
}

.status-count {
	margin-left: auto;
	font-size: 0.75rem;
	color: var(--fg-muted, #94a3b8);
	font-weight: 400;
}

.anime-list {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.anime-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 8px;
	border-radius: 6px;
	text-decoration: none;
	color: inherit;
	transition: background 0.12s;
}

.anime-row:hover {
	background: color-mix(in srgb, var(--fg, #e2e8f0) 6%, transparent);
}

.anime-cover {
	width: 36px;
	aspect-ratio: 2 / 3;
	border-radius: 3px;
	overflow: hidden;
	flex-shrink: 0;
	background: var(--surface, #1e293b);
}

.anime-cover img {
	width: 100%;
	height: auto;
	image-rendering: auto;
}

.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--fg-muted, #94a3b8);
}

.anime-info {
	flex: 1;
	min-width: 0;
}

.anime-title {
	font-size: 0.85rem;
	font-weight: 500;
	color: var(--fg, #e2e8f0);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	margin-bottom: 3px;
}

.anime-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.75rem;
}

.meta-progress {
	color: var(--fg-muted, #94a3b8);
}

.meta-score {
	color: var(--status-score);
	font-weight: 600;
}

.anime-updated {
	font-size: 0.72rem;
	color: var(--fg-muted, #94a3b8);
	flex-shrink: 0;
	white-space: nowrap;
}
</style>
