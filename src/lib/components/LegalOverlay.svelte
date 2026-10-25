<script lang="ts">
import { trapFocus } from "$lib/actions/trapFocus";
import LegalBody from "./LegalBody.svelte";

/**
 * ログイン画面の上に重ねて出す規約・ポリシー（shallow routing）。
 * URL は /terms などに変わるので、ブラウザの「戻る」で閉じられ、入力中の内容も残る
 */
interface Props {
	title: string;
	html: string;
	onclose: () => void;
	/** 本文の中のリンクを押したとき（規約からポリシーへのリンクなどを、重ねた表示の中で開くため） */
	onlink?: (event: MouseEvent, link: HTMLAnchorElement) => void;
}

let { title, html, onclose, onlink }: Props = $props();

// 中身が差し替わったら（規約 → ポリシーなど）先頭から読めるようにする
let body = $state<HTMLDivElement | null>(null);
$effect(() => {
	void html;
	if (body) body.scrollTop = 0;
});

function handleBodyClick(event: MouseEvent) {
	const link = (event.target as Element | null)?.closest("a");
	if (link) onlink?.(event, link);
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") onclose();
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="legal-overlay-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) onclose();
	}}
>
	<div class="legal-overlay" use:trapFocus role="dialog" aria-modal="true" aria-labelledby="legal-overlay-title">
		<div class="legal-overlay-header">
			<h2 id="legal-overlay-title">{title}</h2>
			<button type="button" class="legal-overlay-close" onclick={onclose} aria-label="閉じて入力画面に戻る">
				<span class="i-lucide-x" aria-hidden="true"></span>
			</button>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -- 本文の中のリンクのクリックを拾うだけ（キー操作はリンク自体が受ける） -->
		<div class="legal-overlay-body" bind:this={body} onclick={handleBodyClick}>
			<LegalBody {html} />
		</div>
		<div class="legal-overlay-footer">
			<button type="button" class="btn btn-primary legal-overlay-back" onclick={onclose}>入力画面に戻る</button>
		</div>
	</div>
</div>

<style>
.legal-overlay-backdrop {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: grid;
	place-items: center;
	padding: 16px;
	background: rgb(0 0 0 / 0.54);
}

.legal-overlay {
	display: flex;
	flex-direction: column;
	width: min(720px, 100%);
	max-height: min(88dvh, 900px);
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.34);
	color: var(--color-text);
}

.legal-overlay-header {
	display: flex;
	flex: none;
	align-items: center;
	gap: 12px;
	padding: 14px 16px 14px 22px;
	border-bottom: 1px solid var(--color-border);
}

.legal-overlay-header h2 {
	flex: 1;
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.legal-overlay-close {
	display: grid;
	flex: none;
	place-items: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 8px;
	background: none;
	color: var(--color-text-muted);
	cursor: pointer;
}

.legal-overlay-close:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.legal-overlay-close [class^="i-lucide"] {
	width: 20px;
	height: 20px;
}

.legal-overlay-body {
	flex: 1 1 auto;
	min-height: 0;
	padding: 18px 22px;
	overflow-y: auto;
	overscroll-behavior: contain;
}

.legal-overlay-footer {
	flex: none;
	padding: 12px 22px;
	border-top: 1px solid var(--color-border);
}

.legal-overlay-back {
	width: 100%;
	justify-content: center;
}

@media (max-width: 640px) {
	.legal-overlay-backdrop {
		padding: 0;
	}

	.legal-overlay {
		width: 100%;
		max-height: none;
		height: 100dvh;
		border: 0;
		border-radius: 0;
	}

	.legal-overlay-body,
	.legal-overlay-footer {
		padding-inline: 16px;
	}
}
</style>
