<script lang="ts">
import type { Snippet } from "svelte";
import { page } from "$app/state";

interface Props {
	title: string;
	/** docs/*.md を marked で変換した、当方が管理する HTML */
	html?: string;
	/** HTML の代わりに Svelte で書く本文（お問い合わせページなど） */
	children?: Snippet;
}

let { title, html, children }: Props = $props();

// 設定メニューはログイン必須なので、未ログインの閲覧者には戻り先として出さない
const showSettingsLink = $derived(Boolean(page.data.user));
</script>

<svelte:head><title>{title} - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 720px; min-width: 0;">
		<div class="settings-card legal-document">
			{#if showSettingsLink}
				<a href="/settings?section=about" class="btn btn-ghost back-link" aria-label="設定メニューへ戻る">
					<span class="i-lucide-arrow-left" aria-hidden="true"></span>
					設定へ戻る
				</a>
			{/if}

			{#if children}
				{@render children()}
			{:else if html}
				{@html html}
			{/if}
		</div>
	</main>
</div>

<style>
.back-link {
	margin-bottom: 16px;
}

.legal-document :global(h1) {
	font-size: 20px;
	font-weight: 700;
	margin-bottom: 24px;
}

.legal-document :global(h2) {
	font-size: 1.15rem;
	font-weight: 700;
	margin: 32px 0 12px;
}

.legal-document :global(h3) {
	font-size: 1rem;
	font-weight: 700;
	margin: 20px 0 8px;
}

.legal-document :global(p),
.legal-document :global(ul),
.legal-document :global(ol) {
	margin: 0 0 12px;
	line-height: 1.7;
}

.legal-document :global(ul),
.legal-document :global(ol) {
	padding-left: 1.4em;
}

.legal-document :global(li) {
	margin-bottom: 4px;
}

.legal-document :global(a) {
	color: var(--color-accent);
}

.legal-document :global(table) {
	width: 100%;
	border-collapse: collapse;
	margin: 0 0 16px;
	font-size: 0.92rem;
}

.legal-document :global(th),
.legal-document :global(td) {
	border: 1px solid var(--color-border);
	padding: 8px 12px;
	text-align: left;
	vertical-align: top;
}

.legal-document :global(th) {
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
	white-space: nowrap;
}
</style>
