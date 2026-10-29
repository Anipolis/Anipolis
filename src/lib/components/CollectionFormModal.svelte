<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { applyAction, enhance } from "$app/forms";
import { trapFocus } from "$lib/actions/trapFocus";
import { MAX_COLLECTION_DESCRIPTION_LENGTH, MAX_COLLECTION_TITLE_LENGTH } from "$lib/collections";

/**
 * コレクションを作る・題名などを直す画面（#515）。送り先はページのフォームアクション。
 * 作るときは、できたコレクションのページへ移る（アクションの redirect）
 */
interface Props {
	mode: "create" | "edit";
	action: string;
	initial?: { title: string; description: string | null; is_public: boolean };
	/** 直す画面だけ: 削除のフォームアクション */
	deleteAction?: string;
	onclose: () => void;
}

let { mode, action, initial, deleteAction, onclose }: Props = $props();

let title = $state(untrack(() => initial?.title ?? ""));
let description = $state(untrack(() => initial?.description ?? ""));
let isPublic = $state(untrack(() => initial?.is_public ?? true));
let submitting = $state(false);
let error = $state<{ field?: "title" | "description"; message: string } | null>(null);
let titleInput = $state<HTMLInputElement | null>(null);
let deleteForm = $state<HTMLFormElement | null>(null);

const descriptionRemaining = $derived(MAX_COLLECTION_DESCRIPTION_LENGTH - description.length);

$effect(() => {
	titleInput?.focus();
});

function close() {
	if (!submitting) onclose();
}

const handleSubmit: SubmitFunction = () => {
	submitting = true;
	error = null;
	return async ({ result, update }) => {
		submitting = false;
		if (result.type === "failure") {
			const data = (result.data ?? {}) as { field?: "title" | "description"; message?: string };
			error = { ...(data.field ? { field: data.field } : {}), message: data.message ?? "保存に失敗しました" };
			if (data.field === "title") titleInput?.focus();
			return;
		}
		if (result.type === "redirect") {
			await applyAction(result);
			return;
		}
		await update({ reset: false });
		onclose();
	};
};

const handleDelete: SubmitFunction = ({ cancel }) => {
	if (!window.confirm(`「${initial?.title ?? ""}」を削除します。元に戻せません。`)) {
		cancel();
		return;
	}
	submitting = true;
	return async ({ result }) => {
		submitting = false;
		if (result.type === "failure") {
			error = { message: ((result.data ?? {}) as { message?: string }).message ?? "削除に失敗しました" };
			return;
		}
		await applyAction(result);
	};
};
</script>

