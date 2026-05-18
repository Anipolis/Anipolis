<script lang="ts">
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
const { profile, followers } = $derived(data);
const displayName = $derived(profile.display_name ?? profile.username);
</script>

<svelte:head> <title>{displayName} のフォロワー · Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<div class="page-header">
			<a href="/profile/{profile.username}" class="back-link">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
				{displayName}
			</a>
			<h1 class="page-title">フォロワー</h1>
			<p class="page-subtitle">{data.followCounts.followers}人</p>
		</div>

		{#if followers.length === 0}
			<div class="empty-state">
				<p>まだフォロワーがいません</p>
			</div>
		{:else}
			<div class="user-list">
				{#each followers as user (user.id)}
					<a href="/profile/{user.username}" class="user-card">
						<UserAvatar src={user.avatar_url} username={user.username} size="md" />
						<div class="user-info">
							<div class="user-display-name">{user.display_name ?? user.username}</div>
							<div class="user-username">@{user.username}</div>
							{#if user.bio}
								<p class="user-bio">{user.bio}</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
.page-header {
	padding: 16px 0 12px;
	border-bottom: 1px solid var(--border, #334155);
	margin-bottom: 4px;
}

.back-link {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: var(--fg-muted, #94a3b8);
	text-decoration: none;
	font-size: 0.85rem;
	margin-bottom: 8px;
}

.back-link:hover {
	color: var(--fg, #e2e8f0);
}

.page-title {
	font-size: 1.1rem;
	font-weight: 700;
	margin: 0 0 2px;
	color: var(--fg, #e2e8f0);
}

.page-subtitle {
	font-size: 0.8rem;
	color: var(--fg-muted, #94a3b8);
	margin: 0;
}

.empty-state {
	text-align: center;
	padding: 48px 0;
	color: var(--fg-muted, #94a3b8);
}

.user-list {
	display: flex;
	flex-direction: column;
}

.user-card {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 14px 4px;
	border-bottom: 1px solid var(--border, #334155);
	text-decoration: none;
	color: inherit;
	transition: background 0.12s;
}

.user-card:hover {
	background: color-mix(in srgb, var(--fg, #e2e8f0) 4%, transparent);
}

.user-info {
	flex: 1;
	min-width: 0;
}

.user-display-name {
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--fg, #e2e8f0);
}

.user-username {
	font-size: 0.82rem;
	color: var(--fg-muted, #94a3b8);
	margin-bottom: 4px;
}

.user-bio {
	font-size: 0.85rem;
	color: var(--fg-muted, #94a3b8);
	margin: 0;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
