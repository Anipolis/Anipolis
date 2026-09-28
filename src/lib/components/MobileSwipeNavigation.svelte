<script lang="ts">
import type { Session } from "@supabase/supabase-js";
import { onDestroy, onMount } from "svelte";
import { browser, dev } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
	classifySwipe,
	decideSwipeStart,
	hasTextSelection,
	resolveSwipeAxis,
	type SwipeAxis,
	type SwipeElementLike,
	type SwipeResult,
	type SwipeStartDecision,
} from "$lib/utils/swipe-gesture";

interface Props {
	session: Session | null;
}

type RouteEntry = {
	path: string;
	matches?: (pathname: string) => boolean;
};

let { session }: Props = $props();

const mobileQuery = "(max-width: 960px)";

let mainElement: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let tracking = false;
let startDecision: SwipeStartDecision = "TRACK";
let axis: SwipeAxis = "undecided";
let horizontalSwipeLocked = $state(false);
let debugDeltaX = $state(0);
let debugDeltaY = $state(0);
let debugResult = $state<SwipeResult>("WAITING");
let debugStart = $state<SwipeStartDecision>("TRACK");

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

/** 横スクロール可能な要素か。DOM 計測が必要なので判定ロジックへ注入する */
function isHorizontalScroller(element: SwipeElementLike) {
	if (!(element instanceof HTMLElement)) return false;
	const style = window.getComputedStyle(element);
	const canScroll = style.overflowX === "auto" || style.overflowX === "scroll";
	return canScroll && element.scrollWidth > element.clientWidth + 1;
}

function getSwipeResult(deltaX: number, deltaY: number): SwipeResult {
	return classifySwipe(deltaX, deltaY, axis, {
		currentIndex: getCurrentTabIndex(),
		tabCount: bottomTabs.length,
	});
}

function setDebug(deltaX: number, deltaY: number, result: SwipeResult) {
	debugDeltaX = Math.round(deltaX);
	debugDeltaY = Math.round(deltaY);
	debugResult = result;
}

function resetGesture() {
	tracking = false;
	axis = "undecided";
	horizontalSwipeLocked = false;
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
	axis = "undecided";
	horizontalSwipeLocked = false;
	startX = touch.clientX;
	startY = touch.clientY;
	// 入力欄・ダイアログ・横スクローラー・文字選択中・画面端(戻るジェスチャー)・複数指は
	// スワイプ対象にしない。ここで除外しておけば move/end では一切介入しない。
	startDecision = decideSwipeStart({
		target: event.target instanceof Element ? event.target : null,
		boundary: mainElement,
		isHorizontalScroller,
		selection: window.getSelection(),
		touchCount: event.touches.length,
		startX: touch.clientX,
		viewportWidth: window.innerWidth,
	});
	debugStart = startDecision;
	setDebug(0, 0, "WAITING");
}

function handleTouchMove(event: TouchEvent) {
	if (!tracking || startDecision !== "TRACK" || !isMobileWidth()) return;
	if (event.touches.length > 1) {
		// 途中でピンチ等に変わったらこのジェスチャーは諦める
		resetGesture();
		setDebug(0, 0, "WAITING");
		return;
	}
	const touch = event.touches[0];
	if (!touch) return;

	const deltaX = touch.clientX - startX;
	const deltaY = touch.clientY - startY;
	// 最初に確定した軸を維持する: 縦スクロール中に指が横へ流れてもページ遷移させない
	axis = resolveSwipeAxis(axis, deltaX, deltaY);
	const result = getSwipeResult(deltaX, deltaY);
	setDebug(deltaX, deltaY, result);

	if (result === "SWIPE_NEXT" || result === "SWIPE_PREV") {
		horizontalSwipeLocked = true;
		event.preventDefault();
	}
}

function handleTouchEnd(event: TouchEvent) {
	if (!tracking || startDecision !== "TRACK" || !isMobileWidth()) {
		resetGesture();
		return;
	}

	const touch = event.changedTouches[0];
	if (!touch) {
		resetGesture();
		return;
	}

	const deltaX = touch.clientX - startX;
	const deltaY = touch.clientY - startY;
	axis = resolveSwipeAxis(axis, deltaX, deltaY);
	// 長押し等でジェスチャー中に文字選択が始まった場合も遷移しない
	const result = hasTextSelection(window.getSelection()) ? "IGNORE_VERTICAL" : getSwipeResult(deltaX, deltaY);
	const currentIndex = getCurrentTabIndex();
	resetGesture();
	setDebug(deltaX, deltaY, result);

	if (currentIndex < 0) return;
	if (result === "SWIPE_NEXT") void navigateWithViewTransition(currentIndex + 1, "next");
	if (result === "SWIPE_PREV") void navigateWithViewTransition(currentIndex - 1, "prev");
}

function handleTouchCancel() {
	resetGesture();
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
		{#if debugStart !== "TRACK"}
			/ {debugStart}
		{/if}
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
