<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { applyAction, enhance } from "$app/forms";
import { trapFocus } from "$lib/actions/trapFocus";
import {
	COLLECTION_KINDS,
	type CollectionKind,
	DEFAULT_COLLECTION_TIERS,
	MAX_COLLECTION_DESCRIPTION_LENGTH,
	MAX_COLLECTION_TIER_LABEL_LENGTH,
	MAX_COLLECTION_TIERS,
	MAX_COLLECTION_TITLE_LENGTH,
} from "$lib/collections";

/**
 * コレクションを作る・題名などを直す画面（#515）。送り先はページのフォームアクション。
 * 作るときは、できたコレクションのページへ移る（アクションの redirect）
 */
interface Props {
	mode: "create" | "edit";
	action: string;
	initial?: {
		title: string;
		description: string | null;
		is_public: boolean;
		kind: CollectionKind;
		tiers: string[];
	};
	/** 直す画面だけ: 削除のフォームアクション */
	deleteAction?: string;
	onclose: () => void;
}

let { mode, action, initial, deleteAction, onclose }: Props = $props();

let title = $state(untrack(() => initial?.title ?? ""));
let description = $state(untrack(() => initial?.description ?? ""));
// 作るときは非公開から始める（YouTube の再生リストと同じ。見せたいものだけ公開にしてリンクを渡す）
let isPublic = $state(untrack(() => initial?.is_public ?? false));
let kind = $state<CollectionKind>(untrack(() => initial?.kind ?? "list"));
// ティア表の段の名前（上から）。種類を変えても入力は残しておく
let tiers = $state<string[]>(untrack(() => [...(initial?.tiers ?? DEFAULT_COLLECTION_TIERS)]));
let submitting = $state(false);
let error = $state<{ field?: "title" | "description" | "tiers"; message: string } | null>(null);
let titleInput = $state<HTMLInputElement | null>(null);
let deleteForm = $state<HTMLFormElement | null>(null);

// 直すときは、何か変えるまで「保存する」を押せない。作るときは対象にしない（ux-guidelines「色と強調」）
const changed = $derived(
	mode === "create" ||
		title !== (initial?.title ?? "") ||
		description !== (initial?.description ?? "") ||
		isPublic !== (initial?.is_public ?? false) ||
		kind !== (initial?.kind ?? "list") ||
		(kind === "tier" && JSON.stringify(tiers) !== JSON.stringify(initial?.tiers ?? DEFAULT_COLLECTION_TIERS)),
);

function addTier() {
	if (tiers.length < MAX_COLLECTION_TIERS) tiers = [...tiers, ""];
}

function removeTier(index: number) {
	if (tiers.length > 1) tiers = tiers.filter((_, i) => i !== index);
}
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
			const data = (result.data ?? {}) as { field?: "title" | "description" | "tiers"; message?: string };
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

				<fieldset class="collection-form-kind">
					<legend class="field-label">種類</legend>
					<div class="collection-form-kinds">
						{#each COLLECTION_KINDS as option (option.value)}
							<label class="collection-form-kind-option">
								<input type="radio" name="kind" value={option.value} bind:group={kind}>
								<span>{option.label}</span>
							</label>
						{/each}
					</div>
					<p class="field-hint">
						{kind === 'ranking'
							? '並べた順に順位を付けます'
							: kind === 'tier'
								? '作品を段に分けます。段の名前は下で変えられます'
								: '作品を好きな順に並べます'}
					</p>
				</fieldset>

				{#if kind === 'tier'}
					<fieldset class="collection-form-tiers">
						<legend class="field-label">段</legend>
						<ol class="collection-form-tier-list">
							{#each tiers as _label, index (index)}
								<li class="collection-form-tier">
									<input
										name="tier"
										type="text"
										class="field-input"
										class:field-error={error?.field === 'tiers' && !tiers[index]?.trim()}
										aria-label="{index + 1}段目の名前"
										maxlength={MAX_COLLECTION_TIER_LABEL_LENGTH}
										autocomplete="off"
										bind:value={tiers[index]}
										oninput={() => {
											if (error?.field === 'tiers') error = null;
										}}
									>
									<button
										type="button"
										class="collection-form-tier-remove"
										aria-label="{index + 1}段目を消す"
										disabled={tiers.length <= 1}
										onclick={() => removeTier(index)}
									>
										<span class="i-lucide-x" aria-hidden="true"></span>
									</button>
								</li>
							{/each}
						</ol>
						{#if tiers.length < MAX_COLLECTION_TIERS}
							<button type="button" class="btn btn-ghost collection-form-tier-add" onclick={addTier}>
								<span class="i-lucide-plus" aria-hidden="true"></span>
								段を足す
							</button>
						{/if}
						{#if error?.field === 'tiers'}
							<p class="field-error-msg" role="alert">{error.message}</p>
						{/if}
					</fieldset>
				{/if}

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
							<span class="collection-form-option-hint"
								>リンクを知っている人が見られる（鍵アカウントはフォロワーだけ）</span
							>
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
				<button
					type="submit"
					class="btn {changed ? 'btn-primary' : 'btn-secondary'}"
					disabled={submitting || !changed}
				>
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
.collection-form-kind,
.collection-form-tiers {
	margin: 0;
	padding: 0;
	border: 0;
}
.collection-form-kinds {
	display: flex;
	gap: 8px;
}
.collection-form-kind-option {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	cursor: pointer;
	font-size: 14px;
}
.collection-form-kind-option:has(input:checked) {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	font-weight: 700;
}
.collection-form-kind-option input {
	margin: 0;
}
.collection-form-tier-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0 0 6px;
	padding: 0;
	list-style: none;
}
.collection-form-tier {
	display: flex;
	align-items: center;
	gap: 6px;
}
.collection-form-tier .field-input {
	flex: 1;
}
.collection-form-tier-remove {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	flex-shrink: 0;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
}
.collection-form-tier-remove:hover:not(:disabled) {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.collection-form-tier-remove:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}
.collection-form-tier-add {
	font-size: 13px;
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
