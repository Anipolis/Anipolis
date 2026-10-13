<script lang="ts">
import type { Snippet } from "svelte";
import { parseContentParts } from "$lib/utils/hashtag";

interface Props {
	content: string;
	/** Clip long text behind a "もっと見る" toggle. */
	collapsible?: boolean;
	/** Let `trailing` flow on the same line as short text. */
	inline?: boolean;
	trailing?: Snippet;
}

let { content, collapsible = false, inline = false, trailing }: Props = $props();

const parts = $derived(parseContentParts(content));
const isLong = $derived(collapsible && (content.length > 300 || (content.match(/\n/g)?.length ?? 0) >= 5));
let collapsed = $state(true);
</script>

{#snippet text()}
	<div class="post-content-inner" class:post-content-clipped={isLong && collapsed}>
		<p class="post-content">
			{#each parts as part}
				{#if part.type === 'hashtag'}
					<a href="/hashtag/{part.value}" class="hashtag">#{part.value}</a>
				{:else if part.type === 'mention'}
					<a href="/profile/{part.value}" class="mention">@{part.value}</a>
				{:else}
					{part.value}
				{/if}
			{/each}
		</p>
	</div>
	{#if isLong}
		<button
			type="button"
			class="post-content-toggle"
			onclick={(e) => { e.stopPropagation(); collapsed = !collapsed; }}
		>
			{collapsed ? 'もっと見る' : '閉じる'}
		</button>
	{/if}
{/snippet}

<!-- CW（ネタバレ注意）の折り畳みは、本文と添付をまとめて包む PostCwGuard が受け持つ（#318） -->
<div class="post-text" class:post-text--inline={inline && !(isLong && collapsed)}>
	{@render text()}
	{@render trailing?.()}
</div>

<style>
.post-content-inner {
	position: relative;
}

.post-content-clipped {
	max-height: 200px;
	overflow: hidden;
}

.post-content-clipped::after {
	content: "";
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 80px;
	background: linear-gradient(to bottom, transparent, var(--color-bg-card));
	pointer-events: none;
}

.post-content-toggle {
	display: block;
	padding: 4px 0 0;
	color: var(--color-accent);
	font-size: 13px;
	font-weight: 700;
	background: none;
	border: none;
	cursor: pointer;
	text-align: left;
}

.post-content-toggle:hover {
	text-decoration: underline;
}

.post-text--inline .post-content-inner,
.post-text--inline .post-content {
	display: inline;
}
</style>
