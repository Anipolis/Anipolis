<script lang="ts">
import { page } from "$app/state";
import { getSidebar } from "$lib/sidebar.svelte";
import LiveRoomsPanel from "./LiveRoomsPanel.svelte";
import TrendingPanel from "./TrendingPanel.svelte";

interface Props {
	showLiveRooms?: boolean;
}

let { showLiveRooms = false }: Props = $props();
const sidebar = getSidebar();
</script>

{#if showLiveRooms && page.data.user && sidebar?.value}
	<LiveRoomsPanel rooms={sidebar.value.liveRooms} />
{/if}
<TrendingPanel />
