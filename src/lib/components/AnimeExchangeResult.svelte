<script lang="ts">
import type { Snippet } from "svelte";
import type { AnimeExchangeShareAnime } from "$lib/types";
import ExchangeAnimeCard from "./ExchangeAnimeCard.svelte";

interface Props {
	offeredAnime: AnimeExchangeShareAnime;
	receivedAnime: AnimeExchangeShareAnime;
	offeredComment?: string | null;
	receivedComment?: string | null;
	offeredSubjectiveTags?: readonly string[] | null;
	receivedSubjectiveTags?: readonly string[] | null;
	mode?: "full" | "timeline";
	linkCards?: boolean;
	framed?: boolean;
	offeredCardActions?: Snippet;
	receivedCardActions?: Snippet;
	actions?: Snippet;
}

let {
	offeredAnime,
	receivedAnime,
	offeredComment = null,
	receivedComment = null,
	offeredSubjectiveTags = [],
	receivedSubjectiveTags = [],
	mode = "full",
	linkCards = true,
	framed = true,
	offeredCardActions,
	receivedCardActions,
	actions,
}: Props = $props();
</script>

<div
	class="anime-exchange-result"
	class:anime-exchange-result--timeline={mode === "timeline"}
	class:anime-exchange-result--unframed={!framed}
>
	{#if mode === "timeline"}
		<div class="exchange-result-grid exchange-result-grid--timeline">
			<ExchangeAnimeCard anime={offeredAnime} link={linkCards} variant="poster-only" />
			<div class="exchange-swap-icon exchange-swap-icon--timeline" aria-hidden="true"><span>→</span></div>
			<ExchangeAnimeCard anime={receivedAnime} link={linkCards} variant="poster-only" highlight />
		</div>
	{:else}
		<div class="exchange-result-grid exchange-result-grid--full">
			{#if offeredCardActions}
				<ExchangeAnimeCard
					anime={offeredAnime}
					caption="渡したアニメ"
					comment={offeredComment}
					subjectiveTags={offeredSubjectiveTags}
					link={linkCards}
				>
					{@render offeredCardActions()}
				</ExchangeAnimeCard>
			{:else}
				<ExchangeAnimeCard
					anime={offeredAnime}
					caption="渡したアニメ"
					comment={offeredComment}
					subjectiveTags={offeredSubjectiveTags}
					link={linkCards}
				/>
			{/if}
			<div class="exchange-swap-icon" aria-hidden="true"><span>→</span></div>
			{#if receivedCardActions}
				<ExchangeAnimeCard
					anime={receivedAnime}
					caption="受け取ったアニメ"
					comment={receivedComment}
					subjectiveTags={receivedSubjectiveTags}
					link={linkCards}
					highlight
				>
					{@render receivedCardActions()}
				</ExchangeAnimeCard>
			{:else}
				<ExchangeAnimeCard
					anime={receivedAnime}
					caption="受け取ったアニメ"
					comment={receivedComment}
					subjectiveTags={receivedSubjectiveTags}
					link={linkCards}
					highlight
				/>
			{/if}
		</div>
	{/if}
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
	container-type: inline-size;
}

.exchange-result-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 54px minmax(0, 1fr);
	align-items: stretch;
	gap: 12px;
}

.exchange-result-grid--full {
	grid-template-columns: var(--trade-card-width) var(--trade-center-width) var(--trade-card-width);
	align-items: stretch;
	justify-content: center;
	gap: var(--trade-side-gap);
	--trade-card-padding: 10px;
	--trade-center-width: 46px;
	--trade-side-gap: 16px;
	--trade-card-width: min(220px, calc((100cqw - var(--trade-center-width) - (var(--trade-side-gap) * 2)) / 2));
	--trade-cover-width: calc(var(--trade-card-width) - (var(--trade-card-padding) * 2));
	--trade-cover-center-y: calc(
		var(--trade-card-padding) +
		(0.74rem * 1.2) +
		6px +
		(var(--trade-cover-width) * 1.414 / 2)
	);
}

.exchange-result-grid--timeline {
	grid-template-columns: minmax(0, 1fr) var(--timeline-center-width) minmax(0, 1fr);
	align-items: stretch;
	gap: var(--timeline-gap);
	width: min(
		100%,
		calc(
			var(--timeline-card-max) +
			var(--timeline-card-max) +
			var(--timeline-center-width) +
			var(--timeline-gap) +
			var(--timeline-gap)
		)
	);
	margin-inline: auto;
}

.exchange-swap-icon {
	display: flex;
	align-items: center;
	justify-content: center;
}

.exchange-result-grid--full .exchange-swap-icon {
	align-self: start;
	margin-top: calc(var(--trade-cover-center-y) - 23px);
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
	justify-content: center;
	margin-top: 14px;
}

.anime-exchange-result--timeline {
	margin: 10px 0 6px;
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none;
	backdrop-filter: none;
	container-type: inline-size;
	--timeline-center-width: 28px;
	--timeline-gap: 8px;
	--timeline-card-max: min(126px, calc((100cqw - var(--timeline-center-width) - (var(--timeline-gap) * 2)) / 2));
}

.anime-exchange-result--unframed {
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none;
	backdrop-filter: none;
	overflow: visible;
}

.anime-exchange-result--timeline .exchange-swap-icon {
	align-self: center;
	min-height: 28px;
}

.anime-exchange-result--timeline .exchange-swap-icon span {
	width: 28px;
	height: 28px;
	font-size: 0.9rem;
	animation: none;
}

.exchange-result-grid--timeline :global(.eac--poster-only) {
	max-width: var(--timeline-card-max);
}

:global([data-theme="light"]) .anime-exchange-result {
	border-color: rgba(124, 58, 237, 0.16);
	background:
		radial-gradient(circle at 82% 18%, rgba(52, 211, 153, 0.18), transparent 34%),
		linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(245, 243, 255, 0.82));
	box-shadow: 0 14px 34px rgba(124, 58, 237, 0.1);
}

:global([data-theme="light"]) .anime-exchange-result--unframed {
	border-color: transparent;
	background: transparent;
	box-shadow: none;
}

:global([data-theme="light"]) .anime-exchange-result--timeline {
	border-color: transparent;
	background: transparent;
	box-shadow: none;
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

@media (max-width: 640px) {
	.anime-exchange-result:not(.anime-exchange-result--timeline):not(.anime-exchange-result--unframed) {
		padding: 12px;
	}

	.exchange-result-grid--full {
		--trade-center-width: 30px;
		--trade-side-gap: 8px;
	}

	.exchange-swap-icon span {
		transform: rotate(90deg);
	}

	.anime-exchange-result--timeline .exchange-swap-icon span {
		transform: none;
	}

	.exchange-result-grid--full .exchange-swap-icon {
		min-height: 0;
		margin-top: calc(var(--trade-cover-center-y) - 15px);
	}

	.exchange-result-grid--full .exchange-swap-icon span {
		width: 30px;
		height: 30px;
		font-size: 0.9rem;
		transform: none;
	}

	.exchange-result-grid--timeline {
		--timeline-center-width: 24px;
		--timeline-gap: 6px;
		--timeline-card-max: min(104px, calc((100cqw - var(--timeline-center-width) - (var(--timeline-gap) * 2)) / 2));
	}
}
</style>
