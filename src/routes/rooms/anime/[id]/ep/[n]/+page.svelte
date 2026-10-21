<script lang="ts">
import LiveRoomView from "$lib/components/room/LiveRoomView.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- 話数や放送枠（?airing=）を移ったときにローカル状態（受信済みの投稿・読み始める位置）を持ち越さないよう、再マウントする -->
{#key `${data.anime.id}:${data.room.episode_number}:${data.room.initial_airing_id ?? ""}`}
	<LiveRoomView {data} {form} />
{/key}
