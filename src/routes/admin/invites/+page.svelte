<script lang="ts">
import { enhance } from "$app/forms";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

function inviteStatus(invite: (typeof data.invites)[number]): { label: string; active: boolean } {
	if (invite.revoked_at) return { label: "失効済み", active: false };
	if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
		return { label: "期限切れ", active: false };
	}
	if (invite.use_count >= invite.max_uses) return { label: "使用済み", active: false };
	return { label: "有効", active: true };
}
</script>

<svelte:head><title>招待管理 - Admin</title></svelte:head>

<main class="list-page">
	<header class="page-header">
		<a href="/admin" class="back-link">← ダッシュボード</a>
		<div class="page-title">
			<p class="kicker">Admin</p>
			<h1>招待管理 <span class="count-badge">{data.invites.length}</span></h1>
		</div>
	</header>

	{#if form && "inviteMessage" in form}
		<div class="flash-error" role="alert">{form.inviteMessage}</div>
	{/if}

	{#if data.invites.length === 0}
		<p class="empty">発行された招待コードはありません。</p>
	{:else}
		<div class="invite-table-wrap">
			<table class="invite-table">
				<thead>
					<tr>
						<th>コード</th>
						<th>発行者</th>
						<th>状態</th>
						<th>使用回数</th>
						<th>有効期限</th>
						<th>発行日</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.invites as invite (invite.id)}
						{@const inviteState = inviteStatus(invite)}
						<tr>
							<td><code>{invite.code}</code></td>
							<td>
								{#if invite.created_by_username}
									<a href="/{invite.created_by_username}">@{invite.created_by_username}</a>
								{:else}
									<span class="muted">不明</span>
								{/if}
							</td>
							<td>
								<span class="inviteState-pill" class:active={inviteState.active}
									>{inviteState.label}</span
								>
							</td>
							<td>{invite.use_count}/{invite.max_uses}</td>
							<td>{invite.expires_at ? formatRelativeTime(invite.expires_at) : '無期限'}</td>
							<td>{formatRelativeTime(invite.created_at)}</td>
							<td>
								{#if inviteState.active}
									<form method="POST" action="?/revoke" use:enhance>
										<input type="hidden" name="invite_id" value={invite.id}>
										<button type="submit" class="btn btn-ghost btn-small">失効</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

<style>
.list-page {
	width: min(1040px, calc(100% - 32px));
	margin: 0 auto;
	padding: calc(var(--nav-height) + 24px) 0 48px;
}

.page-header {
	margin-bottom: 20px;
}

.back-link {
	display: inline-block;
	margin-bottom: 10px;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}

.back-link:hover {
	color: var(--color-text);
}

.kicker {
	margin: 0 0 2px;
	color: var(--color-accent);
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.page-title h1 {
	margin: 0;
	font-size: 24px;
	line-height: 1.2;
	display: flex;
	align-items: center;
	gap: 10px;
}

.count-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 26px;
	height: 26px;
	padding: 0 8px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	color: var(--color-accent);
	font-size: 14px;
	font-weight: 800;
}

.empty {
	padding: 24px 0;
	color: var(--color-text-muted);
}

.invite-table-wrap {
	overflow-x: auto;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
}

.invite-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 13px;
}

.invite-table th,
.invite-table td {
	padding: 10px 14px;
	text-align: left;
	white-space: nowrap;
	border-bottom: 1px solid var(--color-border);
}

.invite-table tr:last-child td {
	border-bottom: none;
}

.invite-table a {
	color: var(--color-accent);
	text-decoration: none;
}

.muted {
	color: var(--color-text-muted);
}

.inviteState-pill {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 11px;
	font-weight: 800;
	background: var(--color-border);
	color: var(--color-text-muted);
}

.inviteState-pill.active {
	background: color-mix(in srgb, #34d399 16%, transparent);
	color: #34d399;
}

.btn-small {
	padding: 4px 10px;
	font-size: 12px;
}
</style>
