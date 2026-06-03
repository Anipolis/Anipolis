<script lang="ts">
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();
</script>

<svelte:head> <title>フォロー申請 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<div>
					<h1 class="settings-title">フォロー申請</h1>
					<p class="settings-subtitle">{data.requests.length}件の未対応申請</p>
				</div>
			</div>

			{#if form && "message" in form}
				<div class="flash-error">{form.message}</div>
			{/if}

			{#if data.requests.length === 0}
				<div class="empty-state">
					<p>未対応のフォロー申請はありません</p>
				</div>
			{:else}
				<div class="request-list">
					{#each data.requests as request (request.requester_id)}
						<article class="request-card">
							<a href="/profile/{request.requester.username}" class="request-avatar">
								<UserAvatar
									src={request.requester.avatar_url}
									username={request.requester.username}
									size="md"
								/>
							</a>

							<div class="request-body">
								<a href="/profile/{request.requester.username}" class="request-name">
									{request.requester.display_name ?? request.requester.username}
								</a>
								<div class="request-meta">
									@{request.requester.username}
									・ {formatRelativeTime(request.created_at)}
								</div>
								{#if request.requester.bio}
									<p>{request.requester.bio}</p>
								{/if}
							</div>

							<div class="request-actions">
								<form method="POST" action="?/approve" use:enhance>
									<input type="hidden" name="requester_id" value={request.requester_id}>
									<button type="submit" class="btn btn-primary">承認</button>
								</form>
								<form method="POST" action="?/reject" use:enhance>
									<input type="hidden" name="requester_id" value={request.requester_id}>
									<button type="submit" class="btn btn-outline">拒否</button>
								</form>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
.settings-subtitle {
	margin: 4px 0 0;
	color: var(--fg-muted, #94a3b8);
	font-size: 0.84rem;
}

.request-list {
	display: flex;
	flex-direction: column;
	margin-top: 12px;
}

.request-card {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 14px 0;
	border-bottom: 1px solid var(--border, #334155);
}

.request-card:first-child {
	border-top: 1px solid var(--border, #334155);
}

.request-avatar {
	flex-shrink: 0;
}

.request-body {
	flex: 1;
	min-width: 0;
}

.request-name {
	display: inline-block;
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--fg, #e2e8f0);
	text-decoration: none;
}

.request-name:hover {
	text-decoration: underline;
}

.request-meta {
	font-size: 0.82rem;
	color: var(--fg-muted, #94a3b8);
	margin-bottom: 4px;
}

.request-body p {
	font-size: 0.85rem;
	color: var(--fg-muted, #94a3b8);
	margin: 0;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.request-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

@media (max-width: 640px) {
	.request-card {
		flex-wrap: wrap;
	}

	.request-actions {
		width: 100%;
		padding-left: 52px;
	}
}
</style>
