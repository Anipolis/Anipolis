<script lang="ts">
import type { Snippet } from "svelte";
import type { AnimeExchangeShareAnime } from "$lib/types";
import ExchangeSubjectiveTags from "./ExchangeSubjectiveTags.svelte";

interface Props {
	anime?: AnimeExchangeShareAnime | null;
	caption?: string;
	comment?: string | null;
	subjectiveTags?: readonly string[] | null;
	placeholder?: boolean;
	link?: boolean;
	highlight?: boolean;
	badge?: string;
	variant?: "full" | "summary" | "poster-only";
	children?: Snippet;
}

let {
	anime = null,
	caption,
	comment = null,
	subjectiveTags = [],
	placeholder = false,
	link = true,
	highlight = false,
	badge,
	variant = "full",
	children,
}: Props = $props();

const asLink = $derived(link && !placeholder && Boolean(anime));
const summary = $derived(variant === "summary");
const posterOnly = $derived(variant === "poster-only");
</script>

<div class="eac" class:eac--highlight={highlight} class:eac--summary={summary} class:eac--poster-only={posterOnly}>
	<svelte:element
		this={asLink ? "a" : "div"}
		href={asLink && anime ? `/anime/${anime.id}` : undefined}
		aria-label={posterOnly && anime ? anime.title : undefined}
		class="eac-main"
		class:eac-main--link={asLink}
	>
		{#if caption && !summary && !posterOnly}
			<span class="eac-caption">{caption}</span>
		{/if}

		<div class="eac-cover" class:eac-cover--mystery={placeholder}>
			{#if badge && !placeholder}
				<span class="eac-badge">{badge}</span>
			{/if}
			{#if placeholder}
				<span class="eac-mystery" aria-hidden="true">？</span>
			{:else if anime?.cover_url}
				<img src={anime.cover_url} alt={anime.title} loading="lazy" decoding="async">
			{:else}
				<div class="eac-cover-empty"></div>
			{/if}
			{#if posterOnly && anime}
				<span class="eac-poster-title">{anime.title}</span>
			{/if}
		</div>

		{#if !posterOnly}
			<div class="eac-body">
				{#if placeholder}
					<strong class="eac-title eac-title--muted">マッチング待ち</strong>
					{#if !summary}
						<span class="eac-subtitle eac-subtitle--empty">&nbsp;</span>
						<p class="eac-comment eac-comment--empty">&nbsp;</p>
					{/if}
				{:else if anime}
					<strong class="eac-title">{anime.title}</strong>
					{#if !summary}
						<span class="eac-subtitle" class:eac-subtitle--empty={!anime.title_en}>
							{anime.title_en ?? " "}
						</span>
						<p class="eac-comment" class:eac-comment--empty={!comment}>
							{comment ? `“${comment}”` : " "}
						</p>
						<ExchangeSubjectiveTags tags={subjectiveTags} compact />
					{/if}
				{/if}
			</div>
		{/if}
	</svelte:element>

	{#if children}
		<div class="eac-actions">
			{@render children()}
		</div>
	{/if}
</div>

<style>
.eac {
	--eac-card-padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	width: 100%;
	max-width: calc(200px + (var(--eac-card-padding) * 2));
	height: 100%;
	box-sizing: border-box;
	margin-inline: auto;
	padding: var(--eac-card-padding);
	border: 1px solid rgba(255, 255, 255, 0.16);
	border-radius: 8px;
	background: rgba(18, 24, 38, 0.54);
	color: var(--color-text);
	text-decoration: none;
	backdrop-filter: blur(14px);
}

.eac-main {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: inherit;
	text-decoration: none;
}

.eac-main--link {
	transition: transform 0.18s ease;
}

.eac-main--link:hover {
	transform: translateY(-3px);
	text-decoration: none;
}

.eac-caption {
	color: var(--color-text-muted);
	font-size: 0.74rem;
	font-weight: 800;
	line-height: 1.2;
}

.eac-cover {
	position: relative;
	width: 100%;
	aspect-ratio: 1 / 1.414;
	overflow: hidden;
	border-radius: 8px;
	background: var(--color-border);
	box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26);
}

.eac--highlight .eac-cover {
	outline: 2px solid color-mix(in srgb, var(--color-accent) 72%, transparent);
	outline-offset: -2px;
}

.eac--summary {
	--eac-card-padding: 8px;
	max-width: 160px;
	gap: 7px;
}

.eac--summary .eac-main {
	gap: 7px;
}

.eac--summary .eac-cover {
	border-radius: 6px;
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
}

.eac--poster-only {
	--eac-card-padding: 0;
	max-width: 148px;
	border-color: transparent;
	background: transparent;
	box-shadow: none;
	backdrop-filter: none;
}

.eac--poster-only .eac-main {
	gap: 0;
}

.eac--poster-only .eac-cover {
	border-radius: 8px;
	box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
	transition:
		filter 0.18s ease,
		transform 0.18s ease,
		box-shadow 0.18s ease;
}

.eac--poster-only .eac-main:hover,
.eac--poster-only .eac-main:focus-visible {
	transform: translateY(-2px);
}

.eac--poster-only .eac-main:hover .eac-cover,
.eac--poster-only .eac-main:focus-visible .eac-cover {
	filter: brightness(1.05);
	box-shadow: 0 14px 30px rgba(0, 0, 0, 0.34);
}

.eac-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	image-rendering: auto;
}

.eac-cover-empty {
	width: 100%;
	height: 100%;
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent), var(--color-border);
}

.eac-poster-title {
	position: absolute;
	inset-inline: 0;
	bottom: 0;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	overflow: hidden;
	padding: 18px 7px 7px;
	background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.78));
	color: #fff;
	font-size: 0.72rem;
	font-weight: 800;
	line-height: 1.25;
	opacity: 0;
	transform: translateY(4px);
	transition:
		opacity 0.18s ease,
		transform 0.18s ease;
}

.eac--poster-only .eac-main:hover .eac-poster-title,
.eac--poster-only .eac-main:focus-visible .eac-poster-title,
:global(.exchange-share-inline:focus-visible) .eac--poster-only .eac-poster-title {
	opacity: 1;
	transform: translateY(0);
}

.eac-cover--mystery {
	display: grid;
	place-items: center;
	background: var(--color-surface-hover);
	border: 1px dashed var(--color-border);
	box-shadow: none;
}

.eac-mystery {
	font-size: 3rem;
	font-weight: 900;
	color: var(--color-text-muted);
	opacity: 0.7;
}

.eac-badge {
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 2;
	padding: 4px 8px;
	border-radius: 999px;
	background: linear-gradient(135deg, #fef08a, #34d399 65%, #60a5fa);
	color: #08111f;
	font-size: 0.72rem;
	font-weight: 900;
	box-shadow: 0 0 18px rgba(52, 211, 153, 0.6);
}

.eac-title {
	font-size: 0.95rem;
	line-height: 1.35;
	font-weight: 700;
	color: var(--color-text);
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	overflow: hidden;
}

.eac-title--muted {
	color: var(--color-text-muted);
	font-weight: 800;
}

.eac--summary .eac-title {
	min-height: 2.7em;
	font-size: 0.82rem;
	font-weight: 800;
}

.eac-body {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.eac-subtitle {
	font-size: 0.78rem;
	color: var(--color-text-muted);
	line-height: 1.3;
	min-height: 1.3em;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
	line-clamp: 1;
	overflow: hidden;
}

.eac-comment {
	margin: 6px 0 0;
	padding-top: 6px;
	border-top: 1px solid var(--color-border);
	font-size: 0.78rem;
	font-style: italic;
	color: var(--color-text-secondary, var(--color-text));
	line-height: 1.45;
	min-height: calc(1.45em * 2 + 6px);
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	overflow: hidden;
}

/* keep slot height when empty, but hide the divider */
.eac-comment--empty {
	border-top-color: transparent;
}

.eac-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: auto;
	padding-top: 8px;
}

:global([data-theme="light"]) .eac {
	border-color: rgba(124, 58, 237, 0.14);
	background: rgba(255, 255, 255, 0.78);
	box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}

:global([data-theme="light"]) .eac--poster-only {
	border-color: transparent;
	background: transparent;
	box-shadow: none;
}
</style>
