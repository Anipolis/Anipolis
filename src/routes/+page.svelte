<script lang="ts">
import { goto } from "$app/navigation";
import PostCard from "$lib/components/PostCard.svelte";
import PostComposer from "$lib/components/PostComposer.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { composeOpen } from "$lib/stores/compose";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

function closeModal() {
	composeOpen.set(false);
}

$effect(() => {
	if (data.initialAnime && data.profile) {
		if (window.matchMedia("(max-width: 768px)").matches) {
			composeOpen.set(true);
		}
		const url = new URL(window.location.href);
		url.searchParams.delete("quote_anime");
		url.hash = "";
		goto(url.toString(), { replaceState: true, noScroll: true });
	}
});
</script>

<svelte:head> <title>Anipolis — タイムライン</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<!-- Desktop: always visible -->
		<div class="composer-desktop" id="compose">
			{#if data.profile}
				<PostComposer
					username={data.profile.username}
					avatarUrl={data.profile.avatar_url}
					initialAnime={data.initialAnime}
					initialContent={data.initialContent}
					initialExchangeId={data.initialExchangeId}
					initialExchangeShare={data.initialExchangeShare}
				/>
			{:else if data.session}
				<div class="auth-gate">
					<p>ようこそ！<a href="/settings">設定</a>を確認してから投稿できます。</p>
				</div>
			{:else}
				<div class="auth-gate">
					<p>投稿するにはログインが必要です</p>
				</div>
			{/if}
		</div>

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
		<TrendingPanel trending={data.trending} />
	</aside>
</div>

<!-- Mobile compose modal -->
{#if $composeOpen && data.profile}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
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

/* Mobile: hide inline composer, show only via modal */
@media (max-width: 768px) {
	.composer-desktop {
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
	bottom: 0;
	left: 0;
	right: 0;
	background: var(--color-bg);
	border-top: 1px solid var(--color-border);
	border-radius: 16px 16px 0 0;
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
	padding: 14px 16px 10px;
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
	padding-bottom: env(safe-area-inset-bottom);
}
</style>
