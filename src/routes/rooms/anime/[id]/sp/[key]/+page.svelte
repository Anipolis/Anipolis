<script lang="ts">
import LiveRoomView from "$lib/components/room/LiveRoomView.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- 特番や放送枠（?airing=）を移ったときにローカル状態を持ち越さないよう、再マウントする -->
{#key `${data.anime.id}:${data.room.session_id}:${data.room.initial_airing_id ?? ""}`}
	<LiveRoomView {data} {form} />
{/key}
