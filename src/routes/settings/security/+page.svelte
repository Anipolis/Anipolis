<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

// 設定の途中（QR コードを出してから確認コードを入れるまで）。確認コードを間違えても QR コードを出し続ける
type Enrollment = { factorId: string; qrCode: string; secret: string };
let enrollment = $state<Enrollment | null>(null);
$effect(() => {
	if (form && "enrolled" in form && form.enrolled) enrollment = form.enrolled;
	if (form && "verified" in form && form.verified) enrollment = null;
});

let busy = $state(false);
const submitWith: SubmitFunction = () => {
	busy = true;
	return async ({ update }) => {
		busy = false;
		await update();
	};
};

function confirmRemove(event: SubmitEvent) {
	if (!confirm("二段階認証を外しますか？外すと、管理画面を使うにはもう一度設定が必要です。")) event.preventDefault();
}
</script>

<svelte:head><title>二段階認証 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">二段階認証</h1>
			</div>

			{#if data.requiredForAdmin && data.factors.length === 0}
				<div class="flash-error" role="alert">
					管理画面を使うには二段階認証の設定が必要です。設定を済ませると管理画面に進めます。
				</div>
			{/if}

			{#if form && "verified" in form && form.verified}
				<div class="flash-success">
					二段階認証を設定しました。次からはログインのあとに確認コードを入力します。
				</div>
			{/if}
			{#if form && "removed" in form && form.removed}
				<div class="flash-success">二段階認証を外しました。</div>
			{/if}
			{#if form && "message" in form}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<p class="security-info-text">
				ログインのときに、パスワード（または Discord
				などでのログイン）に加えて、スマートフォンの認証アプリ（Google Authenticator・1Password
				など）に表示される6桁のコードを入力します。パスワードが漏れても、管理者として操作されるのを防げます。
			</p>

			{#if data.factors.length > 0}
				<h2 class="security-list-title">設定済み</h2>
				<ul class="security-list">
					{#each data.factors as factor (factor.id)}
						<li class="security-item">
							<span class="i-lucide-shield-check security-item-icon" aria-hidden="true"></span>
							<span class="security-item-text"
								>認証アプリ（{formatRelativeTime(factor.createdAt)}に設定）</span
							>
							{#if data.verifiedNow}
								<form
									method="POST"
									action="?/unenroll"
									use:enhance={submitWith}
									onsubmit={confirmRemove}
								>
									<input type="hidden" name="factor_id" value={factor.id}>
									<button type="submit" class="btn btn-ghost security-remove" disabled={busy}>
										外す
									</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{:else if enrollment}
				<ol class="security-steps">
					<li>
						認証アプリでこの QR コードを読み取ってください。
						<img
							class="security-qr"
							src={enrollment.qrCode}
							alt="二段階認証の設定用 QR コード"
							width="200"
							height="200"
						>
						<details class="security-secret">
							<summary>QR コードを読み取れないとき</summary>
							<p>認証アプリにこのキーを入力してください。</p>
							<code>{enrollment.secret}</code>
						</details>
					</li>
					<li>
						認証アプリに表示された6桁のコードを入力してください。
						<form method="POST" action="?/verify" class="security-verify" use:enhance={submitWith}>
							<input type="hidden" name="factor_id" value={enrollment.factorId}>
							{#if data.next}
								<input type="hidden" name="next" value={data.next}>
							{/if}
							<label for="security-code" class="sr-only">確認コード</label>
							<input
								id="security-code"
								name="code"
								type="text"
								class="field-input security-code-input"
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="8"
								placeholder="123456"
								required
							>
							<button type="submit" class="btn btn-primary security-wide-button" disabled={busy}>
								{busy ? "確認中..." : "確認して設定を完了"}
							</button>
						</form>
					</li>
				</ol>
			{:else}
				<form method="POST" action="?/enroll" use:enhance={submitWith}>
					<button type="submit" class="btn btn-primary security-wide-button" disabled={busy}>
						<span class="i-lucide-shield-plus" aria-hidden="true"></span>
						{busy ? "準備中..." : "設定をはじめる"}
					</button>
				</form>
			{/if}
		</div>
	</main>
</div>

<style>
.security-info-text {
	color: var(--fg-muted);
	font-size: 0.88rem;
	line-height: 1.7;
	margin: 12px 0 18px;
}

.security-wide-button {
	width: 100%;
	justify-content: center;
}

.security-list-title {
	margin: 24px 0 12px;
	font-size: 1rem;
	font-weight: 700;
}

.security-list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.security-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 14px;
	border: 1px solid var(--border);
	border-radius: 12px;
}

.security-item-icon {
	flex: none;
	width: 20px;
	height: 20px;
	color: var(--status-watching);
}

.security-item-text {
	flex: 1;
	min-width: 0;
	font-size: 0.9rem;
}

.security-remove {
	color: var(--color-danger);
}

.security-steps {
	display: flex;
	flex-direction: column;
	gap: 20px;
	margin: 0;
	padding-left: 1.4em;
	font-size: 0.92rem;
	line-height: 1.7;
}

.security-qr {
	display: block;
	margin: 12px 0;
	border-radius: 8px;
	background: #fff;
	padding: 8px;
}

.security-secret summary {
	cursor: pointer;
	color: var(--accent);
	font-size: 0.85rem;
}

.security-secret p {
	margin: 8px 0 4px;
	font-size: 0.85rem;
}

.security-secret code {
	display: block;
	padding: 8px 10px;
	border-radius: 8px;
	background: var(--bg-hover);
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.security-verify {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-top: 10px;
}

.security-code-input {
	font-size: 1.25rem;
	letter-spacing: 0.3em;
	text-align: center;
}
</style>
