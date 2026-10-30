<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let verifying = $state(false);

const submitCode: SubmitFunction = () => {
	verifying = true;
	return async ({ update }) => {
		verifying = false;
		await update();
	};
};
</script>

<svelte:head><title>二段階認証 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 520px; min-width: 0;">
		<div class="settings-card">
			<h1 class="settings-title">二段階認証</h1>

			{#if form && "message" in form}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<p class="auth-info-text">認証アプリに表示されている6桁のコードを入力してください。</p>

			<form method="POST" action="?/verify" class="auth-form" novalidate use:enhance={submitCode}>
				<input type="hidden" name="next" value={data.next}>
				<div class="field">
					<label for="mfa-code" class="field-label">確認コード</label>
					<input
						id="mfa-code"
						name="code"
						type="text"
						class="field-input mfa-code-input"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="8"
						placeholder="123456"
						required
					>
				</div>
				<button type="submit" class="btn btn-primary auth-wide-button" disabled={verifying}>
					{verifying ? "確認中..." : "確認してログイン"}
				</button>
			</form>

			<form method="POST" action="?/logout" class="mfa-logout">
				<button type="submit" class="btn btn-ghost">別のアカウントでログインする</button>
			</form>
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

.mfa-code-input {
	font-size: 1.25rem;
	letter-spacing: 0.3em;
	text-align: center;
}

.mfa-logout {
	display: flex;
	justify-content: center;
	margin-top: 16px;
}
</style>
