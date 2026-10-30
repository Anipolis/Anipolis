<script lang="ts">
import type { Snippet } from "svelte";

/**
 * 規約・ポリシーなどの本文。ページ（LegalDocument）と、ログイン画面の上に重ねる表示（LegalOverlay）で共用する
 */
interface Props {
	/** docs/*.md を marked で変換した、当方が管理する HTML */
	html?: string | undefined;
	/** HTML の代わりに Svelte で書く本文（お問い合わせページなど） */
	children?: Snippet | undefined;
}

let { html, children }: Props = $props();
</script>

<div class="legal-body">
	{#if children}
		{@render children()}
	{:else if html}
		{@html html}
	{/if}
</div>

<style>
.legal-body :global(h1) {
	font-size: 20px;
	font-weight: 700;
	margin-bottom: 24px;
}

.legal-body :global(h2) {
	font-size: 1.15rem;
	font-weight: 700;
	margin: 32px 0 12px;
}

.legal-body :global(h3) {
	font-size: 1rem;
	font-weight: 700;
	margin: 20px 0 8px;
}

.legal-body :global(p),
.legal-body :global(ul),
.legal-body :global(ol) {
	margin: 0 0 12px;
	line-height: 1.7;
}

.legal-body :global(ul),
.legal-body :global(ol) {
	padding-left: 1.4em;
}

.legal-body :global(li) {
	margin-bottom: 4px;
}

.legal-body :global(a) {
	color: var(--color-accent);
}

.legal-body :global(table) {
	width: 100%;
	border-collapse: collapse;
	margin: 0 0 16px;
	font-size: 0.92rem;
}

.legal-body :global(th),
.legal-body :global(td) {
	border: 1px solid var(--color-border);
	padding: 8px 12px;
	text-align: left;
	vertical-align: top;
}

.legal-body :global(th) {
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
	white-space: nowrap;
}
</style>
