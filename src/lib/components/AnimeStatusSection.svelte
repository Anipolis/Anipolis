<script lang="ts">
import type { Anime, AnimeStatus } from "$lib/types";

let {
	status,
	animes,
	statusLabel,
	statusIcon,
	headingLevel = 2,
}: {
	status: AnimeStatus;
	animes: Anime[];
	statusLabel: Record<AnimeStatus, string>;
	statusIcon: Record<AnimeStatus, string>;
	headingLevel?: 2 | 3;
} = $props();
</script>

<section class="status-section status-section--{status}">
	{#if headingLevel === 2}
		<h2 class="status-heading">
			<span class="status-icon {statusIcon[status]}" aria-hidden="true"></span>
			{statusLabel[status]}
			<span class="status-count">{animes.length}</span>
		</h2>
	{:else}
		<h3 class="status-heading">
			<span class="status-icon {statusIcon[status]}" aria-hidden="true"></span>
			{statusLabel[status]}
			<span class="status-count">{animes.length}</span>
		</h3>
	{/if}

	<div class="anime-grid">
		{#each animes as anime (anime.id)}
			<a href="/anime/{anime.id}" class="anime-card">
				<div class="card-cover">
					{#if anime.cover_url}
						<img src={anime.cover_url} alt={anime.title}>
					{:else}
						<div class="anime-cover-placeholder">?</div>
					{/if}
					{#if anime.user_entry?.score != null && anime.user_entry.score > 0}
						<div class="card-score">★ {anime.user_entry.score}</div>
					{/if}
				</div>
				<div class="card-info">
					<div class="card-title">{anime.title}</div>
					{#if anime.episode_count}
						<div class="card-progress">{anime.user_entry?.progress ?? 0}/{anime.episode_count}話</div>
					{:else if (anime.user_entry?.progress ?? 0) > 0}
						<div class="card-progress">{anime.user_entry?.progress}話</div>
					{/if}
				</div>
			</a>
		{/each}
	</div>
</section>

<style>
.status-section {
	margin-bottom: 32px;
}

.status-heading {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.95rem;
	font-weight: 700;
	padding: 8px 0;
	margin: 0 0 8px;
	border-bottom: 1px solid var(--border, #334155);
	color: var(--fg, #e2e8f0);
}

.status-icon {
	width: 1em;
	height: 1em;
	flex: 0 0 auto;
}

.status-section--watching .status-icon {
	color: var(--status-watching);
}

.status-section--completed .status-icon {
	color: var(--status-completed);
}

.status-section--plan_to_watch .status-icon {
	color: var(--watch-status-plan);
}

.status-section--on_hold .status-icon {
	color: var(--status-on-hold);
}

.status-section--dropped .status-icon {
	color: var(--status-dropped);
}

.status-count {
	margin-left: auto;
	font-size: 0.8rem;
	color: var(--fg-muted, #94a3b8);
	font-weight: 400;
}

.anime-grid {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: 12px;
}

.anime-card {
	display: flex;
	flex-direction: column;
	border-radius: 8px;
	overflow: hidden;
	text-decoration: none;
	color: inherit;
	background: var(--surface, #1e293b);
	transition:
		transform 0.12s,
		box-shadow 0.12s;
}

.anime-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.card-cover {
	position: relative;
	aspect-ratio: 1 / 1.414;
	background: var(--bg, #0f172a);
	overflow: hidden;
}

.card-cover img {
	width: 100%;
	display: block;
	image-rendering: auto;
}

.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--fg-muted, #94a3b8);
	font-size: 1.5rem;
}

.card-score {
	position: absolute;
	right: 5px;
	bottom: 5px;
	border-radius: 4px;
	background: rgb(0 0 0 / 0.72);
	color: var(--status-score);
	font-size: 0.72rem;
	font-weight: 700;
	padding: 2px 6px;
}

.card-info {
	padding: 7px 8px 8px;
}

.card-title {
	font-size: 0.78rem;
	font-weight: 500;
	color: var(--fg, #e2e8f0);
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	line-height: 1.35;
	margin-bottom: 3px;
}

.card-progress {
	font-size: 0.7rem;
	color: var(--fg-muted, #94a3b8);
}

@media (max-width: 600px) {
	.anime-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}
</style>
