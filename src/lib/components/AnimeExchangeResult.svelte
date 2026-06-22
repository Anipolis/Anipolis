<script lang="ts">
import type { Snippet } from "svelte";
import type { AnimeExchangeShareAnime } from "$lib/types";

interface Props {
	offeredAnime: AnimeExchangeShareAnime;
	receivedAnime: AnimeExchangeShareAnime;
	offeredComment?: string | null;
	receivedComment?: string | null;
	mode?: "full" | "timeline";
	linkCards?: boolean;
	actions?: Snippet;
}

let {
	offeredAnime,
	receivedAnime,
	offeredComment = null,
	receivedComment = null,
	mode = "full",
	linkCards = true,
	actions,
}: Props = $props();

function animeHref(animeId: string) {
	return `/anime/${animeId}`;
}
</script>

<div class="anime-exchange-result" class:anime-exchange-result--timeline={mode === "timeline"}>
	<div class="exchange-result-grid">
		{#if linkCards}
			<a href={animeHref(offeredAnime.id)} class="exchange-result-card exchange-result-card--offered">
				<div class="exchange-result-cover-wrap">
					{#if offeredAnime.cover_url}
						<img
							src={offeredAnime.cover_url}
							alt={offeredAnime.title}
							class="exchange-result-cover"
							width="74"
							height="111"
							loading="lazy"
							decoding="async"
						>
					{:else}
						<div class="exchange-result-cover exchange-result-cover--empty"></div>
					{/if}
				</div>
				<div class="exchange-result-copy">
					<span>自分が贈ったアニメ</span>
					<strong>{offeredAnime.title}</strong>
					{#if offeredAnime.title_en}
						<small>{offeredAnime.title_en}</small>
					{/if}
					{#if offeredComment}
						<p class="exchange-result-comment">{offeredComment}</p>
					{/if}
				</div>
			</a>
		{:else}
			<div class="exchange-result-card exchange-result-card--offered">
				<div class="exchange-result-cover-wrap">
					{#if offeredAnime.cover_url}
						<img
							src={offeredAnime.cover_url}
							alt={offeredAnime.title}
							class="exchange-result-cover"
							width="74"
							height="111"
							loading="lazy"
							decoding="async"
						>
					{:else}
						<div class="exchange-result-cover exchange-result-cover--empty"></div>
					{/if}
				</div>
				<div class="exchange-result-copy">
					<span>自分が贈ったアニメ</span>
					<strong>{offeredAnime.title}</strong>
					{#if offeredAnime.title_en}
						<small>{offeredAnime.title_en}</small>
					{/if}
					{#if offeredComment}
						<p class="exchange-result-comment">{offeredComment}</p>
					{/if}
				</div>
			</div>
		{/if}

		<div class="exchange-swap-icon" aria-hidden="true"><span>→</span></div>

		{#if linkCards}
			<a href={animeHref(receivedAnime.id)} class="exchange-result-card exchange-result-card--received">
				<span class="exchange-new-badge">New!</span>
				<div class="exchange-result-cover-wrap">
					{#if receivedAnime.cover_url}
						<img
							src={receivedAnime.cover_url}
							alt={receivedAnime.title}
							class="exchange-result-cover"
							width="74"
							height="111"
							loading="lazy"
							decoding="async"
						>
					{:else}
						<div class="exchange-result-cover exchange-result-cover--empty"></div>
					{/if}
				</div>
				<div class="exchange-result-copy">
					<span>受け取ったアニメ</span>
					<strong>{receivedAnime.title}</strong>
					{#if receivedAnime.title_en}
						<small>{receivedAnime.title_en}</small>
					{/if}
					{#if receivedComment}
						<p class="exchange-result-comment">{receivedComment}</p>
					{/if}
				</div>
			</a>
		{:else}
			<div class="exchange-result-card exchange-result-card--received">
				<span class="exchange-new-badge">New!</span>
				<div class="exchange-result-cover-wrap">
					{#if receivedAnime.cover_url}
						<img
							src={receivedAnime.cover_url}
							alt={receivedAnime.title}
							class="exchange-result-cover"
							width="74"
							height="111"
							loading="lazy"
							decoding="async"
						>
					{:else}
						<div class="exchange-result-cover exchange-result-cover--empty"></div>
					{/if}
				</div>
				<div class="exchange-result-copy">
					<span>受け取ったアニメ</span>
					<strong>{receivedAnime.title}</strong>
					{#if receivedAnime.title_en}
						<small>{receivedAnime.title_en}</small>
					{/if}
					{#if receivedComment}
						<p class="exchange-result-comment">{receivedComment}</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	{#if actions}
		<div class="exchange-result-actions">{@render actions()}</div>
	{/if}
</div>

<style>
.anime-exchange-result {
	position: relative;
	padding: 18px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	border-radius: 8px;
	background:
		radial-gradient(circle at 82% 18%, rgba(52, 211, 153, 0.2), transparent 30%),
		linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
	backdrop-filter: blur(18px);
	box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
	overflow: hidden;
}

.exchange-result-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 54px minmax(0, 1fr);
	align-items: stretch;
	gap: 12px;
}

.exchange-result-card {
	position: relative;
	display: grid;
	grid-template-columns: 74px minmax(0, 1fr);
	gap: 12px;
	min-width: 0;
	padding: 12px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	border-radius: 8px;
	background: rgba(18, 24, 38, 0.54);
	color: var(--color-text);
	text-decoration: none;
	backdrop-filter: blur(14px);
	transition:
		transform 0.18s ease,
		border-color 0.18s ease,
		background 0.18s ease;
}

a.exchange-result-card:hover {
	transform: translateY(-2px);
	border-color: rgba(52, 211, 153, 0.55);
	background: rgba(24, 32, 50, 0.68);
	text-decoration: none;
}

.exchange-result-card--received {
	border-color: rgba(52, 211, 153, 0.42);
}

.exchange-result-cover-wrap {
	width: 74px;
	aspect-ratio: 2 / 3;
	overflow: hidden;
}

.exchange-result-cover {
	width: 100%;
	display: block;
	image-rendering: auto;
	-webkit-backface-visibility: hidden;
	backface-visibility: hidden;
	border-radius: 6px;
	background: var(--color-border);
	box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26);
}

.exchange-result-cover--empty {
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), transparent), var(--color-border);
}

.exchange-result-copy {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 5px;
	min-width: 0;
}

.exchange-result-copy span {
	color: var(--color-text-muted);
	font-size: 0.74rem;
	font-weight: 800;
}

.exchange-result-copy strong,
.exchange-result-copy small {
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-box-orient: vertical;
}

.exchange-result-copy strong {
	color: var(--color-text);
	font-size: 1rem;
	line-height: 1.35;
	line-clamp: 2;
	-webkit-line-clamp: 2;
}

.exchange-result-copy small {
	color: var(--color-text-muted);
	font-size: 0.78rem;
	line-height: 1.35;
	line-clamp: 1;
	-webkit-line-clamp: 1;
}

.exchange-result-comment {
	margin: 3px 0 0;
	color: var(--color-text);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.exchange-swap-icon {
	display: flex;
	align-items: center;
	justify-content: center;
}

.exchange-swap-icon span {
	display: grid;
	place-items: center;
	width: 46px;
	height: 46px;
	border-radius: 50%;
	border: 1px solid rgba(255, 255, 255, 0.18);
	background: rgba(255, 255, 255, 0.12);
	color: var(--color-accent);
	font-size: 1.45rem;
	font-weight: 900;
	animation: exchange-swap-pulse 2.2s ease-in-out infinite;
}

.exchange-result-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	margin-top: 14px;
}

.exchange-new-badge {
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
	box-shadow: 0 0 18px rgba(52, 211, 153, 0.65);
	animation: exchange-badge-glow 1.7s ease-in-out infinite alternate;
}

.anime-exchange-result--timeline {
	margin: 10px 0 6px;
	padding: 12px;
	box-shadow: none;
}

.anime-exchange-result--timeline .exchange-result-grid {
	grid-template-columns: minmax(0, 1fr) 38px minmax(0, 1fr);
	gap: 8px;
}

.anime-exchange-result--timeline .exchange-result-card {
	grid-template-columns: 48px minmax(0, 1fr);
	padding: 9px;
	gap: 8px;
}

.anime-exchange-result--timeline .exchange-result-cover-wrap {
	width: 48px;
}

.anime-exchange-result--timeline .exchange-result-copy strong {
	font-size: 0.85rem;
	line-clamp: 2;
	-webkit-line-clamp: 2;
}

.anime-exchange-result--timeline .exchange-result-copy span,
.anime-exchange-result--timeline .exchange-result-copy small,
.anime-exchange-result--timeline .exchange-result-comment {
	font-size: 0.68rem;
}

.anime-exchange-result--timeline .exchange-swap-icon span {
	width: 34px;
	height: 34px;
	font-size: 1rem;
}

:global([data-theme="light"]) .anime-exchange-result {
	border-color: rgba(124, 58, 237, 0.16);
	background:
		radial-gradient(circle at 82% 18%, rgba(52, 211, 153, 0.18), transparent 34%),
		linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(245, 243, 255, 0.82));
	box-shadow: 0 14px 34px rgba(124, 58, 237, 0.1);
}

:global([data-theme="light"]) .exchange-result-card {
	border-color: rgba(124, 58, 237, 0.14);
	background: rgba(255, 255, 255, 0.78);
	box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}

:global([data-theme="light"]) a.exchange-result-card:hover {
	border-color: rgba(52, 211, 153, 0.48);
	background: rgba(240, 253, 250, 0.92);
}

:global([data-theme="light"]) .exchange-result-card--received {
	border-color: rgba(52, 211, 153, 0.36);
	background: rgba(236, 253, 245, 0.82);
}

:global([data-theme="light"]) .exchange-swap-icon span {
	border-color: rgba(124, 58, 237, 0.18);
	background: rgba(255, 255, 255, 0.72);
	box-shadow: 0 8px 20px rgba(124, 58, 237, 0.1);
}

@keyframes exchange-swap-pulse {
	0%,
	100% {
		transform: rotate(0deg) scale(1);
	}
	50% {
		transform: rotate(180deg) scale(1.08);
	}
}

@keyframes exchange-badge-glow {
	from {
		filter: brightness(1);
		box-shadow: 0 0 12px rgba(52, 211, 153, 0.5);
	}
	to {
		filter: brightness(1.18);
		box-shadow: 0 0 24px rgba(250, 204, 21, 0.72);
	}
}

@media (max-width: 640px) {
	.exchange-result-grid,
	.anime-exchange-result--timeline .exchange-result-grid {
		grid-template-columns: 1fr;
	}

	.exchange-swap-icon {
		min-height: 38px;
	}

	.exchange-swap-icon span {
		transform: rotate(90deg);
	}

	.exchange-result-card,
	.anime-exchange-result--timeline .exchange-result-card {
		grid-template-columns: 62px minmax(0, 1fr);
	}

	.exchange-result-cover-wrap,
	.anime-exchange-result--timeline .exchange-result-cover-wrap {
		width: 62px;
	}
}
</style>
