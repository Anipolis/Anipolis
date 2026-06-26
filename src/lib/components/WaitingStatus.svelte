<script lang="ts">
import type { Snippet } from "svelte";
import type { AnimeExchangeShareAnime } from "$lib/types";
import ExchangeAnimeCard from "./ExchangeAnimeCard.svelte";

interface Props {
	offeredAnime: AnimeExchangeShareAnime;
	comment?: string | null;
	subjectiveTags?: readonly string[] | null;
	receivedAnime?: AnimeExchangeShareAnime | null;
	receivedComment?: string | null;
	receivedSubjectiveTags?: readonly string[] | null;
	mode?: "waiting" | "matched";
	receivedCardActions?: Snippet;
	actions?: Snippet;
}

let {
	offeredAnime,
	comment = null,
	subjectiveTags = [],
	receivedAnime = null,
	receivedComment = null,
	receivedSubjectiveTags = [],
	mode = "waiting",
	receivedCardActions,
	actions,
}: Props = $props();
</script>

<div class="waiting-status" class:waiting-status--matched={mode === "matched"} aria-live="polite">
	<div class="waiting-status-grid">
		<ExchangeAnimeCard anime={offeredAnime} caption="あなたのおすすめ" {comment} {subjectiveTags} link={false} />

		<div class="waiting-indicator">
			<span class="waiting-indicator-text">{mode === "matched" ? "マッチング成立" : "マッチング中"}</span>
			{#if mode === "matched"}
				<span class="waiting-match-icon" aria-hidden="true">→</span>
			{:else}
				<span class="waiting-dots" aria-hidden="true">
					<span class="wt-dot"></span>
					<span class="wt-dot"></span>
					<span class="wt-dot"></span>
				</span>
			{/if}
		</div>

		{#if mode === "matched" && receivedAnime}
			{#if receivedCardActions}
				<ExchangeAnimeCard
					anime={receivedAnime}
					caption="届いたおすすめ"
					comment={receivedComment}
					subjectiveTags={receivedSubjectiveTags}
					highlight
				>
					{@render receivedCardActions()}
				</ExchangeAnimeCard>
			{:else}
				<ExchangeAnimeCard
					anime={receivedAnime}
					caption="届いたおすすめ"
					comment={receivedComment}
					subjectiveTags={receivedSubjectiveTags}
					highlight
				/>
			{/if}
		{:else}
			<ExchangeAnimeCard placeholder caption="お相手を待っています" />
		{/if}
	</div>

	{#if actions}
		<div class="waiting-status-actions">
			{@render actions()}
		</div>
	{/if}
</div>

<style>
.waiting-status {
	display: flex;
	flex-direction: column;
	gap: 14px;
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
	--trade-card-padding: 10px;
	--trade-center-width: 86px;
	--trade-side-gap: 16px;
	--trade-cover-width: min(
		200px,
		calc(((100cqw - var(--trade-center-width) - (var(--trade-side-gap) * 2)) / 2) - (var(--trade-card-padding) * 2))
	);
	--trade-cover-center-y: calc(
		var(--trade-card-padding) +
		(0.74rem * 1.2) +
		6px +
		(var(--trade-cover-width) * 1.414 / 2)
	);
}

.waiting-status-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 86px minmax(0, 1fr);
	align-items: stretch;
	gap: 16px;
}

.waiting-indicator {
	display: flex;
	flex-direction: column;
	align-items: center;
	align-self: start;
	gap: 10px;
	color: var(--color-text-muted);
	margin-top: calc(var(--trade-cover-center-y) - 16px);
}

.waiting-indicator-text {
	font-size: 0.82rem;
	font-weight: 700;
	line-height: 1.2;
	white-space: nowrap;
}

.waiting-dots {
	display: inline-flex;
	gap: 5px;
}

.waiting-match-icon {
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
}

.wt-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--status-plan);
	animation: wt-bounce 1.2s ease-in-out infinite;
}

.wt-dot:nth-child(2) {
	animation-delay: 0.15s;
}

.wt-dot:nth-child(3) {
	animation-delay: 0.3s;
}

@keyframes wt-bounce {
	0%,
	100% {
		transform: translateY(0);
		opacity: 0.5;
	}
	50% {
		transform: translateY(-5px);
		opacity: 1;
	}
}

.waiting-status-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	justify-content: center;
}

:global([data-theme="light"]) .waiting-status {
	border-color: rgba(124, 58, 237, 0.16);
	background:
		radial-gradient(circle at 82% 18%, rgba(52, 211, 153, 0.18), transparent 34%),
		linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(245, 243, 255, 0.82));
	box-shadow: 0 14px 34px rgba(124, 58, 237, 0.1);
}

@media (max-width: 640px) {
	.waiting-status {
		gap: 12px;
		padding: 12px;
		--trade-center-width: 30px;
		--trade-side-gap: 8px;
	}

	.waiting-status-grid {
		grid-template-columns: minmax(0, 1fr) 30px minmax(0, 1fr);
		gap: 8px;
	}

	.waiting-indicator {
		justify-content: center;
		gap: 0;
		margin-top: calc(var(--trade-cover-center-y) - 3px);
	}

	.waiting-indicator-text {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	.waiting-dots {
		gap: 3px;
	}

	.waiting-match-icon {
		width: 30px;
		height: 30px;
		font-size: 0.9rem;
	}

	.wt-dot {
		width: 5px;
		height: 5px;
	}
}
</style>
