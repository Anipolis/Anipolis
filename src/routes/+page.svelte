<script lang="ts">
import { replaceState } from "$app/navigation";
import { trapFocus } from "$lib/actions/trapFocus";
import LiveRoomsPanel from "$lib/components/LiveRoomsPanel.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import PostComposer from "$lib/components/PostComposer.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { createLatestResolved } from "$lib/latest-resolved.svelte";
import { composeOpen } from "$lib/stores/compose";
import { isPostContinuation } from "$lib/utils/post-presentation";
import type { PageProps } from "./$types";

/** スケルトンの枚数（タイムラインの典型的な表示密度に合わせた仮枠） */
const SKELETON_COUNT = 12;

let { data }: PageProps = $props();

// data.timeline は deferred Promise。load が再実行されて新しい Promise になっても、
// 解決するまでは前回の一覧を表示し続ける（スケルトンは初回だけ、#100）。
// タブや「さらに読み込む」のカーソルが変わったときは別の一覧なので保持しない
const timeline = createLatestResolved(
	() => data.timeline,
	// アカウント切替（invalidateAll でページは作り直されない）でも前のアカウントの一覧を見せない
	() => `${data.user?.id ?? ""}:${data.tab}:${data.before ?? ""}`,
);

// data.pageExtras（投稿フォームの初期値・サイド情報）も deferred Promise。
// {#await} で包むと load の再実行で Promise が差し替わるたびに待機表示へ戻り、投稿フォームが
// 作り直されて、アニメ詳細からの引用やトレード共有の初期値が消える（#294）。
// 最後に解決した値を保持し、フォームは初回の解決後ずっと同じインスタンスを使う
// ユーザーが変わったら（アカウント切替）保持値を捨てて待機表示に戻し、投稿フォームも作り直す。
// 前のアカウントの視聴中作品や打ちかけの本文を別アカウントに持ち越さないため
const pageExtras = createLatestResolved(
	() => data.pageExtras,
	() => data.user?.id ?? "",
);

let onboardingDismissed = $state(true);
let homeSidebarSlot = $state<HTMLElement | null>(null);
let homeSidebarReady = $state(false);

$effect(() => {
	onboardingDismissed = localStorage.getItem("anipolis_onboarding_dismissed") === "1";
});

function dismissOnboarding() {
	localStorage.setItem("anipolis_onboarding_dismissed", "1");
	onboardingDismissed = true;
}

function closeModal() {
	composeOpen.set(false);
}

/**
 * Escape でモーダルを閉じる（GitLab #12）。
 * 内側の作品選択ダイアログやメンション候補は自分で Escape を処理して伝播を止めるので、
 * ここまで届いた Escape は投稿モーダル自身を閉じてよい。
 */
function handleModalKeydown(e: KeyboardEvent) {
	if (e.key !== "Escape" || e.defaultPrevented) return;
	e.preventDefault();
	closeModal();
}

function loadMoreHref(lastCreatedAt: string, lastPostId: string): string {
	const base = data.tab === "following" ? "/?tab=following" : "/";
	const separator = base.includes("?") ? "&" : "?";
	return `${base}${separator}before=${encodeURIComponent(lastCreatedAt)}&before_id=${encodeURIComponent(lastPostId)}`;
}

$effect(() => {
	if (!homeSidebarSlot) return;

	function updateHomeSidebarMetrics() {
		if (!homeSidebarSlot) return;
		const rect = homeSidebarSlot.getBoundingClientRect();
		homeSidebarSlot.style.setProperty("--home-sidebar-left", `${rect.left}px`);
		homeSidebarSlot.style.setProperty("--home-sidebar-top", `${rect.top}px`);
		homeSidebarSlot.style.setProperty("--home-sidebar-width", `${rect.width}px`);
		homeSidebarReady = true;
	}

	updateHomeSidebarMetrics();
	const resizeObserver = new ResizeObserver(updateHomeSidebarMetrics);
	resizeObserver.observe(homeSidebarSlot);
	window.addEventListener("resize", updateHomeSidebarMetrics);

	return () => {
		resizeObserver.disconnect();
		window.removeEventListener("resize", updateHomeSidebarMetrics);
	};
});

