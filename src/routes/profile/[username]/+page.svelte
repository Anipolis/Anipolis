<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import AnimeStatusSection from "$lib/components/AnimeStatusSection.svelte";
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
import FavoriteAnimeShelf from "$lib/components/FavoriteAnimeShelf.svelte";
import ImageCropper from "$lib/components/ImageCropper.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { checkCropSource } from "$lib/image-crop";
import { timelineCursorHref } from "$lib/timeline-cursor";
import type { Anime, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const { profile, isOwn, canViewContent } = $derived(data);
// 開いているタブ（投稿・画像・いいね）の一覧。サーバーは開いているタブの分だけを読む（#250）
const listPosts = $derived(data.listPosts);
const displayName = $derived(profile.display_name ?? profile.username);
const profileSocialImage = $derived(profile.header_url ?? profile.avatar_url);

// 最初からサーバーの値で始める（false で始めると、サーバーで出す HTML と開いた直後に「フォローする」が一瞬見える）。
// そのあとの変化は下の $effect で合わせる
let isFollowing = $state(untrack(() => data.isFollowing));
let followRequestStatus = $state<"none" | "pending">(untrack(() => data.followRequestStatus));
let followerCount = $state(untrack(() => data.followCounts.followers));
let isProcessing = $state(false);
let editDisplayName = $state(untrack(() => data.profile.display_name ?? ""));
let editBio = $state(untrack(() => data.profile.bio ?? ""));
let editProfileId = $state(untrack(() => data.profile.id));
let profileSubmitting = $state(false);
let headerUploading = $state(false);
let headerMessage = $state("");
let headerPreviewUrl = $state<string | null>(null);
let headerPendingFile = $state<File | null>(null);
let headerPendingDelete = $state(false);
let avatarUploading = $state(false);
let avatarMessage = $state("");
let avatarPreviewUrl = $state<string | null>(null);
let avatarPendingFile = $state<File | null>(null);
let avatarPendingDelete = $state(false);
let showProfileEditModal = $state(false);
let showUserReportModal = $state(false);
let reportReason = $state("harassment");
let reportDetails = $state("");
let reportSubmitting = $state(false);
let reportMessage = $state("");
let showKebabMenu = $state(false);
let blocking = $state(false);
let creatingCollection = $state(false);
// タブが入りきらない幅（320px など）では横に送る。続きがある側の端をぼかして知らせる
let tabsNav = $state<HTMLElement | null>(null);
let tabsMoreLeft = $state(false);
let tabsMoreRight = $state(false);

function updateTabsOverflow() {
	if (!tabsNav) return;
	tabsMoreLeft = tabsNav.scrollLeft > 1;
	tabsMoreRight = tabsNav.scrollLeft + tabsNav.clientWidth < tabsNav.scrollWidth - 1;
}

$effect(() => {
	if (!tabsNav) return;
	// 開いているタブが見える位置まで送る（右端の「いいね」などを開いたとき）
	void activeTab;
	// scrollIntoView はページごと縦にも動かすので、タブの並びだけを横に送る
	const active = tabsNav.querySelector<HTMLElement>(".profile-tab.active");
	if (active) {
		const overRight = active.offsetLeft + active.offsetWidth - (tabsNav.scrollLeft + tabsNav.clientWidth);
		if (overRight > 0) tabsNav.scrollLeft += overRight;
		else if (active.offsetLeft < tabsNav.scrollLeft) tabsNav.scrollLeft = active.offsetLeft;
	}
	updateTabsOverflow();
	const observer = new ResizeObserver(updateTabsOverflow);
	observer.observe(tabsNav);
	return () => observer.disconnect();
});

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
	requestedTab === "images" || requestedTab === "list" || requestedTab === "collections" || requestedTab === "likes"
		? requestedTab
		: "posts",
);
const bioRemaining = $derived(160 - editBio.length);
const editableHeaderUrl = $derived(headerPreviewUrl ?? (headerPendingDelete ? null : profile.header_url));
const editableAvatarUrl = $derived(avatarPreviewUrl ?? (avatarPendingDelete ? null : profile.avatar_url));

