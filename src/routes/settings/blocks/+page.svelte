<script lang="ts">
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();
</script>

<svelte:head><title>ブロックしたユーザー - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">ブロックしたユーザー</h1>
			</div>

			{#if form && "message" in form}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<p class="settings-section-desc">
				ブロックすると、相手からあなたのプロフィールと投稿が見えなくなり、
				フォローや返信・引用・いいねもできなくなります。あなたの画面にも相手の投稿は表示されません。
				実況ルームでも相手の発言は表示されません。
			</p>

			<div class="block-list">
				{#if data.blocked.length === 0}
					<div class="empty-state compact">
						<p>ブロックしているユーザーはいません。</p>
					</div>
				{:else}
					{#each data.blocked as blockedUser (blockedUser.id)}
						<div class="block-list-item">
							<a class="block-user" href={`/profile/${blockedUser.username}`}>
								{#if blockedUser.avatar_url}
									<img src={blockedUser.avatar_url} alt="" class="block-avatar">
								{:else}
									<div class="block-avatar block-avatar--placeholder"></div>
								{/if}
								<span class="block-names">
									<span class="block-display-name"
										>{blockedUser.display_name ?? blockedUser.username}</span
									>
									<span class="block-username">@{blockedUser.username}</span>
								</span>
							</a>
							<form method="POST" action="?/unblock" use:enhance>
								<input type="hidden" name="target_id" value={blockedUser.id}>
								<button type="submit" class="btn btn-ghost danger">ブロック解除</button>
							</form>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</main>
</div>

<style>
.block-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.block-list-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
}

.block-user {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	text-decoration: none;
	color: inherit;
}

.block-avatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	flex-shrink: 0;
	object-fit: cover;
}

.block-avatar--placeholder {
	background: var(--color-border);
}

.block-names {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.block-display-name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.block-username {
	font-size: 0.875rem;
	opacity: 0.7;
}
</style>
