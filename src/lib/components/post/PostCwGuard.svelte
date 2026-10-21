<script lang="ts">
import type { Snippet } from "svelte";
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
</script>

{#if guarded}
	<button
		type="button"
		class="post-cw-banner"
		class:post-cw-banner--revealed={revealed}
		aria-expanded={revealed}
		aria-controls={contentId}
		onclick={(e) => { e.stopPropagation(); revealed = !revealed; }}
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
				<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
				<line x1="12" y1="9" x2="12" y2="13" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
			<span> {contentWarningSubject(post)}ネタバレを{revealed ? '展開中' : '含みます'} </span>
		</span>
		<span class="post-cw-tap">{revealed ? 'クリックで隠す △' : 'タップして表示 ▽'}</span>
	</button>
	<!-- 折り畳み中は中のリンク・ボタン・画像を操作や読み上げの対象から外す -->
	<div
		id={contentId}
		class="post-cw-content"
		class:post-cw-content--revealed={revealed}
		aria-hidden={!revealed}
		inert={!revealed}
	>
		<div class="post-cw-content-body">{@render children()}</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
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
	border-radius: var(--radius-md, 12px);
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
