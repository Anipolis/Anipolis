<script lang="ts">
import LiveRoomView from "$lib/components/room/LiveRoomView.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- ルーム間遷移でローカル状態が持ち越されないよう、ルーム単位で再マウントする -->
{#key data.room.session_id}
	<LiveRoomView {data} {form} />
{/key}
