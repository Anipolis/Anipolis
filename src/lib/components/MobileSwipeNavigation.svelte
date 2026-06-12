<script lang="ts">
import type { Session } from "@supabase/supabase-js";
import { onDestroy, onMount } from "svelte";
import { browser, dev } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";

interface Props {
	session: Session | null;
}

type SwipeResult = "WAITING" | "SWIPE_NEXT" | "SWIPE_PREV" | "IGNORE_SHORT" | "IGNORE_VERTICAL" | "IGNORE_ROUTE";

type RouteEntry = {
	path: string;
	matches?: (pathname: string) => boolean;
};

let { session }: Props = $props();

const mobileQuery = "(max-width: 960px)";
const minSwipeDistance = 42;
const horizontalIntentRatio = 2;

let mainElement: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let tracking = false;
let startedOnIgnoredArea = false;
let horizontalSwipeLocked = $state(false);
let debugDeltaX = $state(0);
let debugDeltaY = $state(0);
let debugResult = $state<SwipeResult>("WAITING");

const signedInTabs: RouteEntry[] = [
	{ path: "/" },
	{ path: "/search" },
	{ path: "/schedule", matches: (pathname) => pathname.startsWith("/schedule") || pathname.startsWith("/events") },
	{ path: "/notifications" },
	{ path: "/mylist" },
];

const signedOutTabs: RouteEntry[] = [
	{ path: "/" },
	{ path: "/search" },
	{ path: "/schedule", matches: (pathname) => pathname.startsWith("/schedule") || pathname.startsWith("/events") },
	{ path: "/anime" },
	{ path: "/auth" },
];

const bottomTabs = $derived(session ? signedInTabs : signedOutTabs);

function isMobileWidth() {
	return browser && window.matchMedia(mobileQuery).matches;
}

function isRouteActive(entry: RouteEntry, pathname: string) {
	if (entry.matches) return entry.matches(pathname);
	if (entry.path === "/") return pathname === "/";
	return pathname.startsWith(entry.path);
}

function getCurrentTabIndex() {
	return bottomTabs.findIndex((entry) => isRouteActive(entry, page.url.pathname));
}

function isHorizontalScroller(element: Element) {
	if (!(element instanceof HTMLElement)) return false;
	const style = window.getComputedStyle(element);
	const canScroll = style.overflowX === "auto" || style.overflowX === "scroll";
	return canScroll && element.scrollWidth > element.clientWidth + 1;
}

function startsInIgnoredArea(target: EventTarget | null) {
	if (!(target instanceof Element)) return true;
	if (target.closest(".mobile-bottom-nav, .mobile-drawer, .mobile-drawer-backdrop, .mobile-header")) return true;

	for (let element: Element | null = target; element && element !== mainElement; element = element.parentElement) {
		if (isHorizontalScroller(element)) return true;
	}
	return false;
}

function getSwipeResult(deltaX: number, deltaY: number): SwipeResult {
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	if (absX < minSwipeDistance) return "IGNORE_SHORT";
	if (absX < absY * horizontalIntentRatio) return "IGNORE_VERTICAL";

	const currentIndex = getCurrentTabIndex();
	if (currentIndex < 0) return "IGNORE_ROUTE";
	if (deltaX < 0 && currentIndex >= bottomTabs.length - 1) return "IGNORE_ROUTE";
	if (deltaX > 0 && currentIndex <= 0) return "IGNORE_ROUTE";
	return deltaX < 0 ? "SWIPE_NEXT" : "SWIPE_PREV";
}

function setDebug(deltaX: number, deltaY: number, result: SwipeResult) {
	debugDeltaX = Math.round(deltaX);
	debugDeltaY = Math.round(deltaY);
	debugResult = result;
}

async function navigateWithViewTransition(targetIndex: number, direction: "next" | "prev") {
	const targetTab = bottomTabs[targetIndex];
	if (!targetTab) return;

	document.documentElement.dataset["swipeDirection"] = direction;

	const runNavigation = () => goto(targetTab.path);

	if (typeof document.startViewTransition === "function") {
		try {
			const transition = document.startViewTransition(() => runNavigation());
			await transition.finished;
		} finally {
			delete document.documentElement.dataset["swipeDirection"];
		}
		return;
	}

	try {
		await runNavigation();
	} finally {
		delete document.documentElement.dataset["swipeDirection"];
	}
}

function handleTouchStart(event: TouchEvent) {
	if (!isMobileWidth()) return;
	const touch = event.touches[0];
	if (!touch) return;

	tracking = true;
	horizontalSwipeLocked = false;
	startX = touch.clientX;
	startY = touch.clientY;
	startedOnIgnoredArea = startsInIgnoredArea(event.target);
	setDebug(0, 0, "WAITING");
}

function handleTouchMove(event: TouchEvent) {
	if (!tracking || startedOnIgnoredArea || !isMobileWidth()) return;
	const touch = event.touches[0];
	if (!touch) return;

	const deltaX = touch.clientX - startX;
	const deltaY = touch.clientY - startY;
	const result = getSwipeResult(deltaX, deltaY);
	setDebug(deltaX, deltaY, result);

	if (result === "SWIPE_NEXT" || result === "SWIPE_PREV") {
		horizontalSwipeLocked = true;
		event.preventDefault();
	}
}

function handleTouchEnd(event: TouchEvent) {
	if (!tracking || startedOnIgnoredArea || !isMobileWidth()) {
		tracking = false;
		return;
	}

	const touch = event.changedTouches[0];
	if (!touch) {
		tracking = false;
		return;
	}

	const deltaX = touch.clientX - startX;
	const deltaY = touch.clientY - startY;
	const result = getSwipeResult(deltaX, deltaY);
	const currentIndex = getCurrentTabIndex();
	tracking = false;
	horizontalSwipeLocked = false;
	setDebug(deltaX, deltaY, result);

	if (currentIndex < 0) return;
	if (result === "SWIPE_NEXT") void navigateWithViewTransition(currentIndex + 1, "next");
	if (result === "SWIPE_PREV") void navigateWithViewTransition(currentIndex - 1, "prev");
}

function handleTouchCancel() {
	tracking = false;
	horizontalSwipeLocked = false;
	setDebug(0, 0, "WAITING");
}

onMount(() => {
	delete document.documentElement.dataset["swipeDirection"];
	mainElement = document.querySelector<HTMLElement>(".app-main");
	if (!mainElement) return;

	mainElement.addEventListener("touchstart", handleTouchStart, { passive: true });
	mainElement.addEventListener("touchmove", handleTouchMove, { passive: false });
	mainElement.addEventListener("touchend", handleTouchEnd, { passive: true });
	mainElement.addEventListener("touchcancel", handleTouchCancel, { passive: true });
});

onDestroy(() => {
	if (!mainElement) return;

	mainElement.removeEventListener("touchstart", handleTouchStart);
	mainElement.removeEventListener("touchmove", handleTouchMove);
	mainElement.removeEventListener("touchend", handleTouchEnd);
	mainElement.removeEventListener("touchcancel", handleTouchCancel);
});
</script>

{#if dev && session}
	<div class="swipe-debug" aria-live="polite">
		deltaX: {debugDeltaX} / deltaY: {debugDeltaY} / {debugResult}
		{#if horizontalSwipeLocked}
			/ LOCK
		{/if}
	</div>
{/if}

<style>
.swipe-debug {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 9999;
	padding: 4px 8px;
	background: rgba(0, 0, 0, 0.72);
	color: #fff;
	font-size: 11px;
	line-height: 1.3;
	pointer-events: none;
}
</style>
