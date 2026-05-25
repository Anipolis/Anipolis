<script lang="ts">
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";
import Sidebar from "$lib/components/Sidebar.svelte";
import type { LayoutProps } from "./$types";
import "../app.css";

let { data, children }: LayoutProps = $props();

onMount(() => {
	const {
		data: { subscription },
	} = data.supabase.auth.onAuthStateChange(() => {
		invalidate("supabase:auth");
	});
	return () => subscription.unsubscribe();
});
</script>

<div class="app-layout">
	<Sidebar
		supabase={data.supabase}
		session={data.session}
		profile={data.profile}
		unreadNotificationCount={data.unreadNotificationCount}
		extraAccounts={data.extraAccounts}
	/>
	<div class="app-main">
		{@render children()}
	</div>
</div>
