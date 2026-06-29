<script lang="ts">
import ExchangeSubjectiveTags from "$lib/components/ExchangeSubjectiveTags.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head> <title>トレード履歴 - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column history-page">
		<header class="history-header">
			<a href="/exchange" class="back-link" aria-label="アニメトレードに戻る">← アニメトレード</a>
			<h1>トレード履歴</h1>
		</header>

		{#if data.exchanges.length === 0}
			<p class="empty-history">まだトレード履歴はありません。</p>
		{:else}
			<div class="history-list">
				{#each data.exchanges as exchange (exchange.id)}
					<article class="history-item">
						<div class="history-anime">
							<div>
								<span class="history-label">渡した作品</span>
								<a href="/anime/{exchange.offered_anime.id}">{exchange.offered_anime.title}</a>
								{#if exchange.comment}
									<p class="history-comment">“{exchange.comment}”</p>
								{/if}
								<ExchangeSubjectiveTags tags={exchange.subjective_tags} compact />
							</div>
						</div>
						<div class="history-arrow">→</div>
						<div class="history-anime">
							<div>
								<span class="history-label"
									>{exchange.status === "waiting" ? "待機中" : "届いたおすすめ"}</span
								>
								{#if exchange.received_anime}
									<a href="/anime/{exchange.received_anime.id}">{exchange.received_anime.title}</a>
									{#if exchange.received_comment}
										<p class="history-comment">“{exchange.received_comment}”</p>
									{/if}
									<ExchangeSubjectiveTags tags={exchange.received_subjective_tags} compact />
								{:else}
									<span class="history-muted">次のトレード相手を待っています</span>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
.history-page {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.history-header {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.history-header h1 {
	margin: 0;
	color: var(--color-text);
	font-size: 1.5rem;
	line-height: 1.2;
}

.back-link {
	color: var(--color-accent);
	font-weight: 700;
	font-size: 0.85rem;
}

.history-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.history-item {
	display: grid;
	grid-template-columns: 1fr;
	gap: 12px;
	align-items: start;
	padding: 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
}

.history-anime {
	display: flex;
	min-width: 0;
}

.history-anime div {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.history-anime a,
.history-muted {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.history-anime a {
	color: var(--color-text);
	font-weight: 700;
	font-size: 0.9rem;
}

.history-label,
.history-muted,
.empty-history {
	color: var(--color-text-muted);
	font-size: 0.8rem;
}

.history-comment {
	margin: 3px 0 0;
	color: var(--color-text-muted);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.history-arrow {
	align-self: center;
	color: var(--color-text-muted);
	text-align: left;
	transform: rotate(90deg);
	width: 24px;
}

@media (min-width: 641px) {
	.history-item {
		grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
	}

	.history-arrow {
		text-align: center;
		transform: none;
		width: auto;
	}
}
</style>
