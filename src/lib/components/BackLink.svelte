<script lang="ts">
import type { Snippet } from "svelte";
import { canGoBackInApp } from "$lib/back-navigation";

/**
 * 直前のページへ戻るリンク。直前がサイトの外なら fallbackHref（そのページの親）へ移動する。
 * 入口が一つのページでは使わず、行き先を書いた普通のリンクにする（$lib/back-navigation のルール）
 */
let {
	fallbackHref,
	class: className = "",
	children,
}: { fallbackHref: string; class?: string; children?: Snippet } = $props();

function handleClick(event: MouseEvent) {
	// 新しいタブで開く操作はリンクのまま
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	if (!canGoBackInApp()) return;
	event.preventDefault();
	history.back();
}
</script>

<a href={fallbackHref} class={className} aria-label="前の画面に戻る" onclick={handleClick}>
	{#if children}
		{@render children()}
	{:else}
		<span class="i-lucide-arrow-left" aria-hidden="true"></span>
		<span>戻る</span>
	{/if}
</a>
