<script lang="ts">
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";
import { page } from "$app/state";
import MobileBottomNav from "$lib/components/MobileBottomNav.svelte";
import MobileSwipeNavigation from "$lib/components/MobileSwipeNavigation.svelte";
import Sidebar from "$lib/components/Sidebar.svelte";
import { composeOpen } from "$lib/stores/compose";
import type { LayoutProps } from "./$types";
import "virtual:uno.css";
import "../app.css";

let { data, children }: LayoutProps = $props();
let unreadNotificationCount = $state(0);
let unreadBroadcastNotificationCount = $state(0);
let pendingReportsCount = $state(0);
const roomScrollLocked = $derived(page.url.pathname.startsWith("/rooms/anime/"));

async function refreshNotificationCounts() {
	if (!data.session) {
		unreadNotificationCount = 0;
		unreadBroadcastNotificationCount = 0;
		return;
	}

	const response = await fetch("/api/notifications/unread-counts");
	if (!response.ok) return;
	const counts = (await response.json()) as {
		unreadNotificationCount?: number;
		unreadBroadcastNotificationCount?: number;
	};
	unreadNotificationCount = counts.unreadNotificationCount ?? 0;
	unreadBroadcastNotificationCount = counts.unreadBroadcastNotificationCount ?? 0;
}

$effect(() => {
	let active = true;
	void Promise.resolve(data.unreadNotificationCount ?? 0).then((count) => {
		if (active) unreadNotificationCount = count;
	});
	void Promise.resolve(data.unreadBroadcastNotificationCount ?? 0).then((count) => {
		if (active) unreadBroadcastNotificationCount = count;
	});
	void Promise.resolve(data.pendingReportsCount ?? 0).then((count) => {
		if (active) pendingReportsCount = count;
	});
	return () => {
		active = false;
	};
});

$effect.pre(() => {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	root.classList.toggle("room-scroll-lock", roomScrollLocked);
	return () => {
		root.classList.remove("room-scroll-lock");
	};
});

onMount(() => {
	const {
		data: { subscription },
	} = data.supabase.auth.onAuthStateChange(() => {
		invalidate("supabase:auth");
	});
	const notificationInterval = setInterval(() => {
		void refreshNotificationCounts();
	}, 30_000);
	return () => {
		subscription.unsubscribe();
		clearInterval(notificationInterval);
	};
});

// FAB: open compose modal on the timeline.
function handleFabClick() {
	composeOpen.set(true);
}
</script>

<svelte:head>
	<meta property="og:site_name" content="Anipolis">
	<meta name="twitter:card" content="summary">
</svelte:head>

<div class="app-layout">
	<Sidebar
		supabase={data.supabase}
		session={data.session}
		profile={data.profile}
		{unreadNotificationCount}
		{unreadBroadcastNotificationCount}
		{pendingReportsCount}
		extraAccounts={data.extraAccounts}
	/>
	<main class="app-main" id="main-content" tabindex="-1">
		{@render children()}
	</main>
</div>

<MobileBottomNav session={data.session} {unreadNotificationCount} />
<MobileSwipeNavigation session={data.session} />

<!-- FAB: compose post (mobile only) -->
{#if data.session && page.url.pathname === "/"}
	<button type="button" class="mobile-fab" onclick={handleFabClick} aria-label="投稿する">
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
			<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
		</svg>
	</button>
{/if}

<style>
.mobile-fab {
	display: none;
	position: fixed;
	bottom: 72px;
	right: 16px;
	width: 56px;
	height: 56px;
	border-radius: 50%;
	background: var(--color-accent);
	color: white;
	border: none;
	cursor: pointer;
	align-items: center;
	justify-content: center;
	box-shadow: 0 4px 16px rgba(99, 102, 241, 0.45);
	z-index: 140;
	transition:
		transform 0.15s,
		box-shadow 0.15s;
}

.mobile-fab:hover {
	transform: scale(1.05);
	box-shadow: 0 6px 20px rgba(99, 102, 241, 0.55);
}

@media (max-width: 960px) {
	.mobile-fab {
		display: flex;
	}
}
</style>
