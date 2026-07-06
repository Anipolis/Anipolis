<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import ToggleSwitch from "$lib/components/ToggleSwitch.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let notify1min = $state(untrack(() => data.notificationSettings.notify_1min));
let notify5min = $state(untrack(() => data.notificationSettings.notify_5min));
let notify30min = $state(untrack(() => data.notificationSettings.notify_30min));
let saving = $state(false);
let justSaved = $state(false);
let formEl = $state<HTMLFormElement | null>(null);
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function autoSave() {
	formEl?.requestSubmit();
}

const settingsSubmit: SubmitFunction = () => {
	saving = true;
	justSaved = false;
	return async ({ result, update }) => {
		try {
			await update({ reset: false });
		} finally {
			saving = false;
		}
		if (result.type === "failure" || result.type === "error") {
			// 保存に失敗したらサーバー状態へ巻き戻す
			notify1min = data.notificationSettings.notify_1min;
			notify5min = data.notificationSettings.notify_5min;
			notify30min = data.notificationSettings.notify_30min;
			return;
		}
		justSaved = true;
		if (savedTimer) clearTimeout(savedTimer);
		savedTimer = setTimeout(() => {
			justSaved = false;
		}, 2000);
	};
};
</script>

<svelte:head> <title>ルーム通知設定 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">ルーム通知</h1>
			</div>

			{#if form && "message" in form}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<section class="settings-section">
				<div class="section-heading-row">
					<h2 class="settings-section-title">放送前通知のタイミング</h2>
					<span class="autosave-status" class:visible={saving || justSaved} aria-live="polite">
						{#if saving}
							保存中…
						{:else if justSaved}
							✓ 保存しました
						{/if}
					</span>
				</div>
				<p class="settings-section-desc">
					スケジュールページでベル登録したアニメの放送やイベントの開始が近づくと、アプリ内通知をお届けし、
					カレンダーのアイコンに未読マークを表示します。
					複数選択した場合はそれぞれのタイミングで通知します。同じルームの通知は1件にまとめて更新されます。
				</p>

				<form
					method="POST"
					action="?/updateNotificationSettings"
					use:enhance={settingsSubmit}
					bind:this={formEl}
				>
					<div class="toggle-row">
						<span class="toggle-row-text">
							<strong>1分前</strong>
							<small>放送の1分前にアプリ内通知</small>
						</span>
						<ToggleSwitch
							name="notify_1min"
							bind:checked={notify1min}
							disabled={saving}
							label="1分前に通知"
							onchange={autoSave}
						/>
					</div>
					<div class="toggle-row">
						<span class="toggle-row-text">
							<strong>5分前</strong>
							<small>放送の5分前にアプリ内通知</small>
						</span>
						<ToggleSwitch
							name="notify_5min"
							bind:checked={notify5min}
							disabled={saving}
							label="5分前に通知"
							onchange={autoSave}
						/>
					</div>
					<div class="toggle-row">
						<span class="toggle-row-text">
							<strong>30分前</strong>
							<small>放送の30分前にアプリ内通知</small>
						</span>
						<ToggleSwitch
							name="notify_30min"
							bind:checked={notify30min}
							disabled={saving}
							label="30分前に通知"
							onchange={autoSave}
						/>
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
	border-top: 1px solid var(--color-border);
}
.section-heading-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
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
.autosave-status {
	color: var(--color-text-muted);
	font-size: 0.78rem;
	opacity: 0;
	transition: opacity 0.2s ease;
}
.autosave-status.visible {
	opacity: 1;
}
.toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--color-border);
}
.toggle-row-text strong,
.toggle-row-text small {
	display: block;
}
.toggle-row-text small {
	margin-top: 2px;
	color: var(--color-text-muted);
	font-size: 0.82rem;
}
</style>
