<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { trapFocus } from "$lib/actions/trapFocus";
import type { Event, EventNotificationSetting } from "$lib/types";

type EventSettingsEventData = Pick<
	Event,
	"id" | "title" | "description" | "hashtag" | "scheduled_at" | "duration_minutes" | "anime_id" | "is_cancelled"
>;

type Props = {
	open: boolean;
	event: EventSettingsEventData;
	canManage: boolean;
	isMuted: boolean;
	notificationSetting: EventNotificationSetting | null;
	loggedIn: boolean;
	onclose: () => void;
};

let { open, event, canManage, isMuted, notificationSetting, loggedIn, onclose }: Props = $props();

let muteSubmitting = $state(false);
let muteError = $state("");
let notificationSubmitting = $state(false);
let notificationError = $state("");
let editSubmitting = $state(false);
let editError = $state("");
let confirmingCancel = $state(false);
let cancelSubmitting = $state(false);
let cancelError = $state("");

function toDateTimeLocalValue(iso: string): string {
	const d = new Date(iso);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const h = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day}T${h}:${min}`;
}

$effect(() => {
	if (open) return;
	confirmingCancel = false;
	muteError = "";
	notificationError = "";
	editError = "";
	cancelError = "";
});

$effect(() => {
	if (!open) return;
	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === "Escape") onclose();
	};
	window.addEventListener("keydown", handleKeydown);
	return () => window.removeEventListener("keydown", handleKeydown);
});

const handleMuteSubmit: SubmitFunction = () => {
	muteSubmitting = true;
	muteError = "";
	return async ({ result, update }) => {
		muteSubmitting = false;
		if (result.type === "failure") {
			muteError = (result.data as { message?: string })?.message ?? "ミュート設定に失敗しました";
			return;
		}
		if (result.type === "error") {
			muteError = "ミュート設定に失敗しました";
			return;
		}
		await update({ reset: false });
	};
};

const handleNotificationSubmit: SubmitFunction = () => {
	notificationSubmitting = true;
	notificationError = "";
	return async ({ result, update }) => {
		notificationSubmitting = false;
		if (result.type === "failure") {
			notificationError = (result.data as { message?: string })?.message ?? "通知設定の保存に失敗しました";
			return;
		}
		if (result.type === "error") {
			notificationError = "通知設定の保存に失敗しました";
			return;
		}
		await update({ reset: false });
	};
};

const handleEditSubmit: SubmitFunction = () => {
	editSubmitting = true;
	editError = "";
	return async ({ result, update }) => {
		editSubmitting = false;
		if (result.type === "failure") {
			editError = (result.data as { message?: string })?.message ?? "イベントの更新に失敗しました";
			return;
		}
		if (result.type === "error") {
			editError = "イベントの更新に失敗しました";
			return;
		}
		await update({ reset: false });
		onclose();
	};
};

const handleCancelSubmit: SubmitFunction = () => {
	cancelSubmitting = true;
	cancelError = "";
	return async ({ result, update }) => {
		cancelSubmitting = false;
		if (result.type === "failure") {
			cancelError = (result.data as { message?: string })?.message ?? "イベントのキャンセルに失敗しました";
			return;
		}
		if (result.type === "error") {
			cancelError = "イベントのキャンセルに失敗しました";
			return;
		}
		confirmingCancel = false;
		await update({ reset: false });
		onclose();
	};
};
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" role="presentation" onclick={() => onclose()}>
		<div
			class="modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="event-settings-modal-title"
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
		>
			<header class="modal-header">
				<h2 id="event-settings-modal-title">イベント設定</h2>
				<button type="button" class="modal-close" aria-label="閉じる" onclick={() => onclose()}>
					<span class="i-lucide-x" aria-hidden="true"></span>
				</button>
			</header>

			<div class="modal-body">
				{#if loggedIn}
					<section class="field-section" aria-labelledby="notify-section-label">
						<div class="section-heading"><h3 id="notify-section-label">通知・ミュート</h3></div>

						<form
							method="POST"
							action={isMuted ? "?/removeEventMute" : "?/updateEventMute"}
							use:enhance={handleMuteSubmit}
							class="mute-row-form"
						>
							<input type="hidden" name="event_id" value={event.id}>
							<div class="mute-row">
								<span>このイベントをミュート</span>
								<button
									type="submit"
									class="toggle-button"
									class:active={isMuted}
									disabled={muteSubmitting}
								>
									{isMuted ? "ミュート中" : "ミュートする"}
								</button>
							</div>
						</form>
						{#if muteError}
							<p class="form-error" role="alert">{muteError}</p>
						{/if}

						<form
							method="POST"
							action="?/updateEventNotification"
							use:enhance={handleNotificationSubmit}
							class="notify-form"
						>
							<input type="hidden" name="event_id" value={event.id}>
							<div class="notify-checkboxes">
								<label>
									<input
										type="checkbox"
										name="notify_1min"
										checked={notificationSetting?.notify_1min ?? false}
									>
									<span>1分前</span>
								</label>
								<label>
									<input
										type="checkbox"
										name="notify_5min"
										checked={notificationSetting?.notify_5min ?? false}
									>
									<span>5分前</span>
								</label>
								<label>
									<input
										type="checkbox"
										name="notify_30min"
										checked={notificationSetting?.notify_30min ?? false}
									>
									<span>30分前</span>
								</label>
							</div>
							{#if notificationError}
								<p class="form-error" role="alert">{notificationError}</p>
							{/if}
							<button type="submit" class="save-button save-button--sm" disabled={notificationSubmitting}>
								{notificationSubmitting ? "保存中…" : "保存"}
							</button>
						</form>
					</section>
				{/if}

				{#if canManage}
					<section class="field-section" aria-labelledby="edit-section-label">
						<div class="section-heading"><h3 id="edit-section-label">イベント編集</h3></div>
						<form method="POST" action="?/updateEvent" use:enhance={handleEditSubmit} class="edit-form">
							<input type="hidden" name="event_id" value={event.id}>
							<input type="hidden" name="anime_id" value={event.anime_id ?? ""}>
							<label>
								<span>タイトル</span>
								<input
									class="input"
									type="text"
									name="title"
									required
									maxlength="100"
									value={event.title}
								>
							</label>
							<label>
								<span>開始日時</span>
								<input
									class="input"
									type="datetime-local"
									name="scheduled_at"
									required
									value={toDateTimeLocalValue(event.scheduled_at)}
								>
							</label>
							<label>
								<span>ハッシュタグ</span>
								<input
									class="input"
									type="text"
									name="hashtag"
									required
									maxlength="50"
									value={event.hashtag}
								>
							</label>
							<label>
								<span>説明</span>
								<textarea
									class="input"
									name="description"
									rows="3"
									maxlength="280"
									value={event.description ?? ""}
								></textarea>
							</label>
							<label>
								<span>所要時間（分）</span>
								<input
									class="input"
									type="number"
									name="duration_minutes"
									min="1"
									value={event.duration_minutes ?? ""}
								>
							</label>
							{#if editError}
								<p class="form-error" role="alert">{editError}</p>
							{/if}
							<button type="submit" class="save-button" disabled={editSubmitting}>
								{editSubmitting ? "保存中…" : "変更を保存"}
							</button>
						</form>
					</section>

					<section class="field-section field-section--danger" aria-labelledby="danger-section-label">
						<div class="section-heading"><h3 id="danger-section-label">イベントを中止</h3></div>
						{#if event.is_cancelled}
							<p class="cancelled-notice">このイベントはキャンセル済みです。</p>
						{:else}
							<form
								method="POST"
								action="?/cancelEvent"
								use:enhance={handleCancelSubmit}
								class="cancel-form"
							>
								<input type="hidden" name="event_id" value={event.id}>
								{#if cancelError}
									<p class="form-error" role="alert">{cancelError}</p>
								{/if}
								{#if confirmingCancel}
									<div class="cancel-confirm-row">
										<span>本当にこのイベントを中止しますか？</span>
										<button
											type="button"
											class="cancel-button"
											disabled={cancelSubmitting}
											onclick={() => (confirmingCancel = false)}
										>
											やめる
										</button>
										<button type="submit" class="danger-button" disabled={cancelSubmitting}>
											{cancelSubmitting ? "処理中…" : "中止する"}
										</button>
									</div>
								{:else}
									<button
										type="button"
										class="danger-button"
										onclick={() => (confirmingCancel = true)}
									>
										イベントを中止
									</button>
								{/if}
							</form>
						{/if}
					</section>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
.modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: grid;
	place-items: center;
	padding: 16px;
	background: rgb(0 0 0 / 72%);
	backdrop-filter: blur(6px);
}
.modal-card {
	width: min(100%, 520px);
	max-height: min(760px, calc(100dvh - 32px));
	overflow-y: auto;
	border: 1px solid var(--color-border);
	border-radius: 18px;
	background: var(--color-bg);
	color: var(--color-text);
	box-shadow: 0 24px 80px rgb(0 0 0 / 48%);
}
.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 18px 20px;
	border-bottom: 1px solid var(--color-border);
}
.modal-header h2 {
	margin: 0;
	font-size: 1.1rem;
	letter-spacing: 0.01em;
}
.modal-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: 0;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	padding: 4px;
}
.modal-close:hover {
	color: var(--color-text);
}
.modal-body {
	padding: 4px 20px 20px;
}
.field-section {
	padding: 18px 0;
	border-bottom: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
}
.field-section:last-child {
	border-bottom: 0;
}
.section-heading {
	margin-bottom: 11px;
}
.section-heading h3 {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-muted);
	font-weight: 650;
	letter-spacing: 0.04em;
}
.mute-row-form {
	margin-bottom: 10px;
}
.mute-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}
.mute-row span {
	color: var(--color-text);
	font-size: 0.88rem;
}
.toggle-button {
	min-height: 36px;
	border: 1px solid var(--color-border-hover);
	border-radius: 999px;
	padding: 0 16px;
	background: var(--color-surface);
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 0.8rem;
	font-weight: 650;
}
.toggle-button.active {
	border-color: var(--color-accent);
	background: var(--color-accent);
	color: var(--color-bg);
}
.toggle-button:disabled {
	cursor: wait;
	opacity: 0.6;
}
.notify-checkboxes {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
	margin-bottom: 12px;
}
.notify-checkboxes label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: var(--color-text);
	font-size: 0.85rem;
	cursor: pointer;
}
.edit-form {
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.edit-form label {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 0.82rem;
	color: var(--color-text-muted);
}
.edit-form .input {
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-surface);
	color: var(--color-text);
	padding: 8px 10px;
	font-size: 0.9rem;
}
.edit-form .input:focus {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
}
.form-error {
	margin: 10px 0 0;
	color: var(--color-error-text);
	font-size: 0.82rem;
}
.save-button {
	align-self: flex-start;
	min-height: 40px;
	border: 1px solid var(--color-accent);
	border-radius: 11px;
	padding: 0 18px;
	background: var(--color-accent);
	color: var(--color-bg);
	cursor: pointer;
	font-weight: 750;
}
.save-button:hover:not(:disabled) {
	border-color: var(--color-accent-hover);
	background: var(--color-accent-hover);
}
.save-button--sm {
	min-height: 34px;
	padding: 0 14px;
	font-size: 0.82rem;
}
.save-button:disabled {
	cursor: wait;
	opacity: 0.6;
}
.cancelled-notice {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 0.85rem;
}
.cancel-confirm-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}
.cancel-confirm-row span {
	color: var(--color-text);
	font-size: 0.85rem;
}
.cancel-button {
	min-height: 36px;
	border: 1px solid var(--color-border-hover);
	border-radius: 10px;
	padding: 0 14px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-weight: 650;
}
.cancel-button:hover:not(:disabled) {
	background: var(--color-hover);
	color: var(--color-text);
}
.danger-button {
	min-height: 40px;
	border: 1px solid var(--color-danger);
	border-radius: 11px;
	padding: 0 18px;
	background: transparent;
	color: var(--color-danger);
	cursor: pointer;
	font-weight: 750;
}
.danger-button:hover:not(:disabled) {
	background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}
.danger-button:disabled,
.cancel-button:disabled {
	cursor: wait;
	opacity: 0.6;
}

@media (max-width: 520px) {
	.modal-backdrop {
		align-items: end;
		padding: 0;
	}
	.modal-card {
		width: 100%;
		max-height: calc(100dvh - 24px);
		border-radius: 20px 20px 0 0;
	}
}
</style>
