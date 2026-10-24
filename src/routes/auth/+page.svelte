<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onDestroy, tick } from "svelte";
import { enhance } from "$app/forms";
import { beforeNavigate, goto } from "$app/navigation";
import { page } from "$app/state";
import PasswordInput from "$lib/components/PasswordInput.svelte";
import { signInWithPasskey } from "$lib/passkey";
import type { PageProps } from "./$types";
import { type InviteCodeState, syncInviteCodeState } from "./invite-code";

let { data, form }: PageProps = $props();

// クローズドβのコミュニティへの招待リンク。招待コードが無い人の入口にする
const DISCORD_INVITE_URL = "https://discord.gg/QxQmg4EEgP";

const activeMode = $derived((form?.mode ?? data.mode) as "login" | "register" | "add_account");
const next = $derived((form && "next" in form && typeof form.next === "string" ? form.next : data.next) ?? "/");
let inviteCodeState = $state<InviteCodeState>({ value: "", dirty: false, source: null, linkSource: "" });

// Keep a link-provided code in sync when the same page instance receives new
// data through client-side navigation, without overwriting a code the user
// has already typed.
$effect(() => {
	syncInviteCodeState(inviteCodeState, data.inviteCode, page.url.searchParams.get("invite"));
});

// 招待コード欄の入力。bind:value にして、ハイドレーション前に打った値も取り込む（#417）
function setInviteCodeInput(value: string): void {
	inviteCodeState.value = value;
	inviteCodeState.dirty = true;
}

// クローズドβが有効かつ、まだ有効な招待コードを確認できていない間は
// 招待コード入力とDiscordの二択のみを表示し、Google/X/メールは隠す。
const hasInviteAccess = $derived(!data.betaGateEnabled || data.inviteCodeValid);
// 確認済みの招待コードは入力欄にせず、確認できたことだけを 1 行で示す
const inviteVerified = $derived(activeMode === "register" && data.betaGateEnabled && data.inviteCodeValid);

// パスキーは登録済みの既存アカウント専用（新規作成はできない）なので、招待コードの有無に関係なく出す
let passkeyPending = $state(false);
let passkeyError = $state("");

// 送信中のフォーム（ボタンを押せなくして「…中」を出す。二重送信を防ぐ、#419）
type SubmitKind = "login" | "register" | "invite" | "add_account" | "discord" | "google" | "twitter";
let submitting = $state<SubmitKind | null>(null);
let loginPasswordInput = $state<HTMLInputElement | null>(null);
let registerPasswordInput = $state<HTMLInputElement | null>(null);

/** 失敗したときに直してほしい欄へフォーカスを戻す（エラーは上か欄の下に出ている） */
async function focusAfterFailure(kind: SubmitKind): Promise<void> {
	await tick();
	const field = form && "field" in form ? form.field : null;
	const byId = (id: string) => document.getElementById(id) as HTMLInputElement | null;
	let target: HTMLInputElement | null = null;
	if (kind === "login") {
		const email = byId("login-email");
		target = email && !email.value ? email : loginPasswordInput;
	} else if (kind === "register") {
		target =
			field === "username"
				? byId("register-username")
				: field === "password"
					? registerPasswordInput
					: byId("register-email");
	} else if (kind === "invite") {
		target = byId("invite-code-gate");
	} else if (kind === "add_account") {
		target = byId("add-email");
	}
	target?.focus();
	target?.select?.();
}

/**
 * メールのフォームの送信（use:enhance）。ページ全体を読み込み直さず、送信中の表示と失敗時のフォーカスを扱う。
 * ログインできてリダイレクトするときは、認証の状態を確実に反映するためページごと移る
 */
function enhanceAuth(kind: SubmitKind): SubmitFunction {
	return ({ cancel, controller }) => {
		if (submitting) {
			cancel();
			return;
		}
		submitting = kind;
		pendingSubmit = controller;
		return async ({ result, update, formElement }) => {
			pendingSubmit = null;
			if (result.type === "redirect") {
				window.location.assign(result.location);
				return;
			}
			await update({ reset: result.type === "success" });
			submitting = null;
			if (result.type === "success") {
				// reset は初期値（前回失敗したときの入力が入った defaultValue）に戻すので、明示的に空にする。
				// 確認メールの送信の成功表示と一緒に、失敗したときの古いアドレスが出ないように（#445 Codex）
				for (const input of formElement.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])')) {
					input.defaultValue = "";
					input.value = "";
				}
			}
			if (result.type === "failure") await focusAfterFailure(kind);
		};
	};
}