<div class="collection-form-overlay" role="presentation" onclick={close}>
	<div
		use:trapFocus
		class="collection-form-card"
		role="dialog"
		aria-modal="true"
		aria-labelledby="collection-form-title"
		tabindex="-1"
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => {
			event.stopPropagation();
			if (event.key === "Escape") close();
		}}
	>
		<div class="collection-form-header">
			<span id="collection-form-title" class="collection-form-heading">
				{mode === 'create' ? 'コレクションを作る' : 'コレクションを編集'}
			</span>
			<button
				type="button"
				class="collection-form-close"
				aria-label="閉じる"
				disabled={submitting}
				onclick={close}
			>
				×
			</button>
		</div>

		<form method="POST" {action} use:enhance={handleSubmit} class="collection-form">
			<div class="collection-form-body">
				{#if error && !error.field}
					<div class="flash-error" role="alert">{error.message}</div>
				{/if}

				<div class="field">
					<label for="collection-title" class="field-label">題名</label>
					<input
						id="collection-title"
						bind:this={titleInput}
						name="title"
						type="text"
						class="field-input"
						class:field-error={error?.field === 'title'}
						aria-invalid={error?.field === 'title'}
						maxlength={MAX_COLLECTION_TITLE_LENGTH}
						autocomplete="off"
						bind:value={title}
						oninput={() => {
							if (error?.field === 'title') error = null;
						}}
					>
					{#if error?.field === 'title'}
						<p class="field-error-msg" role="alert">{error.message}</p>
					{/if}
				</div>

				<div class="field">
					<label for="collection-description" class="field-label">説明</label>
					<textarea
						id="collection-description"
						name="description"
						class="field-textarea"
						class:field-error={error?.field === 'description'}
						aria-invalid={error?.field === 'description'}
						rows="3"
						maxlength={MAX_COLLECTION_DESCRIPTION_LENGTH}
						bind:value={description}
					></textarea>
					<p class="field-hint" class:danger={error?.field === 'description'}>
						{error?.field === 'description' ? error.message : `残り ${descriptionRemaining} 文字`}
					</p>
				</div>

				<fieldset class="collection-form-visibility">
					<legend class="field-label">公開</legend>
					<label class="collection-form-option">
						<input
							type="radio"
							name="visibility"
							value="public"
							checked={isPublic}
							onchange={() => (isPublic = true)}
						>
						<span>
							<span class="collection-form-option-title">公開</span>
							<span class="collection-form-option-hint">プロフィールを見られる人に見せる</span>
						</span>
					</label>
					<label class="collection-form-option">
						<input
							type="radio"
							name="visibility"
							value="private"
							checked={!isPublic}
							onchange={() => (isPublic = false)}
						>
						<span>
							<span class="collection-form-option-title">非公開</span>
							<span class="collection-form-option-hint">自分だけが見られる</span>
						</span>
					</label>
					{#if isPublic}
						<input type="hidden" name="is_public" value="on">
					{/if}
				</fieldset>
			</div>

			<div class="collection-form-footer">
				{#if mode === 'edit' && deleteAction}
					<!-- 削除は別のフォーム（確認を通す）から送る -->
					<button
						type="button"
						class="btn btn-ghost collection-form-delete"
						disabled={submitting}
						onclick={() => deleteForm?.requestSubmit()}
					>
						削除
					</button>
				{/if}
				<span class="collection-form-spacer"></span>
				<button type="button" class="btn btn-ghost" disabled={submitting} onclick={close}>キャンセル</button>
				<button type="submit" class="btn btn-primary" disabled={submitting}>
					{submitting ? '保存中...' : mode === 'create' ? '作る' : '保存する'}
				</button>
			</div>
		</form>

		{#if mode === 'edit' && deleteAction}
			<form bind:this={deleteForm} method="POST" action={deleteAction} use:enhance={handleDelete} hidden></form>
		{/if}
	</div>
</div>

<style>
.collection-form-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(15 23 42 / 0.68);
}
.collection-form-card {
	display: flex;
	flex-direction: column;
	width: min(100%, 480px);
	max-height: calc(100dvh - 32px);
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.36);
	outline: none;
}
.collection-form-header,
.collection-form-footer {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
	padding: 12px 14px;
}
.collection-form-header {
	justify-content: space-between;
	border-bottom: 1px solid var(--color-border);
}
.collection-form-footer {
	border-top: 1px solid var(--color-border);
}
.collection-form-spacer {
	flex: 1;
}
.collection-form-heading {
	font-size: 15px;
	font-weight: 800;
}
.collection-form-close {
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 999px;
	corner-shape: round;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 20px;
	line-height: 1;
}
.collection-form-close:hover:not(:disabled) {
	background: var(--color-border);
	color: var(--color-text);
}
.collection-form {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
}
.collection-form-body {
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-height: 0;
	padding: 14px;
	overflow-y: auto;
}
.collection-form-body :global(.field) {
	margin-bottom: 0;
}
.collection-form-visibility {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	border: 0;
}
.collection-form-option {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	cursor: pointer;
}
.collection-form-option:has(input:checked) {
	border-color: var(--color-border-hover);
	background: var(--color-surface-hover);
}
.collection-form-option input {
	margin-top: 3px;
	accent-color: var(--color-accent);
}
.collection-form-option > span {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.collection-form-option-title {
	font-size: 14px;
	font-weight: 700;
}
.collection-form-option-hint {
	color: var(--color-text-muted);
	font-size: 12px;
}
.collection-form-delete {
	color: var(--color-danger);
}
</style>
