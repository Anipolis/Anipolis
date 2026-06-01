<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let notify1min = $state(untrack(() => data.notificationSettings.notify_1min));
let notify5min = $state(untrack(() => data.notificationSettings.notify_5min));
let notify30min = $state(untrack(() => data.notificationSettings.notify_30min));
let saving = $state(false);

const settingsSubmit: SubmitFunction = () => {
	saving = true;
	return async ({ update }) => {
		saving = false;
		await update({ reset: false });
	};
};
</script>

<svelte:head> <title>ルーム通知設定 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">ルーム通知</h1>
				<a href="/settings" class="btn btn-ghost">設定</a>
			</div>

			{#if form && "message" in form}
				<div class="flash-error">{form.message}</div>
			{/if}
			{#if form?.success}
				<div class="flash-success">通知設定を保存しました。</div>
			{/if}

			<section class="settings-section">
				<h2 class="settings-section-title">放送前通知のタイミング</h2>
				<p class="settings-section-desc">
					スケジュールページでベル登録したアニメの放送が近づくと、アプリ内通知をお届けし、
					カレンダーのアイコンに未読マークを表示します。
					複数選択した場合は、最も早いタイミングで一度だけ通知します。
				</p>

				<form method="POST" action="?/updateNotificationSettings" use:enhance={settingsSubmit}>
					<label class="toggle-row">
						<input type="checkbox" name="notify_1min" bind:checked={notify1min}>
						<span><strong>1分前</strong><small>放送の1分前にアプリ内通知</small></span>
					</label>
					<label class="toggle-row">
						<input type="checkbox" name="notify_5min" bind:checked={notify5min}>
						<span><strong>5分前</strong><small>放送の5分前にアプリ内通知</small></span>
					</label>
					<label class="toggle-row">
						<input type="checkbox" name="notify_30min" bind:checked={notify30min}>
						<span><strong>30分前</strong><small>放送の30分前にアプリ内通知</small></span>
					</label>
					<div class="settings-actions">
						<button type="submit" class="btn btn-primary" disabled={saving}>
							{saving ? "保存中..." : "設定を保存"}
						</button>
					</div>
				</form>
			</section>

			<section class="settings-section">
				<h2 class="settings-section-title">通知の確認</h2>
				<p class="settings-section-desc">
					放送通知は通知一覧に届きます。アプリを開いている間は定期的に更新され、
					通知一覧を開くと既読になります。
				</p>
			</section>
		</div>
	</main>
</div>

<style>
.settings-section {
	padding-top: 18px;
	margin-top: 18px;
	border-top: 1px solid var(--border, #334155);
}
.settings-section-title {
	margin: 0 0 8px;
	font-size: 1rem;
	color: var(--fg, #e2e8f0);
}
.settings-section-desc {
	margin: 0 0 16px;
	color: var(--text-muted, #94a3b8);
	font-size: 0.82rem;
	line-height: 1.6;
}
.toggle-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--border, #334155);
	cursor: pointer;
}
.toggle-row input {
	width: 18px;
	height: 18px;
	accent-color: var(--accent, #6366f1);
}
.toggle-row strong,
.toggle-row small {
	display: block;
}
.toggle-row small {
	margin-top: 2px;
	color: var(--text-muted, #94a3b8);
	font-size: 0.82rem;
}
.settings-actions {
	margin-top: 16px;
}
</style>