const submitBlock: SubmitFunction = ({ cancel }) => {
	if (!data.isBlocked && !window.confirm(`@${profile.username} をブロックします。フォロー関係も解除されます。`)) {
		cancel();
		return;
	}
	blocking = true;
	return async ({ update }) => {
		blocking = false;
		showKebabMenu = false;
		// ブロックすると相手の投稿を落とすため、表示中のタイムラインも取り直す
		await update({ reset: false });
		await invalidateAll();
	};
};

/** 画像を先に読み込んでおく（読み込めなくても、待ちすぎないよう 5 秒で先へ進む） */
function preloadImage(url: string | null | undefined): Promise<void> {
	if (!url) return Promise.resolve();
	const image = new Image();
	image.src = url;
	return Promise.race([image.decode().catch(() => {}), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
}

const handleProfileSubmit: SubmitFunction = () => {
	// 保存中に選択が変わっても送信開始時点の画像状態を使う
	const pendingHeaderFile = headerPendingFile;
	const shouldDeleteHeader = headerPendingDelete;
	const pendingAvatarFile = avatarPendingFile;
	const shouldDeleteAvatar = avatarPendingDelete;
	// 保存できた画像。手元のプレビュー（または「削除する」の表示）は、ページを読み直すまで残す。
	// 先に片付けると、読み直すまでのあいだ前の画像に一瞬戻ってしまう
	let headerSaved = false;
	let avatarSaved = false;
	const settleSavedImages = () => {
		if (headerSaved) {
			if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
			headerPreviewUrl = null;
			headerPendingDelete = false;
		}
		if (avatarSaved) {
			if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
			avatarPreviewUrl = null;
			avatarPendingDelete = false;
		}
	};
	profileSubmitting = true;
	return async ({ result, update }) => {
		// プロフィールテキストの保存が失敗した場合は画像処理をスキップ
		if (result.type !== "success") {
			profileSubmitting = false;
			await update({ reset: false });
			return;
		}

		if (pendingHeaderFile) {
			headerUploading = true;
			headerMessage = "";
			try {
				const body = new FormData();
				body.append("file", pendingHeaderFile);
				const response = await fetch("/api/upload/profile-header", { method: "POST", body });
				const res = (await response.json().catch(() => ({}))) as { message?: string };
				if (!response.ok) throw new Error(res.message ?? "ヘッダー画像の更新に失敗しました");
				headerPendingFile = null;
				headerSaved = true;
			} catch (uploadError) {
				headerMessage = uploadError instanceof Error ? uploadError.message : "ヘッダー画像の更新に失敗しました";
				headerUploading = false;
				profileSubmitting = false;
				await update({ reset: false });
				settleSavedImages();
				return;
			}
			headerUploading = false;
		} else if (shouldDeleteHeader) {
			headerUploading = true;
			headerMessage = "";
			try {
				const response = await fetch("/api/upload/profile-header", { method: "DELETE" });
				const res = (await response.json().catch(() => ({}))) as { message?: string };
				if (!response.ok) throw new Error(res.message ?? "ヘッダー画像の削除に失敗しました");
				headerSaved = true;
			} catch (deleteError) {
				headerMessage = deleteError instanceof Error ? deleteError.message : "ヘッダー画像の削除に失敗しました";
				headerUploading = false;
				profileSubmitting = false;
				await update({ reset: false });
				settleSavedImages();
				return;
			}
			headerUploading = false;
		}

		if (pendingAvatarFile) {
			avatarUploading = true;
			avatarMessage = "";
			try {
				const body = new FormData();
				body.append("file", pendingAvatarFile);
				const response = await fetch("/api/upload/avatar", { method: "POST", body });
				const res = (await response.json().catch(() => ({}))) as { message?: string };
				if (!response.ok) throw new Error(res.message ?? "アイコン画像の更新に失敗しました");
				avatarPendingFile = null;
				avatarSaved = true;
			} catch (uploadError) {
				avatarMessage = uploadError instanceof Error ? uploadError.message : "アイコン画像の更新に失敗しました";
				avatarUploading = false;
				profileSubmitting = false;
				await update({ reset: false });
				settleSavedImages();
				return;
			}
			avatarUploading = false;
		} else if (shouldDeleteAvatar) {
			avatarUploading = true;
			avatarMessage = "";
			try {
				const response = await fetch("/api/upload/avatar", { method: "DELETE" });
				const res = (await response.json().catch(() => ({}))) as { message?: string };
				if (!response.ok) throw new Error(res.message ?? "アイコン画像の削除に失敗しました");
				avatarSaved = true;
			} catch (deleteError) {
				avatarMessage = deleteError instanceof Error ? deleteError.message : "アイコン画像の削除に失敗しました";
				avatarUploading = false;
				profileSubmitting = false;
				await update({ reset: false });
				settleSavedImages();
				return;
			}
			avatarUploading = false;
		}

		await update({ reset: false });
		// 新しい画像を読み込み終えてから閉じる。閉じた直後にプロフィールで前の画像が一瞬見えないように
		await Promise.all([
			headerSaved ? preloadImage(data.profile.header_url) : null,
			avatarSaved ? preloadImage(data.profile.avatar_url) : null,
		]);
		settleSavedImages();
		profileSubmitting = false;
		editDisplayName = data.profile.display_name ?? "";
		editBio = data.profile.bio ?? "";
		showProfileEditModal = false;
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
	if (profileSubmitting || headerUploading || avatarUploading) return;
	showProfileEditModal = false;
	headerMessage = "";
	avatarMessage = "";
	if (headerPreviewUrl) {
		URL.revokeObjectURL(headerPreviewUrl);
		headerPreviewUrl = null;
	}
	headerPendingFile = null;
	headerPendingDelete = false;
	if (avatarPreviewUrl) {
		URL.revokeObjectURL(avatarPreviewUrl);
		avatarPreviewUrl = null;
	}
	avatarPendingFile = null;
	avatarPendingDelete = false;
	editDisplayName = data.profile.display_name ?? "";
	editBio = data.profile.bio ?? "";
}

// 選んだ画像は、まず切り抜きの画面（ImageCropper）に回し、決めた範囲の画像を保存のときに送る
let avatarCropSource = $state<File | null>(null);
let headerCropSource = $state<File | null>(null);

function updateHeaderImage(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	// 同じ画像を選び直しても選んだことになるように、欄はすぐ空に戻す
	input.value = "";
	if (!file) return;

	headerMessage = "";
	// 決まりは画面に書かず、外れたときだけ伝える（ux-guidelines）
	const problem = checkCropSource(file);
	if (problem) {
		headerMessage = problem;
		return;
	}
	headerCropSource = file;
}

function applyCroppedHeader(cropped: File) {
	headerCropSource = null;
	if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
	headerPreviewUrl = URL.createObjectURL(cropped);
	headerPendingFile = cropped;
	headerPendingDelete = false;
}

function updateAvatarImage(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	// 同じ画像を選び直しても選んだことになるように、欄はすぐ空に戻す
	input.value = "";
	if (!file) return;

	avatarMessage = "";
	const problem = checkCropSource(file);
	if (problem) {
		avatarMessage = problem;
		return;
	}
	avatarCropSource = file;
}

function applyCroppedAvatar(cropped: File) {
	avatarCropSource = null;
	if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
	avatarPreviewUrl = URL.createObjectURL(cropped);
	avatarPendingFile = cropped;
	avatarPendingDelete = false;
}

/** アイコン画像を外す（頭文字のアイコンに戻す）。保存したときに消す */
function removeAvatarImage() {
	if (avatarPreviewUrl) {
		URL.revokeObjectURL(avatarPreviewUrl);
		avatarPreviewUrl = null;
	}
	avatarPendingFile = null;
	avatarPendingDelete = true;
	avatarMessage = "";
}

function removeHeaderImage() {
	if (headerPreviewUrl) {
		URL.revokeObjectURL(headerPreviewUrl);
		headerPreviewUrl = null;
	}
	headerPendingFile = null;
	headerPendingDelete = true;
	headerMessage = "";
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
	if (showKebabMenu && event.key === "Escape") {
		showKebabMenu = false;
		return;
	}
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
	<title>{displayName} (@{profile.username}) - Anipolis</title>
	<meta property="og:title" content="{displayName} (@{profile.username}) - Anipolis">
	<meta property="og:description" content={profile.bio ?? `@${profile.username}のAnipolisプロフィール`}>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if profileSocialImage}
		<meta property="og:image" content={profileSocialImage}>
	{/if}
</svelte:head>

<svelte:window onkeydown={handleReportModalKeydown} onclick={() => { if (showKebabMenu) showKebabMenu = false; }} />

<div class="page-container">
	<main class="feed-column">
		<div class="profile-header">
			{#if profile.header_url}
				<img class="profile-header-image" src={profile.header_url} alt="{displayName}のヘッダー画像">
			{:else}
				<div class="profile-header-image profile-header-image--empty" aria-hidden="true"></div>
			{/if}
			<div class="profile-header-content">
				<div class="profile-header-top">
					<UserAvatar src={profile.avatar_url} username={profile.username} size="lg" />
					<div class="profile-header-actions">
						{#if isOwn}
							<button
								type="button"
								class="btn btn-secondary"
								style="font-size: 13px;"
								onclick={openProfileEditModal}
							>
								プロフィールを編集
							</button>
						{:else if data.user}
							{#if data.isBlocked}
								<!-- ブロック中はフォローできない（RLS で拒否される）ので、操作の代わりに状態を示す -->
								<span class="btn btn-secondary profile-blocked-label">ブロック中</span>
							{:else}
								<form
									method="POST"
									action="?/follow"
									use:enhance={({ cancel }) => {
                            if (isProcessing) {
                                cancel();
                                return;
                            }
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
										class="btn {isFollowing || followRequestStatus === 'pending' ? 'btn-secondary' : 'btn-primary'}"
										disabled={isProcessing || followRequestStatus === 'pending'}
										style="font-size: 13px;"
									>
										{isFollowing ? 'フォロー中' : followRequestStatus === 'pending' ? '申請中' : profile.is_private ? 'フォロー申請' : 'フォローする'}
									</button>
								</form>
							{/if}
							<div class="profile-kebab-menu">
								<button
									type="button"
									class="profile-kebab-btn"
									aria-label="その他のオプション"
									aria-haspopup="true"
									aria-expanded={showKebabMenu}
									onclick={(e) => { e.stopPropagation(); showKebabMenu = !showKebabMenu; }}
								>
									<span class="i-lucide-ellipsis-vertical" aria-hidden="true"></span>
								</button>
								{#if showKebabMenu}
									<div
										class="profile-kebab-dropdown"
										role="menu"
										tabindex="-1"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => {
											if (e.key === "Escape") {
												showKebabMenu = false;
												return;
											}
											e.stopPropagation();
										}}
									>
										<form
											method="POST"
											action={data.isBlocked ? "?/unblock" : "?/block"}
											use:enhance={submitBlock}
										>
											<input type="hidden" name="target_id" value={profile.id}>
											<button
												type="submit"
												role="menuitem"
												class="danger-menuitem"
												disabled={blocking}
											>
												{data.isBlocked ? "ブロック解除" : "ブロック"}
											</button>
										</form>
										<button
											type="button"
											role="menuitem"
											onclick={() => { showKebabMenu = false; showUserReportModal = true; }}
										>
											通報
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
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
							<strong>{data.postCount}</strong>
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
					{#if canViewContent && !data.isBlocked}
						<FavoriteAnimeShelf favorites={data.favoriteAnime} {isOwn} />
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
						<div class="profile-edit-modal-body scrollbar-thin-muted">
							{#if form?.success}
								<div class="flash-success">プロフィールを更新しました。</div>
							{/if}

							{#if form && 'message' in form && !('field' in form)}
								<div class="flash-error">{form.message}</div>
							{/if}

							<div class="field">
								<span class="field-label">アイコン画像</span>
								<!-- 左にアイコン、右にボタン（初期設定と同じ並び）。アイコンを押しても選べる。Tab の移動先と読み上げはボタンだけ -->
								<div class="profile-avatar-editor">
									<label for="profile-avatar-input" class="avatar-pick" aria-hidden="true">
										<UserAvatar
											src={editableAvatarUrl}
											username={profile.display_name || profile.username}
											size="lg"
										/>
									</label>
									<div class="profile-image-actions">
										<label class="btn btn-secondary profile-image-button">
											{avatarUploading ? '処理中...' : editableAvatarUrl ? '画像を変更' : '画像を選択'}
											<input
												id="profile-avatar-input"
												type="file"
												accept="image/jpeg,image/png,image/webp"
												disabled={profileSubmitting || avatarUploading}
												onchange={updateAvatarImage}
											>
										</label>
										{#if editableAvatarUrl}
											<button
												type="button"
												class="btn btn-ghost"
												disabled={profileSubmitting || avatarUploading}
												onclick={removeAvatarImage}
											>
												削除
											</button>
										{/if}
									</div>
								</div>
								{#if avatarMessage}
									<p class="field-error-msg" role="alert">{avatarMessage}</p>
								{/if}
							</div>

							<div class="field">
								<span class="field-label">ヘッダー画像</span>
								<!-- プレビューを押しても選べる（読み上げはボタンだけ） -->
								<label for="profile-header-input" class="profile-header-editor" aria-hidden="true">
									{#if editableHeaderUrl}
										<img src={editableHeaderUrl} alt="">
									{:else}
										<span class="profile-header-editor-empty">ヘッダー画像は未設定です</span>
									{/if}
								</label>
								<div class="profile-image-actions profile-header-actions-row">
									<label class="btn btn-secondary profile-image-button">
										{headerUploading ? '処理中...' : editableHeaderUrl ? '画像を変更' : '画像を選択'}
										<input
											id="profile-header-input"
											type="file"
											accept="image/jpeg,image/png,image/webp"
											disabled={profileSubmitting || headerUploading}
											onchange={updateHeaderImage}
										>
									</label>
									{#if editableHeaderUrl}
										<button
											type="button"
											class="btn btn-ghost"
											disabled={profileSubmitting || headerUploading}
											onclick={removeHeaderImage}
										>
											削除
										</button>
									{/if}
								</div>
								{#if headerMessage}
									<p class="field-error-msg" role="alert">{headerMessage}</p>
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
									maxlength="50"
									bind:value={editDisplayName}
								>
								{#if form && 'field' in form && form.field === 'display_name'}
									<p class="field-error-msg">{form.message}</p>
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
		<nav
			class="profile-tabs"
			class:profile-tabs--more-left={tabsMoreLeft}
			class:profile-tabs--more-right={tabsMoreRight}
			aria-label="プロフィールタブ"
			bind:this={tabsNav}
			onscroll={updateTabsOverflow}
		>
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
			<a
				href="/profile/{profile.username}?tab=collections"
				class="profile-tab"
				class:active={activeTab === 'collections'}
			>
				コレクション
			</a>
			{#if isOwn}
				<a href="/profile/{profile.username}?tab=likes" class="profile-tab" class:active={activeTab === 'likes'}
					>いいね</a
				>
			{/if}
		</nav>

		<!-- 投稿タブ -->
		{#if activeTab === 'posts'}
			{#if data.isBlocked}
				<div class="empty-state">
					<p>@{profile.username} さんをブロックしています</p>
				</div>
			{:else if !canViewContent}
				<div class="empty-state profile-private-state">
					<p>このアカウントの投稿はフォロワーだけが見ることができます</p>
				</div>
			{:else if listPosts.length === 0 && !data.listNextCursor}
				<div class="empty-state">
					<p>まだ投稿がありません</p>
				</div>
			{:else}
				{#each listPosts as post (post.id)}
					<PostRow {post} currentUserId={data.user?.id ?? null} />
				{/each}
				{#if data.listNextCursor}
					<a href={timelineCursorHref(page.url, data.listNextCursor)} class="load-more-btn">さらに読み込む</a>
				{/if}
			{/if}
		{/if}

		<!-- 画像タブ -->
		{#if activeTab === 'images'}
			{#if !canViewContent}
				<div class="empty-state profile-private-state">
					<p>このアカウントの画像投稿はフォロワーだけが見ることができます</p>
				</div>
			{:else if listPosts.length === 0 && !data.listNextCursor}
				<div class="empty-state">
					<p>画像付きの投稿がありません</p>
				</div>
			{:else}
				{#each listPosts as post (post.id)}
					<PostRow {post} currentUserId={data.user?.id ?? null} />
				{/each}
				{#if data.listNextCursor}
					<a href={timelineCursorHref(page.url, data.listNextCursor)} class="load-more-btn">さらに読み込む</a>
				{/if}
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

		<!-- コレクションタブ（#515） -->
		{#if activeTab === 'collections'}
			{#if !canViewContent}
				<div class="empty-state profile-private-state">
					<p>このアカウントのコレクションはフォロワーだけが見ることができます</p>
				</div>
			{:else if data.collections === null}
				<div class="empty-state">
					<p>コレクションを読み込めませんでした。ページを再読み込みしてください</p>
				</div>
			{:else}
				{#if isOwn && data.collections.length > 0}
					<div class="collections-toolbar">
						<button
							type="button"
							class="btn btn-secondary collections-new"
							onclick={() => (creatingCollection = true)}
						>
							<span class="i-lucide-plus" aria-hidden="true"></span>
							新しいコレクション
						</button>
					</div>
				{/if}
				{#if data.collections.length === 0}
					{#if isOwn}
						<button type="button" class="collections-empty-add" onclick={() => (creatingCollection = true)}>
							<span class="i-lucide-plus" aria-hidden="true"></span>
							コレクションを作る
						</button>
					{:else}
						<div class="empty-state"><p>まだコレクションがありません</p></div>
					{/if}
				{:else}
					<ul class="collections-list">
						{#each data.collections as collection (collection.id)}
							<li>
								<a href="/collections/{collection.id}" class="collection-item">
									<!-- 先頭の4作品のカバー（足りない分は空の枠） -->
									<span class="collection-item-covers" aria-hidden="true">
										{#each [0, 1, 2, 3] as slot (slot)}
											<span class="collection-item-cover">
												{#if collection.covers[slot]}
													<img src={collection.covers[slot]} alt="" loading="lazy">
												{/if}
											</span>
										{/each}
									</span>
									<span class="collection-item-body">
										<span class="collection-item-title">
											{collection.title}
											{#if !collection.is_public}
												<span class="collection-item-private">
													<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>
													非公開
												</span>
											{/if}
										</span>
										{#if collection.description}
											<span class="collection-item-description">{collection.description}</span>
										{/if}
										<span class="collection-item-meta">{collection.item_count}作品</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		{/if}

		<!-- いいねタブ -->
		{#if activeTab === 'likes'}
			{#if !isOwn}
				<div class="empty-state profile-private-state">
					<p>他のユーザーのいいねは表示できません</p>
				</div>
			{:else if listPosts.length === 0 && !data.listNextCursor}
				<div class="empty-state">
					<p>いいねした投稿がありません</p>
				</div>
			{:else}
				{#each listPosts as post (post.id)}
					<PostRow {post} currentUserId={data.user?.id ?? null} />
				{/each}
				{#if data.listNextCursor}
					<a href={timelineCursorHref(page.url, data.listNextCursor)} class="load-more-btn">さらに読み込む</a>
				{/if}
			{/if}
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

{#if creatingCollection && isOwn}
	<CollectionFormModal
		mode="create"
		action="?/createCollection"
		onclose={() => {
			creatingCollection = false;
		}}
	/>
{/if}

{#if avatarCropSource}
	<ImageCropper
		file={avatarCropSource}
		onconfirm={applyCroppedAvatar}
		oncancel={() => {
			avatarCropSource = null;
		}}
	/>
{/if}

{#if headerCropSource}
	<ImageCropper
		file={headerCropSource}
		kind="header"
		onconfirm={applyCroppedHeader}
		oncancel={() => {
			headerCropSource = null;
		}}
	/>
{/if}

<style>
.load-more-btn {
	display: block;
	padding: 14px 16px;
	text-align: center;
	font-size: 0.9rem;
	font-weight: 500;
	color: var(--color-accent);
	text-decoration: none;
	border-top: 1px solid var(--color-border);
	transition: background 0.12s;
}
.load-more-btn:hover {
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}
.profile-stat--link {
	text-decoration: none;
	color: inherit;
	cursor: pointer;
}

.profile-kebab-menu {
	position: relative;
}

.profile-kebab-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	corner-shape: round;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 20px;
	line-height: 1;
}

.profile-kebab-btn:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.profile-kebab-dropdown {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	z-index: 100;
	min-width: 140px;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
	overflow: hidden;
}

.profile-kebab-dropdown .danger-menuitem {
	color: var(--color-danger);
}

.profile-kebab-dropdown button {
	display: block;
	width: 100%;
	padding: 10px 14px;
	border: 0;
	background: transparent;
	color: var(--color-text);
	font-size: 14px;
	text-align: left;
	cursor: pointer;
}

.profile-kebab-dropdown button:hover {
	background: var(--color-surface-hover);
}

.profile-lock-badge {
	display: inline-flex;
	align-items: center;
	margin-left: 6px;
	padding: 1px 6px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	corner-shape: round;
	color: var(--color-text-muted);
	font-size: 0.72rem;
	font-weight: 700;
	vertical-align: middle;
}

.profile-tabs {
	position: relative;
	display: flex;
	border-bottom: 1px solid var(--color-border);
	margin: 16px 0 0;
	/* 入りきらない幅では横スクロールで見せる（タブの文字は折り返さない、#429） */
	overflow-x: auto;
	scrollbar-width: none;
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
	flex-shrink: 0;
	white-space: nowrap;
}

/* スマホでは詰めて、5つのタブが 360px 幅に収まるようにする（余った幅は均等に分ける） */
@media (max-width: 480px) {
	.profile-tab {
		flex: 1 0 auto;
		justify-content: center;
		padding: 10px 4px;
		font-size: 0.85rem;
	}
}

.profile-tabs--more-right {
	mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
}
.profile-tabs--more-left {
	mask-image: linear-gradient(to left, #000 calc(100% - 32px), transparent);
}
.profile-tabs--more-left.profile-tabs--more-right {
	mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
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
	border-radius: 12px;
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
	corner-shape: round;
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
	border-radius: 12px;
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
	border-radius: 12px;
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
	corner-shape: round;
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

/* 欄どうしの間は .profile-edit-modal-body の gap だけにする（.field の下の余白と重なって広がっていた） */
.profile-edit-modal-body :global(.field) {
	margin-bottom: 0;
}

.profile-avatar-editor {
	display: flex;
	align-items: center;
	gap: 14px;
}

.profile-header-editor {
	display: block;
	cursor: pointer;
	transition: opacity 0.15s;
	overflow: hidden;
	width: 100%;
	aspect-ratio: 3 / 1;
	border: 1px solid var(--color-border, var(--border, #334155));
	border-radius: 12px;
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

.profile-header-editor:hover {
	opacity: 0.8;
}

.profile-image-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.profile-header-actions-row {
	margin-top: 8px;
}

/* コレクションタブ（#515） */
.collections-toolbar {
	display: flex;
	justify-content: flex-end;
	padding: 12px 16px 0;
}
.collections-new {
	font-size: 13px;
}
.collections-empty-add {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: calc(100% - 32px);
	margin: 16px;
	padding: 20px;
	border: 1px dashed var(--color-border-hover);
	border-radius: 12px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: 14px;
}
.collections-empty-add:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.collections-list {
	display: flex;
	flex-direction: column;
	margin: 0;
	padding: 8px 0;
	list-style: none;
}
.collection-item {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px 16px;
	color: var(--color-text);
	text-decoration: none;
}
.collection-item:hover {
	background: var(--color-surface-hover);
}
.collection-item-covers {
	display: grid;
	flex-shrink: 0;
	grid-template-columns: repeat(2, 1fr);
	gap: 2px;
	width: 72px;
	overflow: hidden;
	border-radius: 8px;
	background: var(--color-border);
}
.collection-item-cover {
	display: block;
	aspect-ratio: 400 / 566;
	background: var(--color-bg-card);
}
.collection-item-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.collection-item-body {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}
.collection-item-title {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 15px;
	font-weight: 700;
	overflow-wrap: anywhere;
}
.collection-item-private {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 600;
}
.collection-item-description {
	display: -webkit-box;
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 13px;
	line-height: 1.5;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.collection-item-meta {
	color: var(--color-text-muted);
	font-size: 12px;
}

/* 「ブロック中」は押せない状態の表示なので、灰色の枠にして押せる見た目（カーソル・ホバー）を消す */
.profile-blocked-label {
	cursor: default;
	font-size: 13px;
}

.profile-blocked-label:hover:not(:disabled) {
	background: transparent;
}

/* 画像のボタンは補助の操作なので灰色の枠（.btn-secondary）にし、青は「保存する」だけに残す */
.profile-image-button {
	position: relative;
	cursor: pointer;
	font-size: 13px;
}

.profile-image-button input {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	clip-path: inset(50%);
	white-space: nowrap;
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
