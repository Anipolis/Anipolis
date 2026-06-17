<script lang="ts">
import RoomPage from "../[date]/+page.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<RoomPage {data} {form} />
