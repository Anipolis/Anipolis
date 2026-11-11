<script lang="ts">
import type { Snippet } from "svelte";
import type { Attachment } from "svelte/attachments";

/**
 * モーダルの共通部品（#600）。ネイティブの <dialog> を showModal() で開く。
 * 最前面への表示（z-index の取り合いがない）、後ろのページを触れなくすること、フォーカスを中に閉じ込めること、
 * Esc で閉じること、閉じたあと開いたボタンへフォーカスを戻すことは、ブラウザに任せる。
 *
 * 親は {#if open}<Modal onclose={() => (open = false)}>…</Modal>{/if} のように置き、中身（カードの見た目）は親が描く。
 * <dialog> は画面全体を覆う透明な入れ物で、中身の外（= <dialog> 自身）を押すと閉じる。
 * closedby="any" は ::backdrop を押したときにしか効かず、画面全体を覆うこの作りでは働かないので使わない
 */
type Props = {
	onclose: () => void;
	/** false の間は Esc と背景のクリックで閉じない（送信中など） */
	dismissible?: boolean;
	labelledby?: string;
	label?: string;
	children: Snippet;
};

let { onclose, dismissible = true, labelledby, label, children }: Props = $props();

// 外す途中で自分から close() したときの close イベントは、親へ知らせない（親はもう閉じている）
let unmounting = false;
// 中身の上で押して外で離した（文字を選んでいた）ときは閉じない
let pressedOnDialog = false;

const openModal: Attachment<HTMLDialogElement> = (dialog) => {
	dialog.showModal();
	return () => {
		unmounting = true;
		if (dialog.open) dialog.close();
	};
};

function handleCancel(event: Event) {
	if (!dismissible) event.preventDefault();
}

function handleClose() {
	if (!unmounting) onclose();
}

function handlePointerdown(event: PointerEvent) {
	pressedOnDialog = event.target === event.currentTarget;
}

function handleClick(event: MouseEvent) {
	const dialog = event.currentTarget as HTMLDialogElement;
	if (dismissible && pressedOnDialog && event.target === dialog) dialog.close();
	pressedOnDialog = false;
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: 背景のクリックはポインター専用。キーボードは Esc と中身の閉じるボタンで閉じられる -->
<dialog
	class="modal"
	aria-labelledby={labelledby}
	aria-label={label}
	oncancel={handleCancel}
	onclose={handleClose}
	onpointerdown={handlePointerdown}
	onclick={handleClick}
	{@attach openModal}
>
	{@render children()}
</dialog>

<style>
.modal {
	position: fixed;
	inset: 0;
	width: 100%;
	height: 100%;
	max-width: none;
	max-height: none;
	margin: 0;
	padding: 16px;
	border: 0;
	background: transparent;
	color: inherit;
	display: grid;
	place-items: center;
	/* 中身や背景の上で回したホイールを後ろのページへ伝えない（#599） */
	overflow: hidden;
	overscroll-behavior: contain;
	animation: modal-enter 0.2s ease-out;
}

.modal:not([open]) {
	display: none;
}

.modal::backdrop {
	background: rgb(0 0 0 / 70%);
	backdrop-filter: blur(4px);
	animation: modal-backdrop-enter 0.18s ease-out;
}

@keyframes modal-enter {
	from {
		opacity: 0;
		transform: scale(0.97);
	}
}

@keyframes modal-backdrop-enter {
	from {
		opacity: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.modal,
	.modal::backdrop {
		animation: none;
	}
}
</style>
