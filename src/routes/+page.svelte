<script lang="ts">
import { pushState, replaceState } from "$app/navigation";
import { page as routePage } from "$app/state";
import { trapFocus } from "$lib/actions/trapFocus";
import ActivityFeed from "$lib/components/ActivityFeed.svelte";
import LiveRoomsPanel from "$lib/components/LiveRoomsPanel.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import PostComposer from "$lib/components/PostComposer.svelte";
import PostDetailPane from "$lib/components/PostDetailPane.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import SeoMeta from "$lib/components/SeoMeta.svelte";
import TimelineLiveRun from "$lib/components/TimelineLiveRun.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import WelcomeCard from "$lib/components/WelcomeCard.svelte";
import { createLatestResolved } from "$lib/latest-resolved.svelte";
import { composeOpen } from "$lib/stores/compose";
import type { Post } from "$lib/types";
import { groupLiveRuns } from "$lib/utils/live-runs";
import type { PageProps } from "./$types";

/** スケルトンの枚数（タイムラインの典型的な表示密度に合わせた仮枠） */
const SKELETON_COUNT = 12;
const NO_ACTIVITY = { items: [], nextCursor: null };

/** タブごとの先頭のページ */
const TAB_HREFS = { all: "/", following: "/?tab=following", activity: "/?tab=activity" } as const;

let { data }: PageProps = $props();
// 投稿欄で外した（または投稿した）コレクションのシェア。モーダルを開き直しても付け直さない
let clearedCollectionShareId = $state<string | null>(null);
// 読み込み直したら（新しいシェアのリンクで開いたときなど）、外した覚えを消す
$effect(() => {
	void data.pageExtras;
	clearedCollectionShareId = null;
});

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

// アクティビティ（181）。アクティビティのタブ以外では null
const activity = createLatestResolved(
	() => data.activity ?? NO_ACTIVITY,
	() => `${data.user?.id ?? ""}:${data.tab}:${data.before ?? ""}`,
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

/**
 * 投稿詳細はタイムラインの上に重ねて出す（URL だけ /posts/ID にする浅いルーティング）。
 * 本文はタイムラインで取得済みのものを使うので、ページの読み込みも本文の再取得もしない。
 * タイムラインは隠すだけで残すので、戻ると読み込み直しなしで元の位置に戻れる
 */
const detail = $derived(routePage.state.postDetail?.post ?? null);
let scrollBeforeDetail = 0;

function openPost(post: Post) {
	scrollBeforeDetail = window.scrollY;
	pushState(`/posts/${post.id}`, { postDetail: { post } });
}

function closeDetail() {
	history.back();
}

let detailWasOpen = false;
$effect(() => {
	const open = detail !== null;
	if (open === detailWasOpen) return;
	detailWasOpen = open;
	// 開いたら先頭から読ませ、閉じたら開く前の位置へ戻す（ブラウザの「戻る」で閉じたときも同じ）
	window.scrollTo(0, open ? 0 : scrollBeforeDetail);
});

// 詳細で投稿を削除したら、消えた投稿を見せ続けずにタイムラインへ戻る
$effect(() => {
	if (detail && (routePage.form as { deleted?: boolean } | null)?.deleted) closeDetail();
});

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
	const base = TAB_HREFS[data.tab];
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
		if (
			!active ||
			!(extras.initialAnime || extras.initialExchangeShare || extras.initialCollectionShare) ||
			!data.profile
		)
			return;
		if (window.matchMedia("(max-width: 960px)").matches) {
			composeOpen.set(true);
		}
		// 引用パラメータを URL から消す（再読み込みや「戻る→進む」で二重に付かないように）。
		// goto だと同じページの load が再実行されるので、URL だけを書き換える
		const url = new URL(window.location.href);
		url.searchParams.delete("quote_anime");
		url.searchParams.delete("share_exchange");
		url.searchParams.delete("share_collection");
		url.hash = "";
		replaceState(url.toString(), {});
	});
	return () => {
		active = false;
	};
});
</script>

<SeoMeta title={data.user ? "タイムライン - Anipolis" : "Anipolis — アニメファンのためのSNS"} />

