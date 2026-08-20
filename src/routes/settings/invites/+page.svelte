<script lang="ts">
import { enhance } from "$app/forms";
import { page } from "$app/state";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let creating = $state(false);

function inviteUrl(code: string): string {
	return `${page.url.origin}/auth?invite=${code}`;
}

function inviteStatus(invite: (typeof data.invites)[number]): { label: string; active: boolean } {
	if (invite.revoked_at) return { label: "失効済み", active: false };
	if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
		return { label: "期限切れ", active: false };
	}
	if (invite.use_count >= invite.max_uses) return { label: "使用済み", active: false };
	return { label: "有効", active: true };
}

async function copyLink(code: string) {
	try {
		await navigator.clipboard.writeText(inviteUrl(code));
	} catch {
		// クリップボード API 非対応環境では何もしない（コードは画面に表示済み）
	}
}
</script>

<svelte:head><title>招待 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">招待</h1>
			</div>

			<p class="auth-info-text">
				招待コード（リンク）を発行して、クローズドβに他のユーザーを招待できます。1つのコードは指定した回数まで使えます。
			</p>

			{#if form && "inviteMessage" in form && !("inviteSuccess" in form)}
				<div class="flash-error" role="alert">{form.inviteMessage}</div>
			{/if}

			{#if form && "inviteSuccess" in form && form.inviteSuccess}
				<div class="flash-success">
					招待コードを発行しました: <strong>{form.inviteCode}</strong>
					<br>
					<a href={inviteUrl(form.inviteCode)}>{inviteUrl(form.inviteCode)}</a>
				</div>
			{/if}

			<form
				method="POST"
				action="?/create"
				class="auth-form"
				use:enhance={() => {
					creating = true;
					return async ({ update }) => {
						creating = false;
						await update();
					};
				}}
			>
				<div class="field">
					<label for="invite-max-uses" class="field-label">使用回数</label>
					<input
						id="invite-max-uses"
						name="max_uses"
						type="number"
						min="1"
						max="10"
						value="5"
						class="field-input"
					>
					<p class="field-hint">最大10回まで（1つのコードを複数人で共有できます）</p>
				</div>
				<div class="field">
					<label for="invite-expires-at" class="field-label">有効期限（任意）</label>
					<input id="invite-expires-at" name="expires_at" type="date" class="field-input">
					<p class="field-hint">未指定の場合は30日後に自動的に失効します</p>
				</div>
				<button type="submit" class="btn btn-primary auth-wide-button" disabled={creating}>
					{creating ? '発行中…' : '招待コードを発行'}
				</button>
			</form>

			<h2 class="invite-list-title">発行した招待</h2>

			{#if data.invites.length === 0}
				<p class="auth-info-text">まだ招待コードを発行していません。</p>
			{:else}
				<ul class="invite-list">
					{#each data.invites as invite (invite.id)}
						{@const inviteState = inviteStatus(invite)}
						<li class="invite-item">
							<div class="invite-main">
								<code class="invite-code">{invite.code}</code>
								<span class="invite-inviteState" class:active={inviteState.active}
									>{inviteState.label}</span
								>
							</div>
							<div class="invite-meta">
								<span>{invite.use_count}/{invite.max_uses}回使用</span>
								<span>
									{invite.expires_at ? `${formatRelativeTime(invite.expires_at)}に失効` : '無期限'}
								</span>
								<span>{formatRelativeTime(invite.created_at)}発行</span>
							</div>
							<div class="invite-actions">
								<button type="button" class="btn btn-outline" onclick={() => copyLink(invite.code)}>
									リンクをコピー
								</button>
								{#if inviteState.active}
									<form method="POST" action="?/revoke" use:enhance>
										<input type="hidden" name="invite_id" value={invite.id}>
										<button type="submit" class="btn btn-ghost">失効させる</button>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</main>
</div>

<style>
.auth-info-text {
	color: var(--fg-muted);
	font-size: 0.88rem;
	margin: 12px 0 18px;
}

.auth-form {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.auth-wide-button {
	width: 100%;
	justify-content: center;
}

.invite-list-title {
	margin: 28px 0 12px;
	font-size: 1rem;
	font-weight: 700;
}

.invite-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.invite-item {
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 12px 14px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.invite-main {
	display: flex;
	align-items: center;
	gap: 10px;
}

.invite-code {
	font-family: monospace;
	font-size: 1rem;
	font-weight: 700;
	letter-spacing: 0.05em;
}

.invite-inviteState {
	font-size: 0.75rem;
	font-weight: 700;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--border);
	color: var(--fg-muted);
}

.invite-inviteState.active {
	background: color-mix(in srgb, #34d399 18%, transparent);
	color: #34d399;
}

.invite-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	font-size: 0.8rem;
	color: var(--fg-muted);
}

.invite-actions {
	display: flex;
	gap: 8px;
}
</style>