// 送信中にサイト内の別の画面（タブ・「パスワードをお忘れですか？」・キャンセル）へ移ったら、送信を取り消す。
// 後から応答が返ってきて移動先を上書きしたり、取り消したはずの追加を完了したりしないように（#445 Codex）
let pendingSubmit: AbortController | null = null;
function abortPendingSubmit(): void {
	if (!pendingSubmit) return;
	pendingSubmit.abort();
	pendingSubmit = null;
	submitting = null;
}
beforeNavigate(abortPendingSubmit);
onDestroy(abortPendingSubmit);

/** 外部サービスのログイン（外へリダイレクトするのでページ全体の送信のまま）。押したら他のボタンを止める */
function startOAuth(kind: SubmitKind, event: SubmitEvent): void {
	if (submitting) {
		event.preventDefault();
		return;
	}
	submitting = kind;
}

async function handlePasskeyLogin(): Promise<void> {
	passkeyPending = true;
	passkeyError = "";
	const result = await signInWithPasskey(next);
	if (result.ok) {
		// セッション Cookie はサーバーが設定済み
		await goto(result.redirectTo ?? "/", { invalidateAll: true });
		return;
	}
	passkeyError = result.message;
	passkeyPending = false;
}
</script>

<svelte:head>
	<title>
		{activeMode === 'register' ? 'アカウント作成' : activeMode === 'add_account' ? 'アカウントを追加' : 'ログイン'}
		- Anipolis
	</title>
</svelte:head>

<svelte:window
	onpageshow={() => {
		submitting = null;
	}}
/>

