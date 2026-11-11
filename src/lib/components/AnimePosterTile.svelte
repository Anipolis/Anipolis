<script lang="ts">
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";

/**
 * 作品の画像だけのタイル。題名はマウスを乗せるかキーボードで選ぶと出す（マウスの無い端末とスマホでは常に出す）。
 * カバーを出さない作品は、同じ大きさの枠に題名を文字で出す
 */
let {
	href,
	title,
	coverUrl,
	note,
	rank,
}: {
	href: string;
	title: string;
	coverUrl: string | null;
	/** 題名の下に小さく添える文字（件数や関係など） */
	note?: string | undefined;
	/** 画像の左上に重ねる順位 */
	rank?: number | undefined;
} = $props();

const label = $derived([rank != null && `${rank}位`, title, note].filter(Boolean).join(" "));
</script>

<a {href} class="poster-tile" class:poster-tile--no-cover={!coverUrl} aria-label={label}>
	{#if coverUrl}
		<img src={coverThumbSrc(coverUrl)} {@attach coverThumbFallback(coverUrl)} alt="" loading="lazy">
	{/if}
	{#if rank != null}
		<span class="poster-rank">{rank}</span>
	{/if}
	<span class="poster-caption">
		<span class="poster-title">{title}</span>
		{#if note}
			<span class="poster-note">{note}</span>
		{/if}
	</span>
</a>

<style>
.poster-tile {
	position: relative;
	display: block;
	height: 100%;
	overflow: hidden;
	aspect-ratio: 400 / 566;
	border-radius: var(--radius-xs);
	background: var(--color-surface-hover);
	color: #fff;
	text-decoration: none;
}

.poster-tile:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}

.poster-tile img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.poster-rank {
	position: absolute;
	top: 4px;
	left: 4px;
	min-width: 20px;
	padding: 2px 5px;
	border-radius: var(--radius-xs);
	background: rgb(0 0 0 / 0.72);
	color: #fff;
	font-size: 0.72rem;
	font-weight: 800;
	line-height: 16px;
	text-align: center;
}

.poster-caption {
	position: absolute;
	inset-inline: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 18px 7px 7px;
	background: linear-gradient(180deg, transparent, rgb(0 0 0 / 0.78));
	font-size: 0.72rem;
	line-height: 1.25;
	opacity: 0;
	transition: opacity 0.18s ease;
}

.poster-tile:hover .poster-caption,
.poster-tile:focus-visible .poster-caption {
	opacity: 1;
}

.poster-title {
	display: -webkit-box;
	overflow: hidden;
	font-weight: 800;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.poster-note {
	font-size: 0.68rem;
	opacity: 0.85;
}

.poster-tile--no-cover {
	color: var(--color-text);
}

.poster-tile--no-cover .poster-caption {
	background: none;
	opacity: 1;
}

@media (hover: none), (max-width: 768px) {
	.poster-caption {
		opacity: 1;
	}
}
</style>
