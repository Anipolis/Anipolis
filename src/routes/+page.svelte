<script lang="ts">
import { goto } from "$app/navigation";
import PostCard from "$lib/components/PostCard.svelte";
import PostComposer from "$lib/components/PostComposer.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { composeOpen } from "$lib/stores/compose";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let onboardingDismissed = $state(true);

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

$effect(() => {
	if ((data.initialAnime || data.initialExchangeShare) && data.profile) {
		if (window.matchMedia("(max-width: 960px)").matches) {
			composeOpen.set(true);
		}
		const url = new URL(window.location.href);
		url.searchParams.delete("quote_anime");
		url.searchParams.delete("share_exchange");
		url.hash = "";
		goto(url.toString(), { replaceState: true, noScroll: true });
	}
});
</script>

<svelte:head>
	<title>Anipolis — タイムライン</title>
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
				<PostComposer
					username={data.profile.username}
					avatarUrl={data.profile.avatar_url}
					initialAnime={data.initialAnime}
					initialContent={data.initialContent}
					initialExchangeId={data.initialExchangeId}
					initialExchangeShare={data.initialExchangeShare}
					watchingAnime={data.watchingAnime}
				/>
			{:else if data.session}
				<div class="auth-gate">
					<p>ようこそ！<a href="/settings">設定</a>を確認してから投稿できます。</p>
				</div>
			{:else}
				<div class="landing-hero">
					<div class="landing-logo">Anipolis</div>
					<p class="landing-tagline">アニメファンのためのSNS</p>
					<a href="/auth" class="landing-cta">ログイン / 新規登録</a>
					<ul class="landing-features">
						<li>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
							視聴中のアニメを記録・管理
						</li>
						<li>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
							アニメの感想を投稿・共有
						</li>
						<li>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
							放送に合わせてリアルタイム実況
						</li>
					</ul>
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

		{#if data.posts.length === 0}
			<div class="empty-state">
				{#if data.tab === 'following'}
					<p>フォロー中のユーザーの投稿がありません。<br>気になるユーザーをフォローしてみましょう！</p>
				{:else}
					<p>まだ投稿がありません。最初の投稿をしてみましょう！</p>
				{/if}
			</div>
		{:else}
			{#each data.posts as post (post.id)}
				<PostCard {post} currentUserId={data.user?.id ?? null} />
			{/each}
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<!-- Mobile compose modal -->
{#if $composeOpen && data.profile}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="compose-modal-backdrop" onclick={closeModal}></div>
	<div class="compose-modal">
		<div class="compose-modal-header">
			<span class="compose-modal-title">投稿する</span>
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
			<PostComposer
				username={data.profile.username}
				avatarUrl={data.profile.avatar_url}
				initialAnime={data.initialAnime}
				initialContent={data.initialContent}
				initialExchangeId={data.initialExchangeId}
				initialExchangeShare={data.initialExchangeShare}
				watchingAnime={data.watchingAnime}
				onsubmitsuccess={closeModal}
			/>
		</div>
	</div>
{/if}

<style>
/* Desktop: always show */
.composer-desktop {
	display: block;
}

/* Mobile: hide inline composer, show only via modal.
   Exception: landing hero inside .composer-desktop is always shown. */
@media (max-width: 960px) {
	.composer-desktop:not(:has(.landing-hero)) {
		display: none;
	}
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
}

/* Landing hero (unauthenticated) */
.landing-hero {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 16px;
	padding: 32px 24px;
	border-bottom: 1px solid var(--color-border);
}

.landing-logo {
	font-size: 28px;
	font-weight: 800;
	color: var(--color-accent);
	letter-spacing: -0.5px;
}

.landing-tagline {
	font-size: 16px;
	color: var(--color-text-muted);
	margin: 0;
}

.landing-cta {
	display: inline-flex;
	align-items: center;
	padding: 10px 24px;
	background: var(--color-accent);
	color: white;
	border-radius: 999px;
	font-size: 15px;
	font-weight: 600;
	text-decoration: none;
	transition: background 0.15s;
}

.landing-cta:hover {
	background: var(--color-accent-hover);
	text-decoration: none;
	color: white;
}

.landing-features {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.landing-features li {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	color: var(--color-text-secondary);
}

.landing-features svg {
	color: var(--color-accent);
	flex-shrink: 0;
}

/* Onboarding banner */
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

/* Landing hero: also show on mobile (override .composer-desktop hide) */
@media (max-width: 960px) {
	.landing-hero {
		display: flex;
		padding: 24px 16px;
	}
}
</style>
