<script lang="ts">
import { trapFocus } from "$lib/actions/trapFocus";

/**
 * 「マイリストから外す」の確認のポップアップ。スコアやメモごと消えて元に戻せないので、1回押しただけでは外さない。
 * 外すボタンは親のフォームの送信ボタンなので、親のフォームの中に置く。親は送信時に data-remove で外す操作と見分ける。
 * 入力欄があるフォームでは、入力欄の Enter で押されないよう、ほかの送信ボタンより後ろに置く。
 * Esc は親が受けて oncancel と同じことをする
 */
type Props = {
	animeTitle: string;
	removeAction: string;
	submitting: boolean;
	oncancel: () => void;
};

let { animeTitle, removeAction, submitting, oncancel }: Props = $props();
</script>

<div class="confirm-layer">
	<button
		type="button"
		class="confirm-backdrop"
		aria-label="確認を閉じる"
		disabled={submitting}
		onclick={oncancel}
	></button>
	<div
		class="confirm-dialog"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="mylist-remove-title"
		aria-describedby="mylist-remove-description"
		use:trapFocus
	>
		<h3 id="mylist-remove-title">マイリストから外しますか？</h3>
		<p id="mylist-remove-description">
			「{animeTitle}」のスコア、話数、日付、メモの記録も消えます。元に戻せません。
		</p>
		<div class="confirm-actions">
			<button type="button" class="confirm-cancel" disabled={submitting} onclick={oncancel}>キャンセル</button>
			<button type="submit" formaction={removeAction} class="confirm-remove" data-remove disabled={submitting}>
				{submitting ? "外しています…" : "外す"}
			</button>
		</div>
	</div>
</div>

<style>
.confirm-layer {
	position: fixed;
	z-index: 10;
	inset: 0;
	display: grid;
	place-items: center;
	padding: 20px;
}

.confirm-backdrop {
	position: absolute;
	inset: 0;
	padding: 0;
	border: 0;
	background: color-mix(in srgb, var(--color-bg) 65%, transparent);
	cursor: default;
}

.confirm-dialog {
	position: relative;
	width: min(100%, 360px);
	padding: 22px;
	border: 1px solid var(--color-border-hover);
	border-radius: 16px;
	background: var(--color-surface);
	text-align: center;
}

.confirm-dialog h3 {
	margin: 0;
	color: var(--color-text);
	font-size: 1rem;
}

.confirm-dialog p {
	margin: 10px 0 18px;
	color: var(--color-text-muted);
	font-size: 0.84rem;
	line-height: 1.6;
	overflow-wrap: anywhere;
}

.confirm-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.confirm-cancel,
.confirm-remove {
	min-height: 40px;
	border-radius: var(--radius-sm);
	cursor: pointer;
	font-size: 0.86rem;
	font-weight: 600;
}

.confirm-cancel {
	border: 1.5px solid var(--color-border-hover);
	background: transparent;
	color: var(--color-text);
}

.confirm-cancel:hover:not(:disabled) {
	background: var(--color-surface-hover);
}

.confirm-remove {
	border: 1px solid var(--color-danger);
	background: var(--color-danger);
	color: var(--color-bg);
}

.confirm-remove:hover:not(:disabled) {
	filter: brightness(1.08);
}

.confirm-cancel:disabled,
.confirm-remove:disabled {
	cursor: wait;
	opacity: 0.6;
}
</style>
