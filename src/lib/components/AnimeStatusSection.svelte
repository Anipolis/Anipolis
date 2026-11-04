<script lang="ts">
import AnimeCard, { type AnimeCardProps } from "$lib/components/AnimeCard.svelte";
import type { Anime, AnimeStatus } from "$lib/types";

let {
	animes,
	scoreLabel,
	scoreButtonFor,
	listButtonFor,
}: {
	animes: Anime[];
	/** 左のマスに出すリストの持ち主のスコアの名前（「自分のスコア」「〇〇さんのスコア」） */
	scoreLabel: string;
	/** 自分のマイリストのとき、左のマスを押してスコアを変えるボタンにする */
	scoreButtonFor?: ((anime: Anime) => { expanded: boolean; onclick: (e: MouseEvent) => void }) | undefined;
	/** 右のマスの自分のマイリスト。渡さなければ（未ログイン）スコアだけにする */
	listButtonFor?: ((anime: Anime) => AnimeCardProps["listButton"]) | undefined;
} = $props();

// 見ている途中の作品だけ見た話数を出す（完了は全話、視聴予定はまだ見ていない）。「すべて」のタブがあるので作品ごとに見る
const PROGRESS_STATUSES: AnimeStatus[] = ["watching", "on_hold", "dropped"];

function progressOf(anime: Anime): NonNullable<AnimeCardProps["progress"]> | null {
	const status = anime.user_entry?.status;
	if (!status || !PROGRESS_STATUSES.includes(status)) return null;
	const total = Number.parseInt(anime.episode_count ?? "", 10);
	return { watched: anime.user_entry?.progress ?? 0, total: Number.isFinite(total) && total > 0 ? total : null };
}
</script>

<section class="status-section">
	<div class="anime-grid">
		{#each animes as anime (anime.id)}
			<AnimeCard
				{anime}
				titleOnlyOnPhone
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
</style>
