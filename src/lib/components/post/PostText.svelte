<script lang="ts">
import type { Snippet } from "svelte";
import type { Post } from "$lib/types";
import { parseContentParts } from "$lib/utils/hashtag";

interface Props {
	post: Post;
	content: string;
	/** Clip long text behind a "もっと見る" toggle. */
	collapsible?: boolean;
	/** Let `trailing` flow on the same line as short text. */
	inline?: boolean;
	trailing?: Snippet;
}

let { post, content, collapsible = false, inline = false, trailing }: Props = $props();

const parts = $derived(parseContentParts(content));
const isLong = $derived(collapsible && (content.length > 300 || (content.match(/\n/g)?.length ?? 0) >= 5));
const cwContentId = $derived(`post-cw-content-${post.id}`);
let collapsed = $state(true);
let cwRevealed = $state(false);
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

<div class="post-text" class:post-text--inline={inline && !post.cw_anime && !(isLong && collapsed)}>
	{#if post.cw_anime}
		<button
			type="button"
			class="post-cw-banner"
			class:post-cw-banner--revealed={cwRevealed}
			aria-expanded={cwRevealed}
			aria-controls={cwContentId}
			onclick={(e) => { e.stopPropagation(); cwRevealed = !cwRevealed; }}
		>
			<span class="post-cw-main">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
					/>
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
				<span> 『{post.cw_anime.title}』のネタバレを{cwRevealed ? '展開中' : '含みます'} </span>
			</span>
			<span class="post-cw-tap">{cwRevealed ? 'クリックで隠す △' : 'タップして表示 ▽'}</span>
		</button>
		<div
			id={cwContentId}
			class="post-cw-content"
			class:post-cw-content--revealed={cwRevealed}
			aria-hidden={!cwRevealed}
			inert={!cwRevealed}
		>
			<div class="post-cw-content-body">{@render text()}</div>
		</div>
	{:else}
		{@render text()}
	{/if}
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

.post-cw-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	width: 100%;
	padding: 10px 12px;
	margin: 4px 0;
	border: 1px solid var(--color-warning, #f59e0b);
	background: color-mix(in srgb, var(--color-warning, #f59e0b) 8%, transparent);
	border-radius: var(--radius-md, 8px);
	cursor: pointer;
	font-size: 14px;
	text-align: center;
	color: var(--color-text);
	line-height: 1.4;
	transition:
		background 0.2s ease,
		border-color 0.2s ease;
}
.post-cw-banner:hover {
	background: color-mix(in srgb, var(--color-warning, #f59e0b) 16%, transparent);
}
.post-cw-banner--revealed {
	border-color: var(--color-border);
	background: color-mix(in srgb, var(--color-surface, #ffffff) 96%, var(--color-text-muted));
	color: var(--color-text-muted);
	border-bottom-right-radius: 4px;
	border-bottom-left-radius: 4px;
}
.post-cw-banner--revealed:hover {
	background: color-mix(in srgb, var(--color-surface, #ffffff) 92%, var(--color-text-muted));
}
.post-cw-main {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 0;
	gap: 8px;
	font-weight: 700;
}
.post-cw-banner--revealed .post-cw-main {
	font-weight: 500;
}
.post-cw-main svg {
	color: var(--color-warning, #f59e0b);
	flex-shrink: 0;
}
.post-cw-banner--revealed .post-cw-main svg {
	color: var(--color-text-muted);
}
.post-cw-tap {
	flex-shrink: 0;
	font-size: 12px;
	color: var(--color-text-muted);
}
.post-cw-content {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 0.3s ease;
}
.post-cw-content--revealed {
	grid-template-rows: 1fr;
}
.post-cw-content-body {
	min-height: 0;
	overflow: hidden;
	padding-top: 0;
	transition: padding-top 0.3s ease;
}
.post-cw-content--revealed .post-cw-content-body {
	padding-top: 8px;
}

@media (max-width: 640px) {
	.post-cw-banner {
		flex-direction: column;
		align-items: stretch;
	}
	.post-cw-tap {
		text-align: center;
	}
}
</style>
