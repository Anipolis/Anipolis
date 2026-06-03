<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();
const muteDays = [1, 2, 3, 4, 5, 6, 7] as const;

const roomMuteSubmit: SubmitFunction = () => {
	return async ({ update }) => {
		await update({ reset: false });
	};
};

function updateDurationSettings(event: Event) {
	const radio = event.currentTarget as HTMLInputElement;
	const settings = radio.form?.querySelector<HTMLFieldSetElement>(".room-mute-duration-settings");
	if (settings) settings.disabled = radio.value === "event_end";
}
</script>

<svelte:head> <title>ルームミュート設定 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">ルームミュート</h1>
			</div>

			{#if form && "message" in form}
				<div class="flash-error">{form.message}</div>
			{/if}
			{#if form?.roomMuteSuccess}
				<div class="flash-success">ルームのミュート設定を保存しました。</div>
			{/if}

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
									<small>{mute.room_date} のルーム</small>
								</div>
								<form
									method="POST"
									action="?/updateRoomMute"
									use:enhance={roomMuteSubmit}
									class="room-mute-form"
								>
									<input type="hidden" name="anime_id" value={mute.anime_id}>
									<input type="hidden" name="room_date" value={mute.room_date}>
									<fieldset class="room-mute-options">
										<legend class="sr-only">ミュート方法</legend>
										<label class="room-mute-choice">
											<input
												type="radio"
												name="mute_mode"
												value="duration"
												checked={mute.duration !== "event_end"}
												onchange={updateDurationSettings}
											>
											<span>期間を指定してミュート</span>
										</label>
										<fieldset
											class="room-mute-duration-settings"
											disabled={mute.duration === "event_end"}
										>
											<legend class="sr-only">期間ミュート設定</legend>
											<label class="sr-only" for="duration-{mute.anime_id}">ミュート期間</label>
											<select
												id="duration-{mute.anime_id}"
												class="field-input room-mute-select"
												name="duration_days"
											>
												{#each muteDays as days}
													<option
														value={days}
														selected={(mute.duration === "event_end" ? 3 : mute.duration) === days}
													>
														{days}日
													</option>
												{/each}
											</select>
											<label class="room-mute-repeat">
												<input
													type="checkbox"
													name="repeat_weekly"
													checked={mute.repeat_weekly}
												>
												毎週繰り返す
											</label>
										</fieldset>
										<label class="room-mute-choice">
											<input
												class="room-mute-mode--event-end"
												type="radio"
												name="mute_mode"
												value="event_end"
												checked={mute.duration === "event_end"}
												onchange={updateDurationSettings}
											>
											<span>イベント終了までミュート</span>
										</label>
									</fieldset>
									<div class="room-mute-actions">
										<button
											type="submit"
											formaction="?/removeRoomMute"
											class="btn btn-ghost danger btn-sm"
										>
											解除
										</button>
										<button type="submit" class="btn btn-primary btn-sm">更新</button>
									</div>
								</form>
							</div>
						{/each}
					</div>
				{/if}
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
.settings-section-desc,
.room-mute-empty {
	color: var(--text-muted, #94a3b8);
	font-size: 0.82rem;
	line-height: 1.6;
}
.settings-section-desc {
	margin: 0 0 16px;
}
.room-mute-empty {
	margin: 0;
}
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
.room-mute-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.room-mute-item {
	padding: 20px;
	border: 1px solid var(--border, #334155);
	border-radius: 12px;
	background: var(--card-bg);
}
.room-mute-info {
	margin-bottom: 18px;
}
.room-mute-info strong,
.room-mute-info small {
	display: block;
}
.room-mute-info small,
.room-mute-repeat {
	color: var(--text-muted, #94a3b8);
	font-size: 0.76rem;
}
.room-mute-options {
	display: flex;
	flex-direction: column;
	gap: 10px;
	border: 0;
}
.room-mute-choice,
.room-mute-repeat {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
}
.room-mute-choice {
	font-weight: 700;
}
.room-mute-choice input,
.room-mute-repeat input {
	width: 17px;
	height: 17px;
	flex-shrink: 0;
	accent-color: var(--accent);
}
.room-mute-duration-settings {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-left: 25px;
	border: 0;
	transition: opacity 0.12s;
}
.room-mute-duration-settings:disabled {
	opacity: 0.42;
}
.room-mute-select {
	width: 100%;
	padding: 7px 8px;
}
.room-mute-repeat {
	gap: 4px;
	white-space: nowrap;
}
.room-mute-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding-top: 16px;
	margin-top: 18px;
	border-top: 1px solid var(--border, #334155);
}
@media (max-width: 600px) {
	.room-mute-item {
		padding: 16px;
	}
}
</style>
