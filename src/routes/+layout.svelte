<script lang="ts">
import { onMount } from "svelte";
import { browser } from "$app/environment";
import { invalidate } from "$app/navigation";
import Nav from "$lib/components/Nav.svelte";
import Sidebar from "$lib/components/Sidebar.svelte";
import type { LayoutProps } from "./$types";
import "../app.css";

let { data, children }: LayoutProps = $props();

let sidebarOpen = $state(browser ? localStorage.getItem("sidebarOpen") !== "false" : true);

$effect(() => {
	if (browser) {
		document.documentElement.classList.toggle("sidebar-collapsed", !sidebarOpen);
	}
});

function toggleSidebar() {
	sidebarOpen = !sidebarOpen;
	if (browser) localStorage.setItem("sidebarOpen", String(sidebarOpen));
}

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
		pendingFollowRequestCount={data.pendingFollowRequestCount}
		{sidebarOpen}
	/>
	<button
		type="button"
		class="sidebar-toggle"
		onclick={toggleSidebar}
		aria-label={sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
		title={sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
	>
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{#if sidebarOpen}
				<polyline points="15 18 9 12 15 6" />
			{:else}
				<polyline points="9 18 15 12 9 6" />
			{/if}
		</svg>
	</button>
	<div class="app-main" id="main-content" tabindex="-1">
		<Nav />
		{@render children()}
	</div>
</div>
