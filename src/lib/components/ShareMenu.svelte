<script lang="ts">
import { page } from "$app/state";
import { canonicalUrl, shareText, toAbsoluteUrl, xIntentUrl } from "$lib/seo";

/**
 * 共有の入口（#271）。スマホなど端末の共有シートが使えるときはそれを開き、
 * 使えないとき（PC）は「リンクをコピー」「X でポスト」のメニューを出す。
 *
 * - url: 共有するページ。省略時は今のページ（クエリと # を除く）
 * - title: 共有文の題名（「… - Anipolis」の形にそろえる）
 * - variant: "text" は投稿の行の「削除」「通報」と同じ文字だけのボタン、"button" は枠つきのボタン
 */
let {
	url = null,
	title,
	label = "共有",
	variant = "button",
	placement = "below",
}: {
	url?: string | null;
	title: string;
	label?: string;
	variant?: "text" | "button";
	placement?: "below" | "above";
} = $props();

let open = $state(false);
let copied = $state(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const shareUrl = $derived(url ? toAbsoluteUrl(url, page.url.origin) : canonicalUrl(page.url));
const text = $derived(shareText(title));

function prefersNativeShare(): boolean {
	// PC の Chrome / Edge にも navigator.share はあるが、OS の共有画面は使いにくいので
	// 指で操作する端末だけ共有シートにする
	return (
		typeof navigator.share === "function" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(pointer: coarse)").matches
	);
}

async function handleClick() {
	if (prefersNativeShare()) {
		try {
			await navigator.share({ title: text, url: shareUrl });
			return;
		} catch (error) {
			// 共有シートを閉じただけ（AbortError）なら何もしない。それ以外はメニューで続ける
			if (error instanceof DOMException && error.name === "AbortError") return;
		}
	}
	open = !open;
}

async function copyLink() {
	try {
		await navigator.clipboard.writeText(shareUrl);
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			copied = false;
			open = false;
		}, 1200);
	} catch {
		// クリップボードが使えない環境（http や権限なし）では、選んでコピーしてもらう
		window.prompt("このリンクをコピーしてください", shareUrl);
		open = false;
	}
}

function close() {
	open = false;
}

function handleKeydown(event: KeyboardEvent) {
	if (open && event.key === "Escape") close();
}
</script>

<svelte:window onkeydown={handleKeydown} />

<span class="share-menu">
	<button
		type="button"
		class={variant === "text" ? "post-kebab-item share-menu-trigger--text" : "btn btn-secondary share-menu-trigger"}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={handleClick}
	>
		{#if variant === "button"}
			<span class="i-lucide-share-2" aria-hidden="true"></span>
		{/if}
		{label}
	</button>

	{#if open}
		<button type="button" class="share-menu-backdrop" aria-label="共有メニューを閉じる" onclick={close}></button>
		<div class="share-menu-dropdown" class:share-menu-dropdown--above={placement === "above"} role="menu">
			<button type="button" class="share-menu-item" role="menuitem" onclick={copyLink}>
				<span class={copied ? "i-lucide-check" : "i-lucide-link"} aria-hidden="true"></span>
				{copied ? "コピーしました" : "リンクをコピー"}
			</button>
			<a
				class="share-menu-item"
				role="menuitem"
				href={xIntentUrl(text, shareUrl)}
				target="_blank"
				rel="noopener noreferrer"
				onclick={close}
			>
				<span class="i-lucide-send" aria-hidden="true"></span>
				X でポスト
			</a>
		</div>
	{/if}
</span>

<style>
.share-menu {
	position: relative;
	display: inline-flex;
}

.share-menu-trigger {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.share-menu-trigger--text {
	width: auto;
	min-height: 36px;
	padding: 4px 8px;
}

.share-menu-backdrop {
	position: fixed;
	inset: 0;
	z-index: 100;
	background: transparent;
	border: none;
	cursor: default;
}

.share-menu-dropdown {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	z-index: 101;
	min-width: 180px;
	background: var(--color-bg-card);
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	overflow: hidden;
}

.share-menu-dropdown--above {
	top: auto;
	bottom: calc(100% + 6px);
}

.share-menu-item {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 11px 16px;
	background: none;
	border: none;
	color: var(--color-text);
	font-size: 14px;
	font-family: inherit;
	text-align: left;
	text-decoration: none;
	cursor: pointer;
}

.share-menu-item:hover,
.share-menu-item:focus-visible {
	background: var(--color-bg-hover);
}

.share-menu-item + .share-menu-item {
	border-top: 1px solid var(--color-border);
}
</style>
