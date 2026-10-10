<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import { registerPasskey } from "$lib/passkey";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let registering = $state(false);
let registerError = $state("");
let registered = $state(false);

async function handleRegister(): Promise<void> {
	registering = true;
	registerError = "";
	registered = false;
	const result = await registerPasskey();
	if (result.ok) {
		registered = true;
	} else {
		registerError = result.message;
	}
	// 一覧の更新、または再ログインが必要になったことを画面に反映する
	if (result.ok || result.reauthRequired) await invalidateAll();
	registering = false;
}

const confirmDelete: SubmitFunction = ({ cancel }) => {
	if (!confirm("このパスキーを削除しますか？削除したパスキーではログインできなくなります。")) {
		cancel();
		return;
	}
	registered = false;
	registerError = "";
};
</script>

<svelte:head><title>パスキー - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">パスキー</h1>
			</div>

			<p class="passkey-info-text">
				パスキーを登録すると、この端末の指紋・顔認証や画面ロックを使って、Discord
				などを経由せずにログインできます。
			</p>

			{#if registered}
				<div class="flash-success">パスキーを登録しました。</div>
			{/if}

			{#if form && "deleted" in form && form.deleted}
				<div class="flash-success">パスキーを削除しました。</div>
			{/if}

			{#if registerError}
				<div class="flash-error" role="alert">{registerError}</div>
			{/if}

			{#if form && "message" in form}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			{#if data.recentlyAuthenticated}
				<button
					type="button"
					class="btn btn-primary passkey-wide-button"
					onclick={handleRegister}
					disabled={registering}
				>
					<span class="i-lucide-key-round" aria-hidden="true"></span>
					{registering ? '登録中…' : 'パスキーを追加'}
				</button>
			{:else}
				<div class="passkey-reauth">
					<p class="passkey-reauth-text">
						セキュリティのため、パスキーを追加するにはログインし直してください。ログインし直してから{data.reauthWindowMinutes}分間追加できます。
					</p>

					{#each data.reauthProviders as provider (provider.action)}
						<form method="POST" action="/auth?/{provider.action}">
							<input type="hidden" name="next" value="/settings/passkeys">
							<button type="submit" class="btn btn-outline passkey-wide-button">
								{provider.label}でログインし直す
							</button>
						</form>
					{/each}

					{#if data.hasEmailProvider}
						<form method="POST" action="?/reauth" class="passkey-reauth-form" use:enhance>
							<div class="field">
								<label for="passkey-reauth-password" class="field-label">パスワードで確認</label>
								<input
									id="passkey-reauth-password"
									name="password"
									type="password"
									class="field-input"
									autocomplete="current-password"
									required
								>
							</div>
							<button type="submit" class="btn btn-outline passkey-wide-button">確認する</button>
						</form>
					{/if}
				</div>
			{/if}

			<h2 class="passkey-list-title">登録済みのパスキー</h2>

			{#if data.loadFailed}
				<p class="passkey-info-text">パスキーの一覧を取得できませんでした。時間をおいて再度お試しください。</p>
			{:else if data.passkeys.length === 0}
				<p class="passkey-info-text">まだパスキーを登録していません。</p>
			{:else}
				<ul class="passkey-list">
					{#each data.passkeys as passkey (passkey.id)}
						<li class="passkey-item">
							<div class="passkey-main">
								<strong>
									{passkey.device_type === 'multiDevice' ? '同期されるパスキー' : 'この端末だけのパスキー'}
								</strong>
								<div class="passkey-meta">
									<span>{formatRelativeTime(passkey.created_at)}に登録</span>
									<span>
										{passkey.last_used_at
											? `${formatRelativeTime(passkey.last_used_at)}に使用`
											: '未使用'}
									</span>
								</div>
							</div>
							<form method="POST" action="?/delete" use:enhance={confirmDelete}>
								<input type="hidden" name="passkey_id" value={passkey.id}>
								<button type="submit" class="btn btn-ghost">削除</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</main>
</div>

<style>
.passkey-info-text {
	color: var(--fg-muted);
	font-size: 0.88rem;
	margin: 12px 0 18px;
}

.passkey-wide-button {
	width: 100%;
	justify-content: center;
}

.passkey-reauth {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	border: 1px solid var(--border);
	border-radius: 12px;
}

.passkey-reauth-text {
	margin: 0;
	font-size: 0.88rem;
}

.passkey-reauth-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.passkey-list-title {
	margin: 28px 0 12px;
	font-size: 1rem;
	font-weight: 700;
}

.passkey-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.passkey-item {
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: 12px 14px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.passkey-main {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.passkey-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	font-size: 0.8rem;
	color: var(--fg-muted);
}
</style>
