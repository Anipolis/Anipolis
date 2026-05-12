<script lang="ts">
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const DAY_BG = [
	"var(--day-sun, #fff1f0)",
	"var(--day-mon, #f0f4ff)",
	"var(--day-tue, #f0f4ff)",
	"var(--day-wed, #f0f4ff)",
	"var(--day-thu, #f0f4ff)",
	"var(--day-fri, #f0f4ff)",
	"var(--day-sat, #f0f8ff)",
];
const DAY_COLOR = ["#dc2626", "var(--text)", "var(--text)", "var(--text)", "var(--text)", "var(--text)", "#2563eb"];
</script>

<div class="schedule-page">
	<header class="schedule-header">
		<h1>放送スケジュール</h1>
		<p class="schedule-subtitle">現在放送中のアニメ（JST）</p>
	</header>

	<div class="schedule-grid">
		{#each data.dayLabels as label, d}
			{@const col = data.days[d] ?? []}
			<div class="day-col">
				<div class="day-heading" style="color: {DAY_COLOR[d]}; background: {DAY_BG[d]}">{label}曜日</div>
				<div class="day-slots">
					{#if col.length === 0}
						<p class="empty-day">—</p>
					{:else}
						{#each col as anime (anime.id)}
							<a href="/anime/{anime.id}" class="anime-slot">
								{#if anime.cover_url}
									<img src={anime.cover_url} alt={anime.title} class="slot-cover">
								{:else}
									<div class="slot-cover slot-cover--placeholder"></div>
								{/if}
								<div class="slot-info">
									{#if anime.broadcast_time}
										<span class="slot-time">{anime.broadcast_time.slice(0, 5)}</span>
									{/if}
									<span class="slot-title">{anime.title}</span>
									{#if anime.broadcast_station?.length}
										<span class="slot-station">{anime.broadcast_station.join(" / ")}</span>
									{/if}
								</div>
							</a>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
.schedule-page {
	max-width: 1100px;
	margin: 0 auto;
	padding: 0 1rem 2rem;
}
.schedule-header {
	padding: 1.25rem 0 1rem;
}
.schedule-header h1 {
	font-size: 1.2rem;
	font-weight: 700;
	color: var(--text);
	margin: 0 0 4px;
}
.schedule-subtitle {
	font-size: 0.82rem;
	color: var(--text-muted);
	margin: 0;
}

.schedule-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 8px;
	overflow-x: auto;
}

.day-col {
	min-width: 120px;
}

.day-heading {
	text-align: center;
	font-size: 0.82rem;
	font-weight: 700;
	padding: 6px 4px;
	border-radius: 6px 6px 0 0;
	border: 1px solid var(--border);
	border-bottom: none;
}

.day-slots {
	border: 1px solid var(--border);
	border-radius: 0 0 6px 6px;
	padding: 6px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-height: 60px;
}

.empty-day {
	color: var(--text-muted);
	font-size: 0.8rem;
	text-align: center;
	padding: 8px 0;
	margin: 0;
}

.anime-slot {
	display: flex;
	align-items: flex-start;
	gap: 7px;
	padding: 6px;
	border-radius: 6px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	text-decoration: none;
	color: var(--text);
	transition: background 0.12s;
}
.anime-slot:hover {
	background: var(--hover-bg);
}

.slot-cover {
	width: 36px;
	height: 52px;
	object-fit: cover;
	border-radius: 3px;
	flex-shrink: 0;
}
.slot-cover--placeholder {
	background: var(--border);
}

.slot-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	overflow: hidden;
}

.slot-time {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--accent);
}

.slot-title {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--text);
	line-height: 1.3;
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.slot-station {
	font-size: 0.7rem;
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

@media (max-width: 700px) {
	.schedule-grid {
		grid-template-columns: repeat(4, minmax(110px, 1fr));
	}
}
@media (max-width: 480px) {
	.schedule-grid {
		grid-template-columns: repeat(2, 1fr);
	}
}
</style>