<div class="page-container auth-page">
	<main class="auth-panel">
		<div class="settings-card">
			<!-- 見出しはタブと同じ言葉になるので、画面には出さず読み上げ用に残す（#425）。アカウントの追加はタブが無いので見せる -->
			<h1 class="settings-title" class:sr-only={activeMode !== 'add_account'}>
				{activeMode === 'register' ? 'アカウント作成' : activeMode === 'add_account' ? 'アカウントを追加' : 'ログイン'}
			</h1>

			{#if activeMode !== 'add_account'}
				{#if data.betaGateEnabled}
					<!-- 長い説明の代わりに、いまの状況だけをバッジで示す -->
					<p class="auth-beta-badge">クローズドβ</p>
				{/if}
				<div class="auth-tabs" aria-label="認証メニュー">
					<a
						href="/auth?mode=login&next={encodeURIComponent(next)}"
						class:active={activeMode === 'login'}
						aria-current={activeMode === 'login' ? 'page' : undefined}
						>ログイン</a
					>
					<a
						href="/auth?mode=register&next={encodeURIComponent(next)}"
						class:active={activeMode === 'register'}
						aria-current={activeMode === 'register' ? 'page' : undefined}
						>アカウント作成</a
					>
				</div>
			{/if}

			{#if form?.success && form.message}
				<div class="flash-success">{form.message}</div>
			{:else if data.accountDeleted && !form}
				<div class="flash-success" role="status">退会が完了しました。ご利用ありがとうございました。</div>
			{/if}

			{#if form && 'message' in form && !form.success}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			{#if data.error === 'not_member'}
				<div class="flash-error" role="alert">
					このサービスは現在、クローズドβテスト中です。<a
						href={DISCORD_INVITE_URL}
						target="_blank"
						rel="noopener"
						>Discordサーバーへの参加</a
					>、または招待コードが必要です。
				</div>
			{:else if data.error === 'invite_required'}
				<div class="flash-error" role="alert">
					このサービスは現在、クローズドβテスト中です。招待リンクから登録するか、招待コードを入力してください。
				</div>
			{:else if data.error === 'invalid_invite'}
				<div class="flash-error" role="alert">招待コードが無効です。</div>
			{:else if data.error === 'invite_exhausted'}
				<div class="flash-error" role="alert">この招待コードは使用回数の上限に達しています。</div>
			{:else if data.error === 'grant_failed'}
				<div class="flash-error" role="alert">
					アクセス許可の付与に失敗しました。しばらく待ってから再度ログインしてください。
				</div>
			{:else if data.error === 'confirm_failed'}
				<div class="flash-error" role="alert">
					確認のリンクが無効か、有効期限が切れています。もう一度ログインするか、登録し直してください。
					{#if data.errorReason}
						（理由: {data.errorReason}）
					{/if}
				</div>
			{:else if data.error === 'oauth_failed'}
				<div class="flash-error" role="alert">
					ログインを完了できませんでした。時間をおいて、もう一度お試しください。
					{#if data.errorReason}
						（理由: {data.errorReason}）
					{/if}
				</div>
			{/if}

			{#if activeMode === 'add_account'}
				<p class="auth-info-text">別のAnipolisアカウントのメールアドレスとパスワードを入力してください。</p>
				<form
					method="POST"
					action="?/addAccount&mode=add_account"
					class="auth-form"
					novalidate
					use:enhance={enhanceAuth('add_account')}
				>
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
						<PasswordInput id="add-password" name="password" autocomplete="current-password" required />
					</div>
					<button type="submit" class="btn btn-primary auth-wide-button" disabled={submitting !== null}>
						{submitting === 'add_account' ? '確認中...' : 'アカウントを追加'}
					</button>
					<a href="/" class="btn btn-ghost auth-wide-button" style="text-align:center">キャンセル</a>
				</form>
			{:else if activeMode === 'register' && !hasInviteAccess}
				<!-- 説明文は置かず、入口ごとに小見出しを付けて分ける -->
				<form
					method="POST"
					action="?/applyInvite&mode=register&next={encodeURIComponent(next)}"
					class="auth-form"
					aria-labelledby="auth-invite-heading"
					novalidate
					use:enhance={enhanceAuth('invite')}
				>
					<h2 id="auth-invite-heading" class="auth-section-title">招待コードをお持ちの方</h2>
					<input type="hidden" name="next" value={next}>
					<div class="field">
						<!-- 小見出しと並ぶと紛らわしいので、ラベルは読み上げ用にだけ残し、画面では入力欄の中に薄く出す -->
						<label for="invite-code-gate" class="sr-only">招待コード</label>
						<input
							id="invite-code-gate"
							name="invite_code"
							type="text"
							class="field-input"
							autocomplete="off"
							bind:value={() => inviteCodeState.value, setInviteCodeInput}
							placeholder="招待コードを入力"
							required
						>
					</div>
					<!-- 空のまま押して空振りしないよう、1 文字以上入るまでは押せない見た目にする -->
					<button
						type="submit"
						class="btn btn-primary auth-wide-button"
						disabled={submitting !== null || inviteCodeState.value.trim() === ''}
					>
						{submitting === 'invite' ? '確認中...' : '次へ'}
					</button>
				</form>

				<div class="auth-divider"><span>または</span></div>

				<form
					method="POST"
					action="?/discord&next={encodeURIComponent(next)}"
					class="auth-oauth-form"
					aria-labelledby="auth-discord-heading"
					onsubmit={(event) => startOAuth('discord', event)}
				>
					<h2 id="auth-discord-heading" class="auth-section-title">Discordサーバーのメンバーの方</h2>
					<input type="hidden" name="next" value={next}>
					<input type="hidden" name="invite_code" value={inviteCodeState.value}>
					<button type="submit" class="btn btn-outline auth-wide-button" disabled={submitting !== null}>
						{submitting === 'discord' ? 'Discordへ移動中...' : 'Discordで登録'}
					</button>
				</form>
				<!-- 招待コードもサーバーへの参加も無い人が行き止まりにならないよう、サーバーへの入口を最後に控えめに出す -->
				<div class="auth-join">
					<p class="auth-join-title">招待コードをお持ちでない方</p>
					<p>
						<a href={DISCORD_INVITE_URL} target="_blank" rel="noopener"
							>公式Discordサーバーに参加する<span class="i-lucide-external-link" aria-hidden="true"></span
							><span class="sr-only">（新しいタブで開く）</span></a
						>
					</p>
				</div>
				<!-- 招待コードを確かめるだけの段階では同意を求めず、アカウントができる Discord の登録にだけ添える -->
				{@render consent()}
			{:else}
				{#if inviteVerified}
					<div class="auth-invite-verified">
						<span class="i-lucide-circle-check" aria-hidden="true"></span>
						<span class="auth-invite-verified-text"
							>招待コード <strong>{inviteCodeState.value}</strong> を確認しました</span
						>
					</div>
				{:else if data.betaGateEnabled && (activeMode !== 'login' || (form && 'needInvite' in form && form.needInvite) || ['not_member', 'invite_required', 'invalid_invite', 'invite_exhausted'].includes(data.error ?? ''))}
					<div class="field">
						<label for="invite-code" class="field-label">招待コード</label>
						<input
							id="invite-code"
							type="text"
							class="field-input"
							autocomplete="off"
							bind:value={() => inviteCodeState.value, setInviteCodeInput}
							placeholder="例: A1B2C3D4E5"
						>
						<p class="field-hint">
							招待リンクをお持ちでない場合は、招待してくれた方から届いたコードを入力してください。
						</p>
					</div>
				{/if}

				<!-- 外部サービスでのログインは1つのまとまりにし、その下に「または」を1回だけ置いてメールアドレスへ続ける（#421） -->
				<div class="auth-providers">
					{#if activeMode === 'login' && data.passkeyEnabled}
						{#if passkeyError}
							<div class="flash-error" role="alert">{passkeyError}</div>
						{/if}
						<button
							type="button"
							class="btn btn-outline auth-wide-button"
							onclick={handlePasskeyLogin}
							disabled={passkeyPending || submitting !== null}
						>
							<span class="i-lucide-key-round" aria-hidden="true"></span>
							{passkeyPending ? '確認中...' : 'パスキーでログイン'}
						</button>
					{/if}

					{#each [{ kind: 'discord', label: 'Discord' }, { kind: 'google', label: 'Google' }, { kind: 'twitter', label: 'X' }] as provider (provider.kind)}
						<form
							method="POST"
							action="?/{provider.kind}&next={encodeURIComponent(next)}"
							class="auth-oauth-form"
							onsubmit={(event) => startOAuth(provider.kind as SubmitKind, event)}
						>
							<input type="hidden" name="next" value={next}>
							<input type="hidden" name="invite_code" value={inviteCodeState.value}>
							<button
								type="submit"
								class="btn btn-outline auth-wide-button"
								disabled={submitting !== null}
							>
								{submitting === provider.kind ? `${provider.label}へ移動中...` : `${provider.label}で続ける`}
							</button>
						</form>
					{/each}
				</div>

				<div class="auth-divider"><span>またはメールアドレスで</span></div>

				{#if activeMode === 'login'}
					<form
						method="POST"
						action="?/login&next={encodeURIComponent(next)}"
						class="auth-form"
						novalidate
						use:enhance={enhanceAuth('login')}
					>
						<input type="hidden" name="next" value={next}>
						<input type="hidden" name="invite_code" value={inviteCodeState.value}>

						<div class="field">
							<label for="login-email" class="field-label">メールアドレス</label>
							<input
								id="login-email"
								name="email"
								type="email"
								class="field-input"
								autocomplete="email"
								defaultValue={form?.mode === 'login' ? form.email ?? '' : ''}
								required
							>
						</div>

						<div class="field">
							<label for="login-password" class="field-label">パスワード</label>
							<PasswordInput
								id="login-password"
								name="password"
								autocomplete="current-password"
								required
								bind:input={loginPasswordInput}
							/>
							<p class="field-hint auth-forgot-link">
								<a href="/auth/forgot-password">パスワードをお忘れですか？</a>
							</p>
						</div>

						<button type="submit" class="btn btn-primary auth-wide-button" disabled={submitting !== null}>
							{submitting === 'login' ? 'ログイン中...' : 'ログイン'}
						</button>
					</form>
				{:else}
					<form
						method="POST"
						action="?/register&next={encodeURIComponent(next)}"
						class="auth-form"
						novalidate
						use:enhance={enhanceAuth('register')}
					>
						<input type="hidden" name="next" value={next}>
						<input type="hidden" name="invite_code" value={inviteCodeState.value}>

						<div class="field">
							<label for="register-email" class="field-label">メールアドレス</label>
							<input
								id="register-email"
								name="email"
								type="email"
								class="field-input"
								autocomplete="email"
								defaultValue={form?.mode === 'register' ? form.email ?? '' : ''}
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
									defaultValue={form?.mode === 'register' ? form.username ?? '' : ''}
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
								defaultValue={form?.mode === 'register' ? form.display_name ?? '' : ''}
								placeholder="あとから変更できます"
							>
						</div>

						<div class="field">
							<label for="register-password" class="field-label">パスワード</label>
							<PasswordInput
								id="register-password"
								name="password"
								autocomplete="new-password"
								minlength={6}
								required
								invalid={Boolean(form && 'field' in form && form.field === 'password')}
								bind:input={registerPasswordInput}
							/>
							{#if form && 'field' in form && form.field === 'password'}
								<p class="field-error-msg">{form.message}</p>
							{:else}
								<p class="field-hint">6文字以上で入力してください。</p>
							{/if}
						</div>

						<button type="submit" class="btn btn-primary auth-wide-button" disabled={submitting !== null}>
							{submitting === 'register' ? '作成中...' : 'アカウントを作成'}
						</button>
					</form>
				{/if}
			{/if}

			{#snippet consent()}
				<p class="auth-consent">
					続行することで、<a href="/terms" target="_blank" rel="noopener">利用規約</a>および<a
						href="/privacy-policy"
						target="_blank"
						rel="noopener"
						>プライバシーポリシー</a
					>に同意したものとみなされます。
				</p>
			{/snippet}
			{#if activeMode !== 'add_account' && !(activeMode === 'register' && !hasInviteAccess)}
				{@render consent()}
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
	border-radius: 12px;
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

.auth-tabs a:not(.active):hover {
	color: var(--fg);
	background: var(--bg-hover);
}

/* 選んでいるタブは色付きの背景と枠で示す（未定義の --surface-hover を参照していて背景が付いていなかった） */
.auth-tabs a.active {
	color: var(--accent);
	background: var(--accent-muted);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
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

/* 外部サービスのボタンのまとまり（#421） */
.auth-providers {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-top: 4px;
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

.auth-beta-badge {
	display: inline-block;
	margin: 0;
	padding: 2px 10px;
	border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
	border-radius: 999px;
	background: var(--accent-muted);
	color: var(--accent);
	font-size: 0.75rem;
	font-weight: 700;
	line-height: 1.6;
}

.auth-beta-badge + .auth-tabs {
	margin-top: 12px;
}

.auth-section-title {
	margin: 0;
	color: var(--fg);
	font-size: 0.85rem;
	font-weight: 700;
}

.auth-invite-verified {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;
	padding: 10px 12px;
	border: 1px solid color-mix(in srgb, var(--status-watching) 45%, transparent);
	border-radius: 10px;
	background: color-mix(in srgb, var(--status-watching) 10%, transparent);
	color: var(--fg);
	font-size: 0.85rem;
}

.auth-invite-verified .i-lucide-circle-check {
	flex: none;
	width: 16px;
	height: 16px;
	color: var(--status-watching);
}

.auth-invite-verified-text {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.auth-form .btn-primary:disabled {
	background: var(--bg-hover);
	color: var(--fg-muted);
	box-shadow: none;
	cursor: not-allowed;
}

/* 例外的な案内なので、一段薄い背景のカードにしてフォームと分ける */
.auth-join {
	margin-top: 24px;
	padding: 12px 16px;
	border: 1px solid var(--border);
	border-radius: 12px;
	background: var(--bg-hover);
	color: var(--fg-muted);
	font-size: 0.8rem;
	line-height: 1.7;
	text-align: center;
}

.auth-join p {
	margin: 0;
}

.auth-join-title {
	font-weight: 700;
}

.auth-join a {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-weight: 700;
}

.auth-join a [class^="i-lucide"] {
	width: 13px;
	height: 13px;
}

.auth-join a,
.flash-error a {
	color: var(--accent);
	padding-block: 6px;
}

.auth-consent {
	margin: 20px 0 0;
	color: var(--fg-muted);
	font-size: 0.8rem;
	line-height: 1.6;
	text-align: center;
}

.auth-consent a {
	color: var(--accent);
	/* 行の高さを変えずにタップ領域を広げる（#428） */
	padding-block: 6px;
}

.auth-forgot-link {
	text-align: right;
}

/* 単独のリンクは押しやすい高さにする（WCAG 2.2 の 24px 以上、#428） */
.auth-forgot-link a {
	display: inline-block;
	padding: 8px 0;
	color: var(--fg-muted);
	text-decoration: underline;
}
</style>
