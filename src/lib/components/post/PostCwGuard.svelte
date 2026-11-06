<script lang="ts">
import { type Snippet, tick } from "svelte";
import { contentWarningSubject, hasContentWarning } from "$lib/content-warning";
import type { Post } from "$lib/types";

interface Props {
	post: Pick<Post, "id" | "cw_anime_id" | "cw_anime">;
	/** CW 中は本文・画像・引用・トレード結果をまとめて隠す（#318） */
	children: Snippet;
}

let { post, children }: Props = $props();

const guarded = $derived(hasContentWarning(post));
const contentId = $derived(`post-cw-content-${post.id}`);
let revealed = $state(false);
let body = $state<HTMLDivElement>();

async function reveal(e: MouseEvent) {
	e.stopPropagation();
	revealed = true;
	// 押したボタンが消えるので、キーボードの位置を開いた中身へ移す
	await tick();
	body?.focus({ preventScroll: true });
}
</script>

{#if guarded}
	<!-- 押すと文字ごと消えて中身が開く。隠し直す操作は置かない -->
	{#if !revealed}
		<button type="button" class="post-cw-banner" aria-expanded="false" aria-controls={contentId} onclick={reveal}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
				<line x1="12" y1="9" x2="12" y2="13" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
			<span class="post-cw-label">{contentWarningSubject(post)}ネタバレを表示</span>
		</button>
	{/if}
	<!-- 折り畳み中は中のリンク・ボタン・画像を操作や読み上げの対象から外す -->
	<div
		id={contentId}
		class="post-cw-content"
		class:post-cw-content--revealed={revealed}
		aria-hidden={!revealed}
		inert={!revealed}
	>
		<div class="post-cw-content-body" tabindex="-1" bind:this={body}>{@render children()}</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
.post-cw-banner {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 36px;
	padding: 4px 0;
	border: 0;
	background: none;
	cursor: pointer;
	font-size: 14px;
	text-align: left;
	color: var(--color-text-muted);
	line-height: 1.4;
}
.post-cw-banner svg {
	color: var(--color-warning, #f59e0b);
	flex-shrink: 0;
}
.post-cw-banner:hover .post-cw-label,
.post-cw-banner:focus-visible .post-cw-label {
	color: var(--color-text);
	text-decoration: underline;
	text-underline-offset: 3px;
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
}
.post-cw-content-body:focus {
	outline: none;
}
</style>
