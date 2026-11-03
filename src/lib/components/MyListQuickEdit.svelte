<script lang="ts">
import MyListModal from "$lib/components/MyListModal.svelte";
import MyListStatusPopover from "$lib/components/MyListStatusPopover.svelte";
import type { UserAnimeEntry } from "$lib/types";

/**
 * 作品カードのマイリストボタンから開く欄。マウスで操作する PC は状態だけを選ぶ小さな欄（MyListStatusPopover）、
 * タッチ端末は押しやすい大きいモーダル（MyListModal）を出す。
 * 親は bind:this で受け取り、ボタンの onclick で open を呼ぶ
 */
type QuickEditAnime = { id: string; title: string; episode_count: string | null };

type Props = {
	/** 自分のマイリストの今の内容（未登録なら null） */
	entryOf: (anime: QuickEditAnime) => UserAnimeEntry | null | undefined;
	action?: string;
	/** 渡すと、登録済みの作品に「マイリストから外す」を出す */
	removeAction?: string | undefined;
	/** 渡すと保存後にページを読み込み直さず、保存した内容を知らせる（外したときは null） */
	onsaved?: ((anime: QuickEditAnime, entry: UserAnimeEntry | null) => void) | undefined;
};

let { entryOf, action = "?/upsertWatchlist", removeAction, onsaved }: Props = $props();

// 子の欄は渡さなかったときの動き（外すボタンを出さない・保存後に読み込み直す）を持つので、無いものは渡さない
const optionalProps = (anime: QuickEditAnime) => ({
	...(removeAction ? { removeAction } : {}),
	...(onsaved ? { onsaved: (entry: UserAnimeEntry | null) => onsaved(anime, entry) } : {}),
});

let modalAnime = $state<QuickEditAnime | null>(null);
let popover = $state<{ anime: QuickEditAnime; anchor: HTMLElement } | null>(null);
let popoverSaving = $state(false);

export function open(e: MouseEvent, anime: QuickEditAnime) {
	// カードはリンクなので、ボタンを押しても作品ページへ移らないようにする
	e.preventDefault();
	e.stopPropagation();
	const anchor = e.currentTarget as HTMLElement;
	if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
		// 保存中は欄を閉じたり別の作品へ切り替えたりしない（応答が別の作品に反映されるため）
		if (popoverSaving) return;
		popover = popover?.anchor === anchor ? null : { anime, anchor };
		return;
	}
	modalAnime = anime;
}

/** PC の小さな欄をこの作品で開いているか（ボタンの aria-expanded に使う） */
export function isOpenFor(animeId: string): boolean {
	return popover?.anime.id === animeId;
}
</script>

{#if popover}
	{@const popoverAnime = popover.anime}
	<MyListStatusPopover
		anchor={popover.anchor}
		animeId={popoverAnime.id}
		animeTitle={popoverAnime.title}
		entry={entryOf(popoverAnime)}
		{action}
		{...optionalProps(popoverAnime)}
		onclose={() => {
			popover = null;
		}}
		bind:submitting={popoverSaving}
	/>
{/if}

{#if modalAnime}
	{@const currentAnime = modalAnime}
	<MyListModal
		open
		animeId={currentAnime.id}
		animeTitle={currentAnime.title}
		episodeCount={currentAnime.episode_count}
		entry={entryOf(currentAnime)}
		{action}
		{...optionalProps(currentAnime)}
		onclose={() => {
			modalAnime = null;
		}}
	/>
{/if}
