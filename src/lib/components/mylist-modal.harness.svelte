<script lang="ts">
import type { UserAnimeEntry } from "$lib/types";
import MyListModal from "./MyListModal.svelte";

// アニメ一覧ページと同じく、開くたびに {#if} でマウントし直す使い方を再現する
let { entry }: { entry: UserAnimeEntry | null } = $props();
let opened = $state(false);
</script>

<button type="button" class="open-modal" onclick={() => (opened = true)}>開く</button>
{#if opened}
	<MyListModal open animeId={1} animeTitle="テスト" episodeCount="12" {entry} onclose={() => (opened = false)} />
{/if}
