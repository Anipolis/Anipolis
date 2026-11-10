<script lang="ts">
import type { Snippet } from "svelte";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";

/**
 * 作品を探して選ぶ場所（コレクション・引用・ネタバレ・トレード・ルーム選びなど）で使う、作品の1行。
 * カバーと文字の大きさはどこでもそろえ、幅は置く側に任せる。
 * href があればリンク、onclick があればボタン、どちらも無ければただの行になる
 */
let {
	coverUrl,
	title,
	meta = "",
	href,
	onclick,
	disabled = false,
	leading,
	trailing,
}: {
	coverUrl: string | null | undefined;
	title: string;
	meta?: string | undefined;
	href?: string | undefined;
	onclick?: (() => void) | undefined;
	disabled?: boolean;
	/** カバーの左（並び順の番号など） */
	leading?: Snippet;
	/** 文字の右（「追加」や並べ替えのボタンなど） */
	trailing?: Snippet;
} = $props();
</script>

{#snippet body()}
	{@render leading?.()}
	<span class="anime-row-cover">
		{#if coverUrl}
			<img src={coverThumbSrc(coverUrl)} {@attach coverThumbFallback(coverUrl)} alt="" loading="lazy">
		{:else}
			<span class="anime-row-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
		{/if}
	</span>
	<span class="anime-row-text">
		<span class="anime-row-title">{title}</span>
		{#if meta}
			<span class="anime-row-meta">{meta}</span>
		{/if}
	</span>
	{@render trailing?.()}
{/snippet}

{#if href}
	<a {href} class="anime-row anime-row--action" onclick={() => onclick?.()}>{@render body()}</a>
{:else if onclick}
	<button type="button" class="anime-row anime-row--action" {disabled} onclick={() => onclick?.()}>
		{@render body()}
	</button>
{:else}
	<div class="anime-row">{@render body()}</div>
{/if}

<style>
.anime-row {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	min-width: 0;
	padding: 6px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--color-text);
	font: inherit;
	text-align: left;
	text-decoration: none;
}
.anime-row--action {
	cursor: pointer;
}
.anime-row--action:hover:not(:disabled),
.anime-row--action:focus-visible {
	background: var(--color-surface-hover);
}
.anime-row--action:disabled {
	cursor: default;
	opacity: 0.6;
}
.anime-row-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 44px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 4px;
	background: var(--color-border);
}
.anime-row-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.anime-row-cover-empty {
	width: 16px;
	height: 16px;
	color: var(--color-text-muted);
}
.anime-row-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.anime-row-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 14px;
	font-weight: 600;
	line-height: 1.4;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.anime-row-meta {
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
