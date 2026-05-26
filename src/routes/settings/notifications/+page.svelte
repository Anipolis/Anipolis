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
const muteDays = [1, 2, 3, 4, 5, 6, 7] as const;

const settingsSubmit: SubmitFunction = () => {
	saving = true;
	return async ({ update }) => {
		saving = false;
		await update({ reset: false });
	};
};

function formatMutedUntil(value: string) {
	return new Date(value).toLocaleString("ja-JP", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
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
			{#if form?.roomMuteSuccess}
				<div class="flash-success">ルームのミュート設定を保存しました。</div>
			{/if}

			<section class="settings-section">
				<h2 class="settings-section-title">放送前通知のタイミング</h2>
				<p class="settings-section-desc">
					スケジュールページでベル登録したアニメの放送が近づくと、アプリ内通知をお届けし、
					カレンダーのアイコンに未読マークを表示します。
					複数選択した場合は、最も早いタイミングで一度だけ通知します。
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
							<small>放送の1分前にアプリ内通知</small>
						</span>
					</label>

					<label class="toggle-row">
						<input type="checkbox" name="notify_5min" bind:checked={notify5min}>
						<span>
							<strong>5分前</strong>
							<small>放送の5分前にアプリ内通知</small>
						</span>
					</label>

					<label class="toggle-row">
						<input type="checkbox" name="notify_30min" bind:checked={notify30min}>
						<span>
							<strong>30分前</strong>
							<small>放送の30分前にアプリ内通知</small>
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
				<h2 class="settings-section-title">ルーム投稿のネタバレ防止ミュート</h2>
				<p class="settings-section-desc">
					ベルメニューでミュートした放送ルームからの投稿を、タイムラインで非表示にする期間を設定します。
					ルームを直接開いたときは投稿を確認できます。
				</p>

				{#if data.roomMutes.length === 0}
					<p class="room-mute-empty">ミュート中の放送ルームはありません。</p>
				{:else}
					<div class="room-mute-list">
						{#each data.roomMutes as mute (mute.anime_id)}
							<div class="room-mute-item">
								<div class="room-mute-info">
									<strong>{mute.anime_title}</strong>
									<small>
										{mute.room_date}
										のルーム /
										{new Date(mute.muted_until) > new Date()
											? `${formatMutedUntil(mute.muted_until)}まで非表示`
											: "終了済み"}
									</small>
								</div>
								<form method="POST" action="?/updateRoomMute" use:enhance class="room-mute-form">
									<input type="hidden" name="anime_id" value={mute.anime_id}>
									<input type="hidden" name="room_date" value={mute.room_date}>
									<label class="sr-only" for="duration-{mute.anime_id}">ミュート期間</label>
									<select
										id="duration-{mute.anime_id}"
										class="field-input room-mute-select"
										name="duration"
									>
										{#each muteDays as days}
											<option value={days} selected={mute.duration === days}>{days}日</option>
										{/each}
										<option value="event_end" selected={mute.duration === "event_end"}>
											イベント終了まで
										</option>
									</select>
									<button type="submit" class="btn btn-primary btn-sm">更新</button>
								</form>
								<form method="POST" action="?/removeRoomMute" use:enhance>
									<input type="hidden" name="anime_id" value={mute.anime_id}>
									<button type="submit" class="btn btn-ghost danger btn-sm">解除</button>
								</form>
							</div>
						{/each}
					</div>
				{/if}
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

.room-mute-empty {
	color: var(--text-muted, #94a3b8);
	font-size: 0.85rem;
	margin: 0;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}

.room-mute-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.room-mute-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--border, #334155);
	border-radius: 8px;
}

.room-mute-info {
	flex: 1;
	min-width: 0;
}

.room-mute-info strong,
.room-mute-info small {
	display: block;
}

.room-mute-info strong {
	font-size: 0.9rem;
	color: var(--text, #e2e8f0);
}

.room-mute-info small {
	margin-top: 3px;
	color: var(--text-muted, #94a3b8);
	font-size: 0.76rem;
}

.room-mute-form {
	display: flex;
	align-items: center;
	gap: 7px;
}

.room-mute-select {
	width: auto;
	min-width: 108px;
	padding: 7px 8px;
}

@media (max-width: 600px) {
	.room-mute-item {
		flex-wrap: wrap;
	}

	.room-mute-info {
		flex-basis: 100%;
	}
}
</style>