<div class="page-container">
	<main class="feed-column" class:has-post-pane={detail !== null}>
		{#if detail}
			{#key detail.id}
				<PostDetailPane
					post={detail}
					currentUserId={data.user?.id ?? null}
					profile={data.profile}
					hasSession={Boolean(data.session)}
					onback={closeDetail}
				/>
			{/key}
		{/if}
		<!-- Desktop: composer / landing hero -->
		<div class="composer-desktop" id="compose">
			{#if data.profile}
				{#if pageExtras.value}
					{@const extras = pageExtras.value}
					<PostComposer
						username={data.profile.username}
						displayName={data.profile.display_name}
						avatarUrl={data.profile.avatar_url}
						initialAnime={extras.initialAnime}
						initialContent={extras.initialContent}
						initialExchangeId={extras.initialExchangeId}
						initialExchangeShare={extras.initialExchangeShare}
						initialCollectionShare={extras.initialCollectionShare?.id === clearedCollectionShareId
							? null
							: extras.initialCollectionShare}
						oncollectionsharecleared={(id) => (clearedCollectionShareId = id)}
						{clearedCollectionShareId}
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

		{#if data.user && pageExtras.value?.newcomer}
			<WelcomeCard userId={data.user.id} />
		{/if}

		{#if data.user}
			<div class="timeline-tabs">
				<a href="/" class="timeline-tab" class:active={data.tab === "all"}> 全体 </a>
				<a href="/?tab=following" class="timeline-tab" class:active={data.tab === "following"}> フォロー中 </a>
				<a href="/?tab=activity" class="timeline-tab" class:active={data.tab === "activity"}>
					アクティビティ
				</a>
			</div>
		{/if}

		{#if !data.user}
			<!-- 投稿の一覧は登録した人だけに見せる。未ログインでも作品とカレンダーは見られる -->
			<div class="home-guest">
				<p>投稿は登録すると読めるようになります。</p>
				<div class="home-guest-links">
					<a href="/anime" class="btn btn-ghost">アニメを探す</a>
					<a href="/schedule" class="btn btn-ghost">放送カレンダー</a>
				</div>
			</div>
		{:else if data.tab === "activity"}
			<!-- 自分とフォロー中の人のマイリストの動き（181・195） -->
			{#if activity.error}
				<div class="home-deferred-error" role="alert" data-deferred-error="true">
					アクティビティを読み込めませんでした。<a href={TAB_HREFS.activity}>再読み込み</a>
				</div>
			{:else if activity.value === null}
				<div class="posts-loading-spinner" role="status" aria-label="アクティビティを読み込み中">
					<div class="spinner" aria-hidden="true"></div>
					<span>読み込み中…</span>
				</div>
			{:else}
				{@const page = activity.value}
				{#if data.before}
					<a href={TAB_HREFS.activity} class="timeline-back-link">← 新しいアクティビティに戻る</a>
				{/if}
				{#if page.items.length === 0 && !page.nextCursor}
					<div class="empty-state">
						<p>
							マイリストの動きはまだありません。<br>
							あなたやフォローしている人が作品を視聴予定・視聴中・完了にすると、ここに流れます。
						</p>
					</div>
				{:else}
					<ActivityFeed items={page.items} canLike={Boolean(data.profile)} viewerId={data.user?.id} />
					{#if page.nextCursor}
						<a href={loadMoreHref(page.nextCursor.createdAt, page.nextCursor.id)} class="load-more-btn">
							さらに読み込む
						</a>
					{/if}
				{/if}
			{/if}
		{:else}
			<!--
			data.timeline は deferred Promise（{ posts, nextCursor }）。
			- 初回の待機中: スピナー + スケルトンカードを表示してレイアウトシフトを最小化
			- 解決後: 実際の投稿カードに差し替え。再取得中は前回の一覧を保持する
			- エラー時: 再読み込みを促すメッセージ
		-->
			{#if timeline.error}
				<div class="home-deferred-error" role="alert" data-deferred-error="true">
					投稿を読み込めませんでした。<a href={TAB_HREFS[data.tab]}>再読み込み</a>
				</div>
			{:else if timeline.value === null}
				<div class="posts-loading-spinner" role="status" aria-label="投稿を読み込み中">
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
					<a href={TAB_HREFS[data.tab]} class="timeline-back-link">← 新しい投稿に戻る</a>
				{/if}
				{#if posts.length === 0 && !nextCursor}
					<div class="empty-state">
						{#if data.tab === "following"}
							<p>
								フォロー中のユーザーの投稿がありません。<br>気になるユーザーをフォローしてみましょう！
							</p>
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
					<!-- 同じ人の同じルームへの実況が続いたら 1 つにたたむ（読み飛ばしやすく、開けば続けて読める） -->
					{#each groupLiveRuns(posts) as item (item.kind === "run" ? item.key : item.post.id)}
						{#if item.kind === "run"}
							<TimelineLiveRun
								posts={item.posts}
								room={item.room}
								currentUserId={data.user?.id ?? null}
							/>
						{:else}
							<PostRow post={item.post} currentUserId={data.user?.id ?? null} onOpen={openPost} />
						{/if}
					{/each}
					{#if nextCursor}
						<a href={loadMoreHref(nextCursor.createdAt, nextCursor.id)} class="load-more-btn">
							さらに読み込む
						</a>
					{/if}
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
	<button
		type="button"
		class="compose-modal-backdrop modal-click-target"
		tabindex="-1"
		aria-label="投稿画面を閉じる"
		onclick={closeModal}
	></button>
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
					displayName={data.profile.display_name}
					avatarUrl={data.profile.avatar_url}
					initialAnime={extras.initialAnime}
					initialContent={extras.initialContent}
					initialExchangeId={extras.initialExchangeId}
					initialExchangeShare={extras.initialExchangeShare}
					initialCollectionShare={extras.initialCollectionShare?.id === clearedCollectionShareId
						? null
						: extras.initialCollectionShare}
					oncollectionsharecleared={(id) => (clearedCollectionShareId = id)}
					{clearedCollectionShareId}
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

.home-guest {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 40px 12px;
	color: var(--color-text-muted);
	text-align: center;
}
.home-guest-links {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
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
	border-radius: 0 0 22px 22px;
	z-index: 201;
	max-height: 90dvh;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	/* 投稿欄の上で回したホイールを後ろのタイムラインへ伝えない（#599） */
	overscroll-behavior: contain;
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
