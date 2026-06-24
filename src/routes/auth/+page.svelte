<script lang="ts">
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const activeMode = $derived((form?.mode ?? data.mode) as "login" | "register" | "add_account");
const next = $derived(data.next ?? "/");
</script>

<svelte:head>
	<title>
		{activeMode === 'register' ? 'アカウント作成' : activeMode === 'add_account' ? 'アカウントを追加' : 'ログイン'}
		- Anipolis
	</title>
</svelte:head>

<div class="page-container auth-page">
	<main class="auth-panel">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">
					{activeMode === 'register' ? 'アカウント作成' : activeMode === 'add_account' ? 'アカウントを追加' : 'ログイン'}
				</h1>
				<a href="/" class="btn btn-ghost">戻る</a>
			</div>

			{#if activeMode !== 'add_account' && !data.closedBeta}
				<div class="auth-tabs" aria-label="認証メニュー">
					<a href="/auth?mode=login&next={encodeURIComponent(next)}" class:active={activeMode === 'login'}
						>ログイン</a
					>
					<a
						href="/auth?mode=register&next={encodeURIComponent(next)}"
						class:active={activeMode === 'register'}
						>アカウント作成</a
					>
				</div>
			{/if}

			{#if form?.success && form.message}
				<div class="flash-success">{form.message}</div>
			{/if}

			{#if form && 'message' in form && !form.success}
				<div class="flash-error">{form.message}</div>
			{/if}

			{#if data.error === 'not_member'}
				<div class="flash-error">
					このサービスは現在、クローズドβテスト中です。テストに参加しているメンバーのみ利用できます。
				</div>
			{/if}

			{#if activeMode === 'add_account'}
				<p class="auth-info-text">別のAnipolisアカウントのメールアドレスとパスワードを入力してください。</p>
				<form method="POST" action="?/addAccount&mode=add_account" class="auth-form">
					<div class="field">
						<label for="add-email" class="field-label">メールアドレス</label>
						<input
							id="add-email"
							name="email"
							type="email"
							class="field-input"
							autocomplete="email"
							required
						>
					</div>
					<div class="field">
						<label for="add-password" class="field-label">パスワード</label>
						<input
							id="add-password"
							name="password"
							type="password"
							class="field-input"
							autocomplete="current-password"
							required
						>
					</div>
					<button type="submit" class="btn btn-primary auth-wide-button">アカウントを追加</button>
					<a href="/" class="btn btn-ghost auth-wide-button" style="text-align:center">キャンセル</a>
				</form>
			{:else}
				<form method="POST" action="?/discord" class="auth-oauth-form">
					<input type="hidden" name="next" value={next}>
					<button type="submit" class="btn btn-primary auth-wide-button">Discordで続ける</button>
				</form>

				{#if !data.closedBeta}
					<div class="auth-divider"><span>または</span></div>

					<form method="POST" action="?/google" class="auth-oauth-form">
						<input type="hidden" name="next" value={next}>
						<button type="submit" class="btn btn-outline auth-wide-button">Googleで続ける</button>
					</form>

					<div class="auth-divider"><span>または</span></div>

					{#if activeMode === 'login'}
						<form method="POST" action="?/login" class="auth-form">
							<input type="hidden" name="next" value={next}>

							<div class="field">
								<label for="login-email" class="field-label">メールアドレス</label>
								<input
									id="login-email"
									name="email"
									type="email"
									class="field-input"
									autocomplete="email"
									value={form?.mode === 'login' ? form.email ?? '' : ''}
									required
								>
							</div>

							<div class="field">
								<label for="login-password" class="field-label">パスワード</label>
								<input
									id="login-password"
									name="password"
									type="password"
									class="field-input"
									autocomplete="current-password"
									required
								>
							</div>

							<button type="submit" class="btn btn-primary auth-wide-button">ログイン</button>
						</form>
					{:else}
						<form method="POST" action="?/register" class="auth-form">
							<input type="hidden" name="next" value={next}>

							<div class="field">
								<label for="register-email" class="field-label">メールアドレス</label>
								<input
									id="register-email"
									name="email"
									type="email"
									class="field-input"
									autocomplete="email"
									value={form?.mode === 'register' ? form.email ?? '' : ''}
									required
								>
							</div>

							<div class="field">
								<label for="register-username" class="field-label">ユーザー名</label>
								<div class="field-input-prefix">
									<span class="prefix">@</span>
									<input
										id="register-username"
										name="username"
										type="text"
										class="field-input has-prefix"
										class:field-error={form && 'field' in form && form.field === 'username'}
										autocomplete="username"
										pattern={"[a-zA-Z0-9_]{3,20}"}
										maxlength="20"
										value={form?.mode === 'register' ? form.username ?? '' : ''}
										required
									>
								</div>
								{#if form && 'field' in form && form.field === 'username'}
									<p class="field-error-msg">{form.message}</p>
								{:else}
									<p class="field-hint">3〜20文字の半角英数字とアンダースコアが使えます。</p>
								{/if}
							</div>

							<div class="field">
								<label for="register-display-name" class="field-label">表示名</label>
								<input
									id="register-display-name"
									name="display_name"
									type="text"
									class="field-input"
									maxlength="50"
									value={form?.mode === 'register' ? form.display_name ?? '' : ''}
									placeholder="あとから変更できます"
								>
							</div>

							<div class="field">
								<label for="register-password" class="field-label">パスワード</label>
								<input
									id="register-password"
									name="password"
									type="password"
									class="field-input"
									class:field-error={form && 'field' in form && form.field === 'password'}
									autocomplete="new-password"
									minlength="6"
									required
								>
								{#if form && 'field' in form && form.field === 'password'}
									<p class="field-error-msg">{form.message}</p>
								{:else}
									<p class="field-hint">6文字以上で入力してください。</p>
								{/if}
							</div>

							<button type="submit" class="btn btn-primary auth-wide-button">アカウントを作成</button>
						</form>
					{/if}
				{/if}
			{/if}
		</div>
	</main>
</div>

<style>
.auth-page {
	justify-content: center;
}

.auth-panel {
	flex: 0 1 520px;
	min-width: 0;
}

.auth-tabs {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 6px;
	padding: 4px;
	margin: 18px 0;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: color-mix(in srgb, var(--surface) 75%, transparent);
}

.auth-tabs a {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 38px;
	border-radius: 6px;
	color: var(--fg-muted);
	font-size: 0.9rem;
	font-weight: 700;
	text-decoration: none;
}

.auth-tabs a.active {
	color: var(--fg);
	background: var(--surface-hover);
}

.auth-form,
.auth-oauth-form {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.auth-wide-button {
	width: 100%;
	justify-content: center;
}

.auth-divider {
	display: flex;
	align-items: center;
	gap: 12px;
	margin: 18px 0;
	color: var(--fg-muted);
	font-size: 0.82rem;
}

.auth-divider::before,
.auth-divider::after {
	content: "";
	height: 1px;
	flex: 1;
	background: var(--border);
}

.auth-info-text {
	color: var(--fg-muted);
	font-size: 0.88rem;
	margin: 12px 0 18px;
}
</style>
