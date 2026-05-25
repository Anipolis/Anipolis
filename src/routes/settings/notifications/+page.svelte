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

<svelte:head> <title>通知設定 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">通知設定</h1>
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
					スケジュールページでベル登録したアニメの放送が近づくと、カレンダー欄の放送枠がハイライトされます。
					以下で通知するタイミングを選択してください。
				</p>

				<form
					method="POST"
					action="?/updateNotificationSettings"
					use:enhance={settingsSubmit}
					class="notify-settings-form"
				>
					<label class="toggle-row">
						<input type="checkbox" name="notify_1min" bind:checked={notify1min}>
						<span>
							<strong>1分前</strong>
							<small>放送の1分前にハイライト表示</small>
						</span>
					</label>

					<label class="toggle-row">
						<input type="checkbox" name="notify_5min" bind:checked={notify5min}>
						<span>
							<strong>5分前</strong>
							<small>放送の5分前にハイライト表示</small>
						</span>
					</label>

					<label class="toggle-row">
						<input type="checkbox" name="notify_30min" bind:checked={notify30min}>
						<span>
							<strong>30分前</strong>
							<small>放送の30分前にハイライト表示</small>
						</span>
					</label>

					<div class="settings-actions">
						<button type="submit" class="btn btn-primary" disabled={saving}>
							{saving ? "保存中..." : "設定を保存"}
						</button>
					</div>
				</form>
			</section>

			<section class="settings-section">
				<h2 class="settings-section-title">ブラウザ通知</h2>
				<p class="settings-section-desc">
					スケジュールページを開いている間、放送通知ベルを登録したアニメが通知タイミングに達すると
					ブラウザ通知も送られます（ブラウザの通知許可が必要です）。
					通知許可はスケジュールページで最初にベル登録したときに求められます。
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
	font-weight: 700;
	color: var(--fg, #e2e8f0);
}

.settings-section-desc {
	font-size: 0.82rem;
	color: var(--text-muted, #94a3b8);
	margin: 0 0 16px;
	line-height: 1.6;
}

.notify-settings-form {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.toggle-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--border, #334155);
	cursor: pointer;
}

.toggle-row input[type="checkbox"] {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
	accent-color: var(--accent, #6366f1);
	cursor: pointer;
}

.toggle-row strong,
.toggle-row small {
	display: block;
}

.toggle-row strong {
	font-size: 0.96rem;
	color: var(--text, #e2e8f0);
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
