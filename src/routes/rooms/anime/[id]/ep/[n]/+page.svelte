<script lang="ts">
import LiveRoomView from "$lib/components/room/LiveRoomView.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- 話数を移ったときにローカル状態（受信済みの投稿・スクロール位置）を持ち越さないよう、ルーム単位で再マウントする -->
{#key `${data.anime.id}:${data.room.episode_number}`}
	<LiveRoomView {data} {form} />
{/key}
