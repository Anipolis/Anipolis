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
	const notificationInterval = setInterval(() => {
		if (data.session) void invalidate("broadcast:notifications");
	}, 30_000);
	return () => {
		subscription.unsubscribe();
		clearInterval(notificationInterval);
	};
});
</script>

<div class="app-layout">
	<Sidebar
		supabase={data.supabase}
		session={data.session}
		profile={data.profile}
		unreadNotificationCount={data.unreadNotificationCount}
		unreadBroadcastNotificationCount={data.unreadBroadcastNotificationCount}
		extraAccounts={data.extraAccounts}
	/>
	<div class="app-main">
		{@render children()}
	</div>
</div>