$effect(() => {
	let active = true;
	void data.pageExtras.then((extras) => {
		if (!active || !(extras.initialAnime || extras.initialExchangeShare) || !data.profile) return;
		if (window.matchMedia("(max-width: 960px)").matches) {
			composeOpen.set(true);
		}
		// 引用パラメータを URL から消す（再読み込みや「戻る→進む」で二重に付かないように）。
		// goto だと同じページの load が再実行されるので、URL だけを書き換える
		const url = new URL(window.location.href);
		url.searchParams.delete("quote_anime");
		url.searchParams.delete("share_exchange");
		url.hash = "";
		replaceState(url.toString(), {});
	});
	return () => {
		active = false;
	};
});
</script>

<svelte:head>
	<title>Anipolis - タイムライン</title>
	<meta property="og:title" content="Anipolis">
	<meta
		property="og:description"
		content="アニメファンのためのSNS。視聴中のアニメを記録して、感想を投稿・共有しよう。"
	>
	<meta property="og:type" content="website">
</svelte:head>

<div class="page-container">
	<main class="feed-column">
		<!-- Desktop: composer / landing hero -->
		<div class="composer-desktop" id="compose">
			{#if data.profile}
				{#if pageExtras.value}
					{@const extras = pageExtras.value}
					<PostComposer
						username={data.profile.username}
						avatarUrl={data.profile.avatar_url}
						initialAnime={extras.initialAnime}
						initialContent={extras.initialContent}
						initialExchangeId={extras.initialExchangeId}
						initialExchangeShare={extras.initialExchangeShare}
						watchingAnime={extras.watchingAnime}
					/>
				{:else if pageExtras.error}
					<div class="home-deferred-error" role="alert" data-deferred-error="true">
						投稿フォームを読み込めませんでした。<a href="/">再読み込み</a>
					</div>
				{:else}
					<div class="composer-loading" role="status" aria-label="投稿フォームを読み込み中"></div>
				{/if}
			{:else if data.session}
				<div class="auth-gate">
					<p>ようこそ！<a href="/settings">設定</a>を確認してから投稿できます。</p>
				</div>
			{:else}
				<div class="home-welcome">
					<div>
						<strong>いま観ている、そのひとこと。</strong>
						<p>同じアニメを観ている人と、感想を気軽に。</p>
					</div>
					<a href="/auth" class="btn btn-primary">ログイン / 登録</a>
				</div>
			{/if}
		</div>

		<!-- Onboarding banner for new users who haven't set up their profile yet -->
		{#if data.profile && !data.profile.display_name && !data.profile.avatar_url && !onboardingDismissed}
			<div class="onboarding-banner">
				<div class="onboarding-banner-body">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
					<div>
						<strong>プロフィールを完成させましょう！</strong>
						<p>アバターと表示名を設定して、他のユーザーに覚えてもらいましょう。</p>
					</div>
				</div>
				<div class="onboarding-banner-actions">
					<a href="/settings" class="onboarding-btn-primary">設定へ</a>
					<button type="button" class="onboarding-btn-close" onclick={dismissOnboarding} aria-label="閉じる">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			</div>
		{/if}

		{#if data.user}
			<div class="timeline-tabs">
				<a href="/" class="timeline-tab" class:active={data.tab === 'all'}> 全体 </a>
				<a href="/?tab=following" class="timeline-tab" class:active={data.tab === 'following'}> フォロー中 </a>
			</div>
		{/if}

		<!--
			data.timeline は deferred Promise（{ posts, nextCursor }）。
			- 初回の待機中: スピナー + スケルトンカードを表示してレイアウトシフトを最小化
			- 解決後: 実際の投稿カードに差し替え。再取得中は前回の一覧を保持する
			- エラー時: 再読み込みを促すメッセージ
		-->
		{#if timeline.error}
			<div class="home-deferred-error" role="alert" data-deferred-error="true">
				投稿を読み込めませんでした。<a href={data.tab === "following" ? "/?tab=following" : "/"}>再読み込み</a>
			</div>
		{:else if timeline.value === null}
			<div class="posts-loading-spinner" aria-label="投稿を読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: SKELETON_COUNT } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:else}
			{@const posts = timeline.value.posts}
			{@const nextCursor = timeline.value.nextCursor}
			{#if data.before}
				<a href={data.tab === "following" ? "/?tab=following" : "/"} class="timeline-back-link"
					>← 新しい投稿に戻る</a
				>
			{/if}
			{#if posts.length === 0 && !nextCursor}
				<div class="empty-state">
					{#if data.tab === 'following'}
						<p>フォロー中のユーザーの投稿がありません。<br>気になるユーザーをフォローしてみましょう！</p>
					{:else}
						<p>まだ投稿がありません。最初の投稿をしてみましょう！</p>
					{/if}
				</div>
			{:else}
				{#if posts.length === 0}
					<!-- 取得した分がすべてミュートで除外された。空状態ではなく続きの導線を出す（#35） -->
					<div class="empty-state">
						<p>このページの投稿はミュート設定によりすべて非表示です。</p>
					</div>
				{/if}
				{#each posts as post, index (post.id)}
					<PostRow
						{post}
						currentUserId={data.user?.id ?? null}
						continuation={isPostContinuation(post, posts[index - 1])}
					/>
				{/each}
				{#if nextCursor}
					<a href={loadMoreHref(nextCursor.createdAt, nextCursor.id)} class="load-more-btn">
						さらに読み込む
					</a>
				{/if}
			{/if}
		{/if}
	</main>

	<aside class="sidebar-column home-sidebar-column" bind:this={homeSidebarSlot}>
		<div class="home-sidebar-fixed scrollbar-thin-muted" class:home-sidebar-fixed-ready={homeSidebarReady}>
			{#if pageExtras.value}
				{@const extras = pageExtras.value}
				{#if data.user}
					<LiveRoomsPanel rooms={extras.liveRooms} />
				{/if}
				<TrendingPanel trending={extras.trending} animeTrending={extras.animeTrending} />
			{:else if pageExtras.error}
				<div class="home-deferred-error" role="alert" data-deferred-error="true">
					サイド情報を読み込めませんでした。
				</div>
			{:else}
				<div class="home-sidebar-loading" role="status" aria-label="サイド情報を読み込み中">
					<div class="spinner" aria-hidden="true"></div>
				</div>
			{/if}
		</div>
	</aside>
</div>

<!-- Mobile compose modal -->
{#if $composeOpen && data.profile}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="compose-modal-backdrop" onclick={closeModal}></div>
	<!--
		ダイアログとして読み上げられるようにし、フォーカスを内部に閉じ込める（GitLab #12）。
		trapFocus は開いた時に内部へフォーカスを移し、閉じた時に起点（FAB）へ戻す。
	-->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="compose-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="compose-modal-title"
		tabindex="-1"
		use:trapFocus
		onkeydown={handleModalKeydown}
	>
		<div class="compose-modal-header">
			<h2 class="compose-modal-title" id="compose-modal-title">投稿する</h2>
			<button type="button" class="compose-modal-close" onclick={closeModal} aria-label="閉じる">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
		<div class="compose-modal-body">
			{#if pageExtras.value}
				{@const extras = pageExtras.value}
				<PostComposer
					username={data.profile.username}
					avatarUrl={data.profile.avatar_url}
					initialAnime={extras.initialAnime}
					initialContent={extras.initialContent}
					initialExchangeId={extras.initialExchangeId}
					initialExchangeShare={extras.initialExchangeShare}
					watchingAnime={extras.watchingAnime}
					onsubmitsuccess={closeModal}
					focusOnMount
					draftKey={data.profile.id}
				/>
			{:else if pageExtras.error}
				<div class="home-deferred-error" role="alert" data-deferred-error="true">
					投稿フォームを読み込めませんでした。<a href="/">再読み込み</a>
				</div>
			{:else}
				<div class="composer-loading" role="status" aria-label="投稿フォームを読み込み中"></div>
			{/if}
		</div>
	</div>
{/if}

<style>
.home-welcome {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 20px 12px;
	border-bottom: 1px solid var(--color-border);
}
.home-welcome strong {
	font-size: 17px;
}
.home-welcome p {
	font-size: 12px;
	color: var(--color-text-muted);
	margin-top: 4px;
}
.home-welcome .btn {
	font-size: 12px;
	white-space: nowrap;
}
@media (max-width: 640px) {
	.home-welcome {
		align-items: flex-start;
		flex-direction: column;
		gap: 8px;
	}
}

/* The inline composer is available on every viewport. */
.composer-desktop {
	display: block;
}

/* Compose modal */
.compose-modal-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.6);
	z-index: 200;
}

.compose-modal {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	background: var(--color-bg);
	border-bottom: 1px solid var(--color-border);
	border-radius: 0 0 16px 16px;
	z-index: 201;
	max-height: 90dvh;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.compose-modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: calc(14px + env(safe-area-inset-top)) 16px 10px;
	border-bottom: 1px solid var(--color-border);
	flex-shrink: 0;
}

.compose-modal-title {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
}

.compose-modal-close {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-muted);
	padding: 4px;
	display: flex;
	align-items: center;
	border-radius: var(--radius-sm);
}

.compose-modal-body {
	overflow-y: auto;
	padding: 12px 12px 0;
}

.composer-loading {
	min-height: 166px;
	margin-bottom: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	background:
		linear-gradient(100deg, var(--color-surface) 34%, var(--color-surface-hover) 48%, var(--color-surface) 62%) 0 0
		/ 220% 100%;
	animation: home-loading-shimmer 1.2s ease-in-out infinite;
}

.home-sidebar-loading {
	display: flex;
	justify-content: center;
	padding: 32px 0;
}

.home-deferred-error {
	padding: 16px;
	color: var(--color-text-muted);
	font-size: 0.9rem;
	text-align: center;
}

.home-deferred-error a {
	margin-left: 8px;
	color: var(--color-accent);
}

@keyframes home-loading-shimmer {
	to {
		background-position: -120% 0;
	}
}

.home-sidebar-column {
	position: static;
}

.home-sidebar-fixed {
	position: fixed;
	top: var(--home-sidebar-top, calc(var(--nav-height) + 24px));
	bottom: 0;
	left: var(--home-sidebar-left, 0);
	width: var(--home-sidebar-width, var(--sidebar-width));
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	visibility: hidden;
}

.home-sidebar-fixed-ready {
	visibility: visible;
}

/* Landing hero (unauthenticated) */
.onboarding-banner {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px;
	background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
	border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
	border-radius: var(--radius-sm);
	margin-bottom: 4px;
}

.onboarding-banner-body {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	color: var(--color-accent);
	flex: 1;
	min-width: 0;
}

.onboarding-banner-body div {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.onboarding-banner-body strong {
	font-size: 14px;
	color: var(--color-text);
}

.onboarding-banner-body p {
	font-size: 13px;
	color: var(--color-text-muted);
	margin: 0;
}

.onboarding-banner-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.onboarding-btn-primary {
	display: inline-flex;
	align-items: center;
	padding: 6px 14px;
	background: var(--color-accent);
	color: white;
	border-radius: var(--radius-sm);
	font-size: 13px;
	font-weight: 600;
	text-decoration: none;
	white-space: nowrap;
	transition: background 0.15s;
}

.onboarding-btn-primary:hover {
	background: var(--color-accent-hover);
	text-decoration: none;
	color: white;
}

.onboarding-btn-close {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 4px;
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-muted);
	border-radius: var(--radius-sm);
	transition: color 0.15s;
}

.onboarding-btn-close:hover {
	color: var(--color-text);
}

.timeline-back-link {
	display: block;
	padding: 10px 16px;
	text-align: center;
	font-size: 0.88rem;
	color: var(--color-accent);
	text-decoration: none;
	border-bottom: 1px solid var(--color-border);
}
.timeline-back-link:hover {
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}

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
</style>
