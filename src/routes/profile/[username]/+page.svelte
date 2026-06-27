<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import AnimeStatusSection from "$lib/components/AnimeStatusSection.svelte";
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { Anime, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const { profile, posts, imagePosts, isOwn, canViewContent } = $derived(data);
const displayName = $derived(profile.display_name ?? profile.username);
const profileSocialImage = $derived(profile.header_url ?? profile.avatar_url);

let isFollowing = $state(false);
let followRequestStatus = $state<"none" | "pending">("none");
let followerCount = $state(0);
let isProcessing = $state(false);
let editDisplayName = $state(untrack(() => data.profile.display_name ?? ""));
let editBio = $state(untrack(() => data.profile.bio ?? ""));
let editProfileId = $state(untrack(() => data.profile.id));
let profileSubmitting = $state(false);
let headerUploading = $state(false);
let headerMessage = $state("");
let headerPreviewUrl = $state<string | null>(null);
let showProfileEditModal = $state(false);
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

const requestedTab = $derived(page.url.searchParams.get("tab"));
const activeTab = $derived(
	requestedTab === "images" || requestedTab === "list" || requestedTab === "likes" ? requestedTab : "posts",
);
const bioRemaining = $derived(160 - editBio.length);
const editableHeaderUrl = $derived(headerPreviewUrl ?? profile.header_url);

const handleProfileSubmit: SubmitFunction = () => {
	profileSubmitting = true;
	return async ({ result, update }) => {
		profileSubmitting = false;
		await update({ reset: false });
		if (result.type === "success") {
			editDisplayName = data.profile.display_name ?? "";
			editBio = data.profile.bio ?? "";
			showProfileEditModal = false;
		}
	};
};

$effect(() => {
	if (isOwn && (page.url.searchParams.get("edit") === "profile" || page.url.searchParams.get("tab") === "edit")) {
		showProfileEditModal = true;
	}
});

function openProfileEditModal() {
	editDisplayName = data.profile.display_name ?? "";
	editBio = data.profile.bio ?? "";
	showProfileEditModal = true;
}

function closeProfileEditModal() {
	if (profileSubmitting || headerUploading) return;
	showProfileEditModal = false;
	headerMessage = "";
	editDisplayName = data.profile.display_name ?? "";
	editBio = data.profile.bio ?? "";
}

async function updateHeaderImage(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	headerMessage = "";
	if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
		headerMessage = "JPEG、PNG、WebP形式の画像を選択してください。";
		input.value = "";
		return;
	}
	if (file.size > 5 * 1024 * 1024) {
		headerMessage = "画像は5MB以内にしてください。";
		input.value = "";
		return;
	}

	const previewUrl = URL.createObjectURL(file);
	headerPreviewUrl = previewUrl;
	headerUploading = true;
	try {
		const body = new FormData();
		body.append("file", file);
		const response = await fetch("/api/upload/profile-header", { method: "POST", body });
		const result = (await response.json().catch(() => ({}))) as { message?: string };
		if (!response.ok) throw new Error(result.message ?? "ヘッダー画像の更新に失敗しました");
		await invalidateAll();
		headerMessage = "ヘッダー画像を更新しました。";
	} catch (uploadError) {
		headerMessage = uploadError instanceof Error ? uploadError.message : "ヘッダー画像の更新に失敗しました";
	} finally {
		headerUploading = false;
		headerPreviewUrl = null;
		URL.revokeObjectURL(previewUrl);
		input.value = "";
	}
}

