<script lang="ts">
import AnimeCard, { type AnimeCardProps } from "$lib/components/AnimeCard.svelte";
import type { Anime, AnimeStatus } from "$lib/types";

let {
	status,
	animes,
	statusLabel,
	statusIcon,
	headingLevel = 2,
	scoreLabel,
	scoreButtonFor,
	listButtonFor,
}: {
	status: AnimeStatus;
	animes: Anime[];
	statusLabel: Record<AnimeStatus, string>;
	statusIcon: Record<AnimeStatus, string>;
	headingLevel?: 2 | 3;
	/** 左のマスに出すリストの持ち主のスコアの名前（「自分のスコア」「〇〇さんのスコア」） */
	scoreLabel: string;
	/** 自分のマイリストのとき、左のマスを押してスコアを変えるボタンにする */
	scoreButtonFor?: ((anime: Anime) => { expanded: boolean; onclick: (e: MouseEvent) => void }) | undefined;
	/** 右のマスの自分のマイリスト。渡さなければ（未ログイン）スコアだけにする */
	listButtonFor?: ((anime: Anime) => AnimeCardProps["listButton"]) | undefined;
} = $props();

// 見ている途中の作品だけ見た話数を出す（完了は全話、視聴予定はまだ見ていない）
const PROGRESS_STATUSES: AnimeStatus[] = ["watching", "on_hold", "dropped"];

function progressOf(anime: Anime): NonNullable<AnimeCardProps["progress"]> | null {
	if (!PROGRESS_STATUSES.includes(status)) return null;
	const total = Number.parseInt(anime.episode_count ?? "", 10);
	return { watched: anime.user_entry?.progress ?? 0, total: Number.isFinite(total) && total > 0 ? total : null };
}
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
			<AnimeCard
				{anime}
				href="/anime/{anime.id}"
				score={{
					kind: 'personal',
					value: anime.user_entry?.score ?? null,
					label: scoreLabel,
					mine: scoreButtonFor != null,
					...scoreButtonFor?.(anime),
				}}
				progress={progressOf(anime)}
				listButton={listButtonFor?.(anime) ?? null}
			/>
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
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 14px;
}

@media (max-width: 768px) {
	.anime-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
}

@media (max-width: 420px) {
	.anime-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