async function removeHeaderImage() {
	if (headerUploading || !profile.header_url) return;
	headerUploading = true;
	headerMessage = "";
	try {
		const response = await fetch("/api/upload/profile-header", { method: "DELETE" });
		const result = (await response.json().catch(() => ({}))) as { message?: string };
		if (!response.ok) throw new Error(result.message ?? "ヘッダー画像の削除に失敗しました");
		await invalidateAll();
		headerMessage = "ヘッダー画像を削除しました。";
	} catch (removeError) {
		headerMessage = removeError instanceof Error ? removeError.message : "ヘッダー画像の削除に失敗しました";
	} finally {
		headerUploading = false;
	}
}

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
		const body: Record<string, unknown> = await res.json().catch(() => ({}));
		if (!res.ok) {
			reportMessage =
				(typeof body["message"] === "string" ? body["message"] : null) ?? "通報の送信に失敗しました";
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

function handleReportModalKeydown(event: KeyboardEvent) {
	if (showUserReportModal && event.key === "Escape") {
		showUserReportModal = false;
	}
}

const statusOrder: AnimeStatus[] = ["watching", "completed", "plan_to_watch", "on_hold", "dropped"];

const statusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

const statusIcon: Record<AnimeStatus, string> = {
	watching: "i-lucide-circle-play",
	completed: "i-lucide-circle-check",
	plan_to_watch: "i-lucide-clipboard-list",
	on_hold: "i-lucide-circle-pause",
	dropped: "i-lucide-circle-x",
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

<svelte:head>
	<title>{displayName} (@{profile.username}) — Anipolis</title>
	<meta property="og:title" content="{displayName} (@{profile.username}) — Anipolis">
	<meta property="og:description" content={profile.bio ?? `@${profile.username}のAnipolisプロフィール`}>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if profileSocialImage}
		<meta property="og:image" content={profileSocialImage}>
	{/if}
</svelte:head>

<svelte:window onkeydown={handleReportModalKeydown} />

<div class="page-container">
	<main class="feed-column">
		<div class="profile-header">
			{#if profile.header_url}
				<img class="profile-header-image" src={profile.header_url} alt="{displayName}のヘッダー画像">
			{:else}
				<div class="profile-header-image profile-header-image--empty" aria-hidden="true"></div>
			{/if}
			<div class="profile-header-content">
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
						<button
							type="button"
							class="btn btn-outline"
							style="margin-top: 12px; font-size: 13px;"
							onclick={openProfileEditModal}
						>
							プロフィールを編集
						</button>
					{:else if data.user}
						<div class="profile-actions">
							<form
								method="POST"
								action="?/follow"
								use:enhance={() => {
                            if (isProcessing) return;
                            isProcessing = true;
                            return async ({ result }) => {
                                try {
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
                                } finally {
                                    isProcessing = false;
                                }
                            };
                        }}
							>
								<input type="hidden" name="target_id" value={profile.id}>
								<button
									type="submit"
									class="btn {isFollowing || followRequestStatus === 'pending' ? 'btn-outline' : 'btn-primary'}"
									disabled={isProcessing || followRequestStatus === 'pending'}
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

		{#if showProfileEditModal && isOwn}
			<div class="profile-edit-modal-overlay" role="presentation" onclick={closeProfileEditModal}>
				<div
					class="profile-edit-modal-card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="profile-edit-title"
					tabindex="-1"
					onclick={(event) => event.stopPropagation()}
					onkeydown={(event) => {
						event.stopPropagation();
						if (event.key === "Escape") closeProfileEditModal();
					}}
				>
					<div class="profile-edit-modal-header">
						<span id="profile-edit-title" class="profile-edit-modal-title">プロフィールを編集</span>
						<button
							type="button"
							class="profile-edit-modal-close"
							aria-label="閉じる"
							disabled={profileSubmitting}
							onclick={closeProfileEditModal}
						>
							×
						</button>
					</div>

					<form
						class="profile-edit-modal-form"
						method="POST"
						action="?/updateProfile"
						use:enhance={handleProfileSubmit}
					>
						<div class="profile-edit-modal-body">
							{#if form?.success}
								<div class="flash-success">プロフィールを更新しました。</div>
							{/if}

							{#if form && 'message' in form && !('field' in form)}
								<div class="flash-error">{form.message}</div>
							{/if}

							<div class="field">
								<span class="field-label">ヘッダー画像</span>
								<div class="profile-header-editor">
									{#if editableHeaderUrl}
										<img src={editableHeaderUrl} alt="ヘッダー画像のプレビュー">
									{:else}
										<div class="profile-header-editor-empty">ヘッダー画像は未設定です</div>
									{/if}
								</div>
								<div class="profile-header-editor-actions">
									<label class="btn btn-outline profile-header-file-button">
										{headerUploading ? '処理中...' : '画像を選択'}
										<input
											type="file"
											accept="image/jpeg,image/png,image/webp"
											disabled={headerUploading}
											onchange={updateHeaderImage}
										>
									</label>
									{#if profile.header_url}
										<button
											type="button"
											class="btn btn-ghost"
											disabled={headerUploading}
											onclick={removeHeaderImage}
										>
											削除
										</button>
									{/if}
								</div>
								<p class="field-hint">横長の画像を推奨します。JPEG、PNG、WebP・最大5MB。</p>
								{#if headerMessage}
									<p class="profile-header-editor-message" aria-live="polite">{headerMessage}</p>
								{/if}
							</div>

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
						</div>

						<div class="profile-edit-modal-footer">
							<button
								type="button"
								class="btn btn-ghost"
								disabled={profileSubmitting || headerUploading}
								onclick={closeProfileEditModal}
							>
								キャンセル
							</button>
							<button
								type="submit"
								class="btn btn-primary"
								disabled={profileSubmitting || headerUploading}
							>
								{profileSubmitting ? '保存中...' : '保存する'}
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}

		<!-- タブ -->
		<nav class="profile-tabs" aria-label="プロフィールタブ">
			<a href="/profile/{profile.username}" class="profile-tab" class:active={activeTab === 'posts'}>投稿</a>
			<a href="/profile/{profile.username}?tab=images" class="profile-tab" class:active={activeTab === 'images'}
				>画像</a
			>
			<a href="/profile/{profile.username}?tab=list" class="profile-tab" class:active={activeTab === 'list'}>
				マイリスト
				{#if !canViewContent || (!profile.list_is_public && !isOwn)}
					<span class="tab-lock i-lucide-lock-keyhole" aria-hidden="true"></span>
				{/if}
			</a>
			{#if isOwn}
				<a href="/profile/{profile.username}?tab=likes" class="profile-tab" class:active={activeTab === 'likes'}
					>いいね</a
				>
			{/if}
		</nav>

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
						<AnimeStatusSection
							{status}
							animes={grouped[status]}
							{statusLabel}
							{statusIcon}
							headingLevel={3}
						/>
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
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
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

.profile-actions .btn[disabled] {
	pointer-events: none;
	opacity: 0.6;
	cursor: not-allowed;
}

.profile-lock-badge {
	display: inline-flex;
	align-items: center;
	margin-left: 6px;
	padding: 1px 6px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	color: var(--color-text-muted);
	font-size: 0.72rem;
	font-weight: 700;
	vertical-align: middle;
}

.profile-tabs {
	display: flex;
	border-bottom: 1px solid var(--color-border);
	margin: 16px 0 0;
}

.profile-tab {
	padding: 10px 20px;
	font-size: 0.9rem;
	font-weight: 500;
	color: var(--color-text-muted);
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
	color: var(--color-text);
}

.profile-tab.active {
	color: var(--color-accent);
	border-bottom-color: var(--color-accent);
	font-weight: 700;
}

.report-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
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

.profile-edit-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(15 23 42 / 0.68);
}

.profile-edit-modal-card {
	display: flex;
	flex-direction: column;
	width: min(100%, 520px);
	max-height: calc(100dvh - 32px);
	overflow: hidden;
	border: 1px solid var(--color-border, var(--border, #334155));
	border-radius: 8px;
	background: var(--color-surface, var(--surface, #1e293b));
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.36);
}

.profile-edit-modal-header,
.profile-edit-modal-footer {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--color-border, var(--border, #334155));
}

.profile-edit-modal-footer {
	justify-content: flex-end;
	border-top: 1px solid var(--color-border, var(--border, #334155));
	border-bottom: 0;
}

.profile-edit-modal-title {
	font-size: 15px;
	font-weight: 800;
}

.profile-edit-modal-close {
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

.profile-edit-modal-close:hover:not(:disabled) {
	background: var(--color-border, var(--border, #334155));
	color: var(--color-text, var(--fg, #e2e8f0));
}

.profile-edit-modal-close:disabled {
	cursor: not-allowed;
	opacity: 0.55;
}

.profile-edit-modal-form {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
	overflow: hidden;
}

.profile-edit-modal-body {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 16px;
	min-height: 0;
	padding: 14px;
	overflow-y: auto;
}

.profile-header-editor {
	overflow: hidden;
	width: 100%;
	aspect-ratio: 3 / 1;
	border: 1px solid var(--color-border, var(--border, #334155));
	border-radius: 8px;
	background: var(--color-bg, var(--bg, #0f172a));
}

.profile-header-editor img {
	display: block;
	width: 100%;
	aspect-ratio: 3 / 1;
	object-fit: cover;
}

.profile-header-editor-empty {
	display: grid;
	place-items: center;
	height: 100%;
	color: var(--color-text-muted, var(--fg-muted, #94a3b8));
	font-size: 13px;
}

.profile-header-editor-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 10px;
}

.profile-header-file-button {
	position: relative;
	cursor: pointer;
	font-size: 13px;
}

.profile-header-file-button input {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	clip-path: inset(50%);
	white-space: nowrap;
}

.profile-header-editor-message {
	margin: 6px 0 0;
	color: var(--color-text-secondary, var(--fg-muted, #94a3b8));
	font-size: 13px;
}

.tab-lock {
	font-size: 0.75rem;
}

.empty-state {
	text-align: center;
	padding: 48px 0;
	color: var(--color-text-muted);
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
	color: var(--color-text-muted);
}

.list-summary strong {
	color: var(--color-text);
}

.profile-stat--link:hover strong {
	color: var(--color-accent);
}

.list-manage-link {
	font-size: 0.8rem;
	color: var(--color-accent);
	text-decoration: none;
}

.list-manage-link:hover {
	text-decoration: underline;
}
</style>
