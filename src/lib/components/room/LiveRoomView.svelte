<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import type { Snippet } from "svelte";
import { onDestroy, onMount, tick, untrack } from "svelte";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { autosize } from "$lib/actions/autosize";
import { timelineScroll } from "$lib/actions/timelineScroll";
import ExitSurveyModal from "$lib/components/ExitSurveyModal.svelte";
import LiveRoomPostCard from "$lib/components/LiveRoomPostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import type { Post, RoomExitSurveyComparisonWithX, RoomExitSurveyNextParticipation } from "$lib/types";
import type { LiveRoomActionData, LiveRoomData } from "$lib/types/live-room";
import { isPostContinuation } from "$lib/utils/post-presentation";
import {
	createRoomConnectionState,
	deriveRoomConnectionPhase,
	formatRelativeTime,
	ROOM_CONNECTION_PHASE_LABELS,
	ROOM_CONNECTION_PHASE_TONES,
	ROOM_LIVE_FETCH_TIMEOUT_MS,
	ROOM_LIVE_POLL_INTERVAL_MS,
	type RoomConnectionEvent,
	reduceRoomConnection,
	shouldOfferManualReconnect,
} from "$lib/utils/room-connection";

let { data, form, headerActions }: { data: LiveRoomData; form: LiveRoomActionData; headerActions?: Snippet } = $props();

type RoomStatus = "not_open" | "open" | "ended";
type PostOrder = "oldest" | "newest";

let now = $state(Date.now());
let intervalId: ReturnType<typeof setInterval>;
let postContent = $state("");
let isPosting = $state(false);
let textareaEl: HTMLTextAreaElement | null = $state(null);
let composerEl: HTMLDivElement | null = $state(null);
let keepComposerFocused = $state(true);
let postListEl: HTMLDivElement | null = $state(null);
let mounted = $state(false);
let isMobileViewport = $state(false);
let postOrder = $state<PostOrder>("oldest");
let knownPostIds = new Set<string>();
let isFollowingLatest = $state(true);
let unreadNewPostCount = $state(0);
let enteredAt = Date.now();
let localSurveyPostCount = $state(0);
let surveyOpen = $state(false);
let surveyHandled = $state(false);
let surveySubmitting = $state(false);
let surveyErrorMessage: string | null = $state(null);

let previousVirtualKeyboardOverlaysContent: boolean | undefined;
let removeRoomKeyboardListeners: (() => void) | undefined;

const maxLen = 280;
const latestEdgeThreshold = 80;
const scheduledMs = $derived(new Date(data.room.scheduled_at).getTime());
const openMs = $derived(new Date(data.room.posting_opens_at).getTime());
const closeMs = $derived(new Date(data.room.posting_closes_at).getTime());
const openLeadMinutes = $derived(Math.round((scheduledMs - openMs) / (60 * 1000)));
const isGlobalLobby = $derived(data.room.kind === "global");
const roomNameLabel = $derived(
	data.anime && data.room.title.startsWith(data.anime.title)
		? data.room.title.slice(data.anime.title.length).trim()
		: data.room.title,
);
const charCount = $derived(postContent.length);
const overLimit = $derived(charCount > maxLen);
const surveyPostCount = $derived(data.roomExitSurvey.postCount + localSurveyPostCount);
// ライブ更新で受信した投稿（load 由来の data.posts とは別に保持し、ID でマージする）
let extraPosts = $state<Post[]>([]);
let roomExperimentVisitId: string | null = null;
let roomExperimentHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
let roomExperimentExitSent = false;
let mobileViewportQuery: MediaQueryList | null = null;

function getRoomExperimentVisitStorageKey(sessionId: string) {
	return `room-experiment-visit:${sessionId}`;
}

const allPosts = $derived.by(() => {
	if (extraPosts.length === 0) return data.posts;
	const seen = new Set(data.posts.map((p) => p.id));
	const fresh = extraPosts.filter((p) => !seen.has(p.id));
	if (fresh.length === 0) return data.posts;
	return [...data.posts, ...fresh].sort(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
	);
});

const displayedPosts = $derived(
	postOrder === "oldest"
		? allPosts
		: [...allPosts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
);

let fetchingLive = false;

// ライブ更新の接続状態(Realtime の購読状態 + 差分APIの成否)を畳み込んで表示に使う
let connection = $state(createRoomConnectionState());
// 手動再接続でチャンネルを張り直すためのトリガー。インクリメントすると購読 effect が再実行される
let realtimeGeneration = $state(0);
let reconnecting = $state(false);
const connectionPhase = $derived(deriveRoomConnectionPhase(connection, now));
const connectionLabel = $derived(ROOM_CONNECTION_PHASE_LABELS[connectionPhase]);
const connectionTone = $derived(ROOM_CONNECTION_PHASE_TONES[connectionPhase]);
const connectionNeedsAttention = $derived(shouldOfferManualReconnect(connectionPhase));
const lastUpdateLabel = $derived(formatRelativeTime(connection.lastSuccessAt, now));

function dispatchConnection(event: RoomConnectionEvent) {
	// effect 内(購読コールバックや初回取得)から呼ばれても connection を依存に登録しない
	connection = untrack(() => reduceRoomConnection(connection, event));
}

function getRoomExperimentClientVisitKey(sessionId: string) {
	const storageKey = getRoomExperimentVisitStorageKey(sessionId);
	const existingKey = sessionStorage.getItem(storageKey);
	if (existingKey) return existingKey;
	const generatedKey = crypto.randomUUID();
	sessionStorage.setItem(storageKey, generatedKey);
	return generatedKey;
}

function clearRoomExperimentHeartbeatTimer() {
	if (!roomExperimentHeartbeatTimer) return;
	clearInterval(roomExperimentHeartbeatTimer);
	roomExperimentHeartbeatTimer = undefined;
}

async function startRoomExperimentTracking() {
	const sessionId = data.roomExperiment?.sessionId;
	if (!data.user || !data.roomExperiment?.enabled || !sessionId) return;
	try {
		const res = await fetch("/api/room-experiment-visits", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				...(data.room.kind === "event" ? { event_id: sessionId } : { session_id: sessionId }),
				client_visit_key: getRoomExperimentClientVisitKey(sessionId),
			}),
		});
		if (res.status === 204 || !res.ok) return;
		const body = (await res.json()) as {
			visit_id?: string;
			heartbeat_interval_ms?: number;
		};
		if (!body.visit_id) return;
		roomExperimentVisitId = body.visit_id;
		roomExperimentExitSent = false;
		const intervalMs = body.heartbeat_interval_ms ?? 30_000;
		clearRoomExperimentHeartbeatTimer();
		roomExperimentHeartbeatTimer = setInterval(() => void sendRoomExperimentHeartbeat(), intervalMs);
	} catch {
		// Tracking is best-effort and must not affect room viewing.
	}
}

async function sendRoomExperimentHeartbeat() {
	if (!roomExperimentVisitId || roomExperimentExitSent) return;
	try {
		await fetch(`/api/room-experiment-visits/${roomExperimentVisitId}/heartbeat`, { method: "POST" });
	} catch {
		// Best-effort.
	}
}

// 退出ビーコンの送信のみを担う。sessionStorage のキー削除はここでは行わない:
// アプリ内遷移(onDestroy)や一時的な pagehide でも呼ばれるため、キーを残しておき、
// 同一タブで戻ってきたときに同じ visit 行を再利用できるようにする。
// 明示的な退出(退出ボタン→leaveRoom)でのみ clearRoomExperimentVisitKey() でキーを破棄する。
function sendRoomExperimentExit() {
	if (!roomExperimentVisitId || roomExperimentExitSent) return;
	roomExperimentExitSent = true;
	clearRoomExperimentHeartbeatTimer();
	const url = `/api/room-experiment-visits/${roomExperimentVisitId}/exit`;
	if (typeof navigator === "undefined") return;
	if (navigator.sendBeacon?.(url)) return;
	void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
}

// 明示退出時のみ visit キーを破棄する。次回入場は新しい visit として扱われる。
// 一時離席(アプリ内遷移)ではキーを残すため、再入場は同じ visit 行に集約される。
function clearRoomExperimentVisitKey() {
	const sessionId = data.roomExperiment?.sessionId;
	if (sessionId) sessionStorage.removeItem(getRoomExperimentVisitStorageKey(sessionId));
}

function getStayedSeconds() {
	return Math.max(0, Math.floor((Date.now() - enteredAt) / 1000));
}

function shouldShowExitSurvey() {
	if (surveyHandled) return false;
	if (!data.user) return false;
	if (!data.roomExitSurvey.experimentRunId) return false;
	if (data.roomExitSurvey.alreadyAnswered) return false;
	return getStayedSeconds() >= 180 || surveyPostCount >= 1;
}

async function leaveRoom() {
	clearRoomExperimentVisitKey();
	sendRoomExperimentExit();
	await goto("/");
}

async function handleExitRoom() {
	if (shouldShowExitSurvey()) {
		surveyErrorMessage = null;
		surveyOpen = true;
		return;
	}
	surveyHandled = true;
	await leaveRoom();
}

type RoomExitSurveySubmitAnswers = {
	overallRating: number;
	sharedExperienceRating: number;
	readabilityRating: number;
	nextParticipation: RoomExitSurveyNextParticipation;
	comparisonWithX: RoomExitSurveyComparisonWithX;
	goodPoints: string | null;
	improvementPoints: string | null;
};

async function postRoomExitSurvey(action: "submit" | "skip", answers?: RoomExitSurveySubmitAnswers) {
	const res = await fetch("/api/room-exit-surveys", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			action,
			anime_id: data.anime?.id ?? null,
			...(data.room.kind === "event"
				? { event_id: data.room.session_id }
				: { broadcast_room_session_id: data.room.session_id }),
			experiment_run_id: data.roomExitSurvey.experimentRunId,
			survey_version: data.roomExitSurvey.surveyVersion,
			stayed_seconds: getStayedSeconds(),
			post_count: surveyPostCount,
			...(answers ? { answers } : {}),
		}),
	});
	if (!res.ok) throw new Error(`room exit survey failed: ${res.status}`);
}

async function handleSurveySubmit(answers: RoomExitSurveySubmitAnswers) {
	if (surveySubmitting) return;
	surveySubmitting = true;
	surveyErrorMessage = null;
	try {
		await postRoomExitSurvey("submit", answers);
		surveyHandled = true;
		surveyOpen = false;
		await leaveRoom();
	} catch (error) {
		console.error("room exit survey submit failed:", error);
		surveyErrorMessage = "送信に失敗しました。通信状況を確認してもう一度お試しください。";
	} finally {
		surveySubmitting = false;
	}
}

async function handleSurveySkip() {
	if (surveySubmitting) return;
	surveySubmitting = true;
	surveyErrorMessage = null;
	try {
		await postRoomExitSurvey("skip");
	} catch (error) {
		console.error("room exit survey skip failed:", error);
	} finally {
		surveyHandled = true;
		surveySubmitting = false;
		surveyOpen = false;
		await leaveRoom();
	}
}

function handleRoomExperimentPageHide(event: PageTransitionEvent) {
	if (event.persisted) {
		clearRoomExperimentHeartbeatTimer();
		return;
	}
	sendRoomExperimentExit();
}

function handleRoomExperimentPageShow(event: PageTransitionEvent) {
	if (event.persisted) void startRoomExperimentTracking();
}

function shouldAutoFocusComposer() {
	return !("ontouchstart" in window) && navigator.maxTouchPoints === 0;
}

function canAutoRefocusComposer() {
	if (!shouldAutoFocusComposer() || !keepComposerFocused) return false;
	const activeElement = document.activeElement;
	return (
		!activeElement ||
		activeElement === document.body ||
		activeElement === textareaEl ||
		(composerEl?.contains(activeElement) ?? false)
	);
}

async function focusComposerTextarea(options: FocusOptions = {}) {
	if (!canAutoRefocusComposer()) return;
	await tick();
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
	textareaEl?.focus(options);
}

function handleWindowPointerDown(event: PointerEvent) {
	const target = event.target;
	if (!(target instanceof Node)) return;
	if (target === textareaEl) {
		keepComposerFocused = true;
		return;
	}
	const targetElement = target instanceof Element ? target : target.parentElement;
	if (composerEl?.contains(target) && targetElement?.closest('button[type="submit"]')) return;
	keepComposerFocused = false;
}

const handleCreatePost: SubmitFunction = ({ cancel }) => {
	if (isPosting) {
		cancel();
		return;
	}
	isPosting = true;
	keepComposerFocused = true;
	return async ({ result, update }) => {
		try {
			// invalidateAll は load 全体の再実行で重いため、自分の投稿はライブ更新と同じ差分APIで反映する
			await update({ reset: false, invalidateAll: false });
			if (result.type === "success") {
				localSurveyPostCount += 1;
				await fetchNewPosts();
			}
		} finally {
			isPosting = false;
		}
		await focusComposerTextarea({ preventScroll: true });
	};
};

/** ルーム種別に応じたライブ差分取得エンドポイントのクエリパラメータ名を返す */
function liveDiffQueryParam() {
	return data.room.kind === "event" ? "event_id" : "session_id";
}

/**
 * 最後に受信した投稿以降の差分を取得して extraPosts に追加する。
 * 成否は接続状態に反映し、非成功応答・例外・タイムアウトを「更新失敗」として画面に伝える。
 * since は最後の投稿の created_at より後(gt)を返すため、復旧後も ID の重複チェックと合わせて
 * 取りこぼし・二重表示なく追いつける。
 */
async function fetchNewPosts() {
	if (fetchingLive) return;
	fetchingLive = true;
	dispatchConnection({ type: "fetch_start" });
	try {
		const last = allPosts[allPosts.length - 1];
		const params = new URLSearchParams({ [liveDiffQueryParam()]: data.room.session_id });
		if (last) params.set("since", last.created_at);
		// ハングした fetch が fetchingLive を握り続けてポーリングを塞がないようタイムアウトを付ける
		const res = await fetch(`/api/rooms/posts?${params}`, {
			signal: AbortSignal.timeout(ROOM_LIVE_FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			dispatchConnection({ type: "fetch_failure", at: Date.now() });
			return;
		}
		const body = (await res.json()) as { posts: Post[] };
		dispatchConnection({ type: "fetch_success", at: Date.now() });
		if (body.posts.length === 0) return;
		const seen = new Set(allPosts.map((p) => p.id));
		const fresh = body.posts.filter((p) => !seen.has(p.id));
		if (fresh.length > 0) extraPosts = [...extraPosts, ...fresh];
	} catch {
		// ネットワークエラーは次回の受信/ポーリングで回復する。状態には失敗として残す
		dispatchConnection({ type: "fetch_failure", at: Date.now() });
	} finally {
		fetchingLive = false;
	}
}

/** 手動再接続: Realtime チャンネルを張り直し、差分APIを即時に叩いて追いつく */
async function handleManualReconnect() {
	if (reconnecting) return;
	reconnecting = true;
	try {
		dispatchConnection({ type: "reconnect" });
		realtimeGeneration += 1;
		await fetchNewPosts();
	} finally {
		reconnecting = false;
	}
}

function handleOnline() {
	dispatchConnection({ type: "online" });
	// 回線復帰時は Realtime の再参加を待たずに差分を取りに行く
	if (status === "open") void fetchNewPosts();
}

function handleOffline() {
	dispatchConnection({ type: "offline" });
}

function handleVisibilityChange() {
	// バックグラウンドから戻ったとき、止まっていたポーリングを待たずに追いつく
	if (document.visibilityState === "visible" && status === "open") void fetchNewPosts();
}

const status = $derived.by<RoomStatus>(() => {
	if (now < openMs) return "not_open";
	if (now >= closeMs) return "ended";
	return "open";
});
const showLatestJumpButton = $derived(status === "open" && (!isFollowingLatest || unreadNewPostCount > 0));

onMount(() => {
	mobileViewportQuery = window.matchMedia("(max-width: 960px)");
	isMobileViewport = mobileViewportQuery.matches;
	mobileViewportQuery.addEventListener("change", handleMobileViewportChange);
	const virtualKeyboard = getVirtualKeyboard();
	if (virtualKeyboard) {
		previousVirtualKeyboardOverlaysContent = virtualKeyboard.overlaysContent;
		virtualKeyboard.overlaysContent = true;
	}
	removeRoomKeyboardListeners = installRoomKeyboardOffsetTracking();
	mounted = true;
	knownPostIds = new Set(allPosts.map((post) => post.id));
	intervalId = setInterval(() => {
		now = Date.now();
	}, 1000);
	if (status === "open" && data.posts.length > 0) {
		void focusLatestPost().then(() => focusComposerTextarea({ preventScroll: true }));
	} else {
		void focusComposerTextarea();
	}
	window.addEventListener("pointerdown", handleWindowPointerDown, true);
	window.addEventListener("pagehide", handleRoomExperimentPageHide);
	window.addEventListener("pageshow", handleRoomExperimentPageShow);
	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);
	document.addEventListener("visibilitychange", handleVisibilityChange);
	if (!navigator.onLine) dispatchConnection({ type: "offline" });
	void startRoomExperimentTracking();
});

onDestroy(() => {
	mobileViewportQuery?.removeEventListener("change", handleMobileViewportChange);
	removeRoomKeyboardListeners?.();
	const virtualKeyboard = getVirtualKeyboard();
	if (virtualKeyboard && previousVirtualKeyboardOverlaysContent !== undefined) {
		virtualKeyboard.overlaysContent = previousVirtualKeyboardOverlaysContent;
	}
	clearInterval(intervalId);

	clearRoomExperimentHeartbeatTimer();
	if (typeof window !== "undefined") {
		window.removeEventListener("pointerdown", handleWindowPointerDown, true);
		window.removeEventListener("pagehide", handleRoomExperimentPageHide);
		window.removeEventListener("pageshow", handleRoomExperimentPageShow);
		window.removeEventListener("online", handleOnline);
		window.removeEventListener("offline", handleOffline);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
	}
	sendRoomExperimentExit();
});

function handleMobileViewportChange(event: MediaQueryListEvent) {
	isMobileViewport = event.matches;
}

function getVirtualKeyboard() {
	return (navigator as Navigator & { virtualKeyboard?: { overlaysContent: boolean } }).virtualKeyboard;
}

function updateRoomKeyboardOffset() {
	const viewport = window.visualViewport;
	const offset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
	document.documentElement.style.setProperty("--room-keyboard-offset", `${Math.round(offset)}px`);
}

function installRoomKeyboardOffsetTracking() {
	updateRoomKeyboardOffset();
	window.addEventListener("resize", updateRoomKeyboardOffset);
	window.visualViewport?.addEventListener("resize", updateRoomKeyboardOffset);
	window.visualViewport?.addEventListener("scroll", updateRoomKeyboardOffset);
	return () => {
		window.removeEventListener("resize", updateRoomKeyboardOffset);
		window.visualViewport?.removeEventListener("resize", updateRoomKeyboardOffset);
		window.visualViewport?.removeEventListener("scroll", updateRoomKeyboardOffset);
		document.documentElement.style.removeProperty("--room-keyboard-offset");
	};
}

$effect(() => {
	if (form && "success" in form && form.success) {
		postContent = "";
	}
});

$effect(() => {
	if (!mounted || status !== "open") return;
	const freshCount = allPosts.filter((post) => !knownPostIds.has(post.id)).length;
	knownPostIds = new Set(allPosts.map((post) => post.id));
	if (freshCount === 0) return;
	if (isFollowingLatest) {
		unreadNewPostCount = 0;
		void focusLatestPost();
	} else {
		unreadNewPostCount += freshCount;
	}
});

// 受付中はライブ更新: Realtime の INSERT を購読し、受信をトリガーに差分APIを叩く。
// Realtime が無効な環境向けに低頻度ポーリングをフォールバックとして併用する。
// 購読状態はコールバックで接続状態に反映し、realtimeGeneration の更新で張り直せる。
$effect(() => {
	if (!mounted || status !== "open") return;
	// 手動再接続のトリガーを依存に含める(値自体は使わない)
	void realtimeGeneration;

	const filter =
		data.room.kind === "event"
			? `event_id=eq.${data.room.session_id}`
			: `broadcast_room_session_id=eq.${data.room.session_id}`;

	// クリーンアップ後に届く旧チャンネルの CLOSED を新しい状態に混ぜないためのフラグ
	let active = true;
	const channel = data.supabase
		.channel(`room-${data.room.session_id}`)
		.on(
			"postgres_changes",
			{
				event: "INSERT",
				schema: "public",
				table: "posts",
				filter,
			},
			() => void fetchNewPosts(),
		)
		.subscribe((subscribeStatus) => {
			if (!active) return;
			dispatchConnection({ type: "realtime", status: subscribeStatus });
		});
	const pollId = setInterval(() => void fetchNewPosts(), ROOM_LIVE_POLL_INTERVAL_MS);
	// 入室直後に一度取得して「最終更新」を確定させる(購読完了までの取りこぼしも拾う)。
	// allPosts 等を effect の依存にしないよう untrack で呼ぶ
	untrack(() => void fetchNewPosts());

	return () => {
		active = false;
		clearInterval(pollId);
		void data.supabase.removeChannel(channel);
	};
});

function isNearLatestEdge(order: PostOrder = postOrder) {
	if (!postListEl) return true;
	if (order === "newest") return postListEl.scrollTop <= latestEdgeThreshold;
	const distanceToBottom = postListEl.scrollHeight - (postListEl.scrollTop + postListEl.clientHeight);
	return distanceToBottom <= latestEdgeThreshold;
}

function handlePostListScroll() {
	if (!mounted || status !== "open") return;
	const nearLatest = isNearLatestEdge();
	isFollowingLatest = nearLatest;
	if (nearLatest) unreadNewPostCount = 0;
}

async function focusLatestPost(order: PostOrder = postOrder) {
	await tick();
	if (!postListEl || !isFollowingLatest) return;
	postListEl.scrollTo({ top: order === "oldest" ? postListEl.scrollHeight : 0, behavior: "instant" });
}

function setPostOrder(order: PostOrder) {
	postOrder = order;
	isFollowingLatest = true;
	unreadNewPostCount = 0;
	if (status === "open" && allPosts.length > 0) void focusLatestPost(order);
}

function resumeLatestFollow() {
	isFollowingLatest = true;
	unreadNewPostCount = 0;
	if (allPosts.length > 0) void focusLatestPost(postOrder);
}

function formatHMS(ms: number) {
	const totalSec = Math.floor(Math.abs(ms) / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const timerLabel = $derived.by(() => {
	if (isGlobalLobby) return "総合ロビーはいつでも投稿できます";
	if (status === "not_open") return `開場まで ${formatHMS(openMs - now)}`;
	if (status === "open" && now < scheduledMs) return `放送開始まで ${formatHMS(scheduledMs - now)}`;
	if (status === "open") return `投稿終了まで ${formatHMS(closeMs - now)}`;
	return "このルームは終了しました";
});

// 「◯分枠」表示は廃止: イレギュラー放送で枠が変動すると実態とズレるため放送局のみ
const broadcastMetaLine = $derived.by(() => {
	if (isGlobalLobby) return "";
	return data.anime?.broadcast_station?.filter(Boolean).join(" / ") ?? "";
});

function formatCompactDate(iso: string) {
	const date = new Date(iso);
	const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hour = String(date.getHours()).padStart(2, "0");
	const minute = String(date.getMinutes()).padStart(2, "0");
	return `${month}/${day}(${weekdays[date.getDay()]}) ${hour}:${minute}`;
}
</script>

<svelte:head> <title>{data.room.title} - Anipolis</title> </svelte:head>

<div class="page-container room-page-container">
	<div class="feed-column">
		<div class="room-mobile-bar">
			<div class="header-top-row">
				<span class="room-mobile-title">
					{#if data.anime}
						<a href="/anime/{data.anime.id}" class="anime-title-link">{data.anime.title}</a
						><span class="hierarchy-separator" aria-hidden="true"> ❯ </span
						><span class="room-name-label">{roomNameLabel}</span>
					{:else}
						{data.room.title}
					{/if}
				</span>
				{@render headerActions?.()}
				<button type="button" class="room-mobile-exit" onclick={handleExitRoom} aria-label="退出する">
					<span class="i-lucide-log-out" aria-hidden="true"></span>
					<span>退出</span>
				</button>
			</div>
			{#if !isGlobalLobby && status !== "ended"}
				<div class="header-bottom-row">
					<span class="room-mobile-timer event-timer--{status}">{timerLabel}</span>
				</div>
			{/if}
		</div>

		{#if data.user && status === "open"}
			<div class="card composer" bind:this={composerEl}>
				{#if form && "message" in form}
					<p class="form-error">{form.message}</p>
				{/if}
				<form method="POST" action="?/createPost" use:enhance={handleCreatePost}>
					<div class="composer-body">
						<textarea
							bind:this={textareaEl}
							class="composer-textarea room-composer-textarea"
							name="content"
							placeholder={isMobileViewport ? "いまの感想を投稿..." : "いまの感想を投稿... (Shift+Enterで改行)"}
							rows="1"
							aria-label="実況の投稿内容"
							use:autosize={postContent}
							enterkeyhint="send"
							bind:value={postContent}
							maxlength={maxLen}
							onfocus={() => {
								keepComposerFocused = true;
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
									e.preventDefault();
									if (!isPosting && !overLimit && postContent.trim()) {
										e.currentTarget.closest('form')?.requestSubmit();
									}
								}
							}}
						></textarea>
						<div class="composer-footer">
							{#if charCount >= maxLen - 40}
								<span class="char-count {overLimit ? 'char-count--over' : ''}"
									>{charCount}/{maxLen}</span
								>
							{/if}
							<button
								type="submit"
								class="btn btn-primary btn-sm"
								disabled={isPosting || overLimit || !postContent.trim()}
							>
								{isPosting ? "投稿中..." : "投稿"}
							</button>
						</div>
					</div>
				</form>
			</div>
		{:else if !data.user && status === "open"}
			<div class="card anime-room-login">
				<a href="/auth" class="btn btn-primary">ログインして参加</a>
			</div>
		{:else if status === "not_open"}
			<div class="card anime-room-login">投稿受付は放送開始{openLeadMinutes}分前から始まります。</div>
		{:else}
			<div class="card anime-room-login">
				このルームの投稿受付は終了しました。
				{#if data.anime}
					<a href="/?quote_anime={data.anime.id}">引用投稿で感想を残す</a>
				{/if}
			</div>
		{/if}

		<div class="event-posts-header">
			<span class="event-posts-count">{allPosts.length}件の実況</span>
			{#if status === "open"}
				<div class="room-connection room-connection--{connectionTone}">
					<span class="room-connection-status">
						<span class="room-connection-dot" aria-hidden="true"></span>
						<!-- 状態変化のみ読み上げる。毎秒変わる「最終更新」は live region に含めない -->
						<span class="room-connection-label" role="status" aria-live="polite" aria-atomic="true"
							>{connectionLabel}</span
						>
						<span class="room-connection-updated">最終更新 {lastUpdateLabel}</span>
					</span>
					<button
						type="button"
						class="room-connection-reconnect"
						class:room-connection-reconnect--attention={connectionNeedsAttention}
						onclick={handleManualReconnect}
						disabled={reconnecting}
						aria-label="再接続して最新の投稿を取得"
						title="再接続して最新の投稿を取得"
					>
						<span
							class="i-lucide-refresh-cw"
							class:room-connection-spin={reconnecting}
							aria-hidden="true"
						></span>
						<span>{reconnecting ? "再接続中" : "再接続"}</span>
					</button>
				</div>
			{/if}
		</div>

		<div class="room-order-toggle" role="group" aria-label="投稿の表示順">
			<button
				type="button"
				class:active={postOrder === "oldest"}
				aria-pressed={postOrder === "oldest"}
				onclick={() => setPostOrder("oldest")}
			>
				時系列順
			</button>
			<button
				type="button"
				class:active={postOrder === "newest"}
				aria-pressed={postOrder === "newest"}
				onclick={() => setPostOrder("newest")}
			>
				新しい順
			</button>
		</div>

		<div class="room-post-list-shell">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region supports keyboard scrolling.) -->
			<div
				class="room-post-list scrollbar-thin-muted"
				role="region"
				aria-label="実況タイムライン"
				tabindex="0"
				bind:this={postListEl}
				onscroll={handlePostListScroll}
				use:timelineScroll={{ following: isFollowingLatest, newestFirst: postOrder === "newest" }}
			>
				<div class="room-post-list-content">
					{#if allPosts.length === 0}
						<div class="card anime-room-empty">まだ投稿はありません。最初の感想を残しましょう。</div>
					{:else}
						{#each displayedPosts as post, index (post.id)}
							<div class="anime-room-post" data-post-id={post.id}>
								<LiveRoomPostCard
									{post}
									continuation={isPostContinuation(post, displayedPosts[index - 1])}
									currentUserId={data.user?.id ?? null}
									broadcastStartAt={data.room.scheduled_at}
									timelineTimeMode={isGlobalLobby}
								/>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			{#if showLatestJumpButton}
				<button
					type="button"
					class="new-posts-badge"
					onclick={resumeLatestFollow}
					aria-label="最新の投稿へ移動"
				>
					{#if postOrder === "oldest"}
						<span class="i-lucide-arrow-down latest-jump-icon" aria-hidden="true"></span>
					{:else}
						<span class="i-lucide-arrow-up latest-jump-icon" aria-hidden="true"></span>
					{/if}
					{#if unreadNewPostCount > 0}
						<span class="new-posts-count">新着 {unreadNewPostCount}件</span>
					{:else}
						<span>最新へ</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<aside class="sidebar-column scrollbar-thin-muted">
		<div class="room-summary-card mb-4 p-4">
			<div class="flex items-start">
				{#if data.anime}
					<a href="/anime/{data.anime.id}" class="shrink-0" aria-label="アニメ詳細を開く">
						{#if data.anime.cover_url}
							<img
								src={coverThumbSrc(data.anime.cover_url)}
								{@attach coverThumbFallback(data.anime.cover_url)}
								alt={data.anime.title}
								class="block w-16 rounded-lg shadow-md"
							>
						{:else}
							<div class="room-summary-placeholder h-20 w-16 rounded-lg border shadow-md"></div>
						{/if}
					</a>
				{:else}
					<div class="room-summary-placeholder h-20 w-16 rounded-lg border shadow-md shrink-0"></div>
				{/if}
				<div class="flex min-h-20 min-w-0 flex-1 flex-col justify-between pl-3">
					<div class="min-w-0">
						<h1 class="room-summary-title text-sm font-bold">
							{#if data.anime}
								<a href="/anime/{data.anime.id}" class="anime-title-link">{data.anime.title}</a
								><span class="hierarchy-separator" aria-hidden="true"> ❯ </span
								><span class="room-name-label">{roomNameLabel}</span>
							{:else}
								{data.room.title}
							{/if}
						</h1>
						{#if !isGlobalLobby}
							<div class="mt-2 flex min-w-0 items-center gap-2">
								{#if status === "ended"}
									<span class="room-summary-status rounded px-1.5 py-0.5 text-[10px] font-bold"
										>終了</span
									>
								{/if}
								<time class="room-summary-secondary truncate text-xs"
									>{formatCompactDate(data.room.scheduled_at)}</time
								>
							</div>
						{/if}
						{#if broadcastMetaLine}
							<div class="room-summary-muted mt-1 truncate text-xs">{broadcastMetaLine}</div>
						{/if}
					</div>
					<div class="mt-2 flex items-center justify-end gap-2">
						{@render headerActions?.()}
						<button
							type="button"
							class="room-summary-exit shrink-0 text-xs transition-colors"
							onclick={handleExitRoom}
						>
							退出する
						</button>
						<a href="/schedule" class="room-summary-back shrink-0 text-xs transition-colors">
							← 週間スケジュールへ戻る
						</a>
					</div>
				</div>
			</div>
		</div>

		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

{#if surveyOpen}
	<ExitSurveyModal
		submitting={surveySubmitting}
		errorMessage={surveyErrorMessage}
		onSubmit={handleSurveySubmit}
		onSkip={handleSurveySkip}
	/>
{/if}

<style>
.room-summary-card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
}

.room-summary-placeholder {
	background: var(--color-surface-hover);
	border-color: var(--color-border);
}

.room-summary-title {
	display: inline-flex;
	align-items: center;
	min-width: 0;
	overflow: hidden;
	color: var(--color-text);
}

.room-name-label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}

.anime-title-link {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
	text-decoration: none;
	color: inherit;
	padding: 4px 2px;
	margin: -4px -2px;
	transition: opacity 0.2s;
}

.anime-title-link:hover,
.anime-title-link:active {
	opacity: 0.7;
}

.hierarchy-separator {
	flex-shrink: 0;
	font-size: 0.85em;
	color: var(--color-text-muted);
	margin: 0 4px;
}

.room-summary-status {
	background: var(--color-surface-hover);
	color: var(--color-text-secondary);
}

.room-summary-secondary {
	color: var(--color-text-secondary);
}

.room-summary-muted,
.room-summary-exit {
	color: var(--color-text-muted);
}

.room-summary-exit {
	border: 0;
	background: transparent;
	padding: 0;
	font: inherit;
	cursor: pointer;
}

.room-summary-back {
	display: none;
}

.room-summary-exit:hover {
	color: var(--color-accent-hover);
}

.room-page-container {
	max-width: none;
	height: 100vh;
	margin: 0;
	align-items: stretch;
	overflow: hidden;
	padding-right: max(24px, env(safe-area-inset-right));
	padding-bottom: 24px;
	padding-left: 20px;
}

.room-page-container > .feed-column {
	display: flex;
	flex: 1 1 var(--feed-width);
	height: 100%;
	min-height: 0;
	overflow: hidden;
	flex-direction: column;
}

.room-page-container > .sidebar-column {
	flex: 0 0 var(--sidebar-width);
	max-height: 100%;
	overflow-x: hidden;
	overflow-y: auto;
	padding-bottom: 24px;
}

.room-mobile-bar {
	order: 0;
}

.event-posts-header,
.room-order-toggle {
	order: 1;
	flex: 0 0 auto;
}

.room-post-list-shell {
	position: relative;
	order: 2;
	flex: 1 1 auto;
	min-height: 0;
}

.room-post-list {
	height: 100%;
	min-height: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	overflow-anchor: none;
}

.new-posts-badge {
	position: absolute;
	left: 50%;
	bottom: 12px;
	z-index: 4;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 40px;
	min-height: 40px;
	max-width: calc(100% - 32px);
	padding: 8px 12px;
	border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
	border-radius: 999px;
	corner-shape: round;
	background: color-mix(in srgb, var(--color-surface) 92%, var(--color-primary));
	box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
	color: var(--color-primary);
	font-size: 13px;
	font-weight: 700;
	line-height: 1.2;
	transform: translateX(-50%);
	animation: new-posts-pop 160ms ease-out;
}

.new-posts-badge:hover {
	background: color-mix(in srgb, var(--color-surface) 84%, var(--color-primary));
}

.new-posts-count {
	display: grid;
	min-width: 20px;
	height: 20px;
	place-items: center;
	padding: 0 6px;
	border-radius: 999px;
	corner-shape: round;
	background: var(--color-primary);
	color: white;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}

.latest-jump-icon {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

@keyframes new-posts-pop {
	from {
		opacity: 0;
		transform: translate(-50%, 8px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: translate(-50%, 0) scale(1);
	}
}

/* ── ライブ更新の接続状態 ── */
.event-posts-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px 12px;
}

.room-connection {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 10px;
	min-width: 0;
	font-size: 12px;
	line-height: 1.2;
	color: var(--color-text-muted);
}

.room-connection-status {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.room-connection-dot {
	width: 8px;
	height: 8px;
	flex-shrink: 0;
	border-radius: 999px;
	corner-shape: round;
	background: var(--color-text-muted);
}

.room-connection--ok .room-connection-dot {
	background: #22c55e;
}

.room-connection--pending .room-connection-dot {
	background: #f59e0b;
	animation: room-connection-pulse 1.2s ease-in-out infinite;
}

.room-connection--warn .room-connection-dot {
	background: #f59e0b;
}

.room-connection--error .room-connection-dot {
	background: #ef4444;
}

.room-connection--warn .room-connection-label,
.room-connection--error .room-connection-label {
	color: var(--color-text);
	font-weight: 600;
}

.room-connection-updated {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.room-connection-reconnect {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-height: 28px;
	padding: 4px 8px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	corner-shape: round;
	background: var(--color-surface);
	color: var(--color-text-muted);
	font: inherit;
	font-size: 12px;
	font-weight: 600;
	line-height: 1;
	cursor: pointer;
	transition:
		color 0.2s,
		border-color 0.2s,
		background-color 0.2s;
}

.room-connection-reconnect:hover:not(:disabled) {
	color: var(--color-accent-hover);
	border-color: var(--color-accent-hover);
}

.room-connection-reconnect:disabled {
	cursor: default;
	opacity: 0.7;
}

.room-connection-reconnect--attention {
	color: var(--color-primary);
	border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
	background: color-mix(in srgb, var(--color-surface) 92%, var(--color-primary));
}

.room-connection-reconnect .i-lucide-refresh-cw {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

.room-connection-spin {
	animation: room-connection-rotate 1s linear infinite;
}

@keyframes room-connection-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.35;
	}
}

@keyframes room-connection-rotate {
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.room-connection--pending .room-connection-dot,
	.room-connection-spin {
		animation: none;
	}
}

.room-order-toggle {
	display: inline-flex;
	align-self: flex-start;
	gap: 2px;
	padding: 3px;
	margin: -4px 0 10px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
}

.room-order-toggle button {
	min-width: 78px;
	padding: 6px 10px;
	border-radius: 6px;
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 600;
	line-height: 1.2;
}

.room-order-toggle button.active {
	background: var(--color-accent);
	color: white;
}

/* Shared room context remains above the reaction log at every viewport. */
.room-mobile-bar {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	margin-bottom: 12px;
	background: transparent;
	border: 0;
	border-bottom: 1px solid var(--color-border);
	border-radius: 0;
	overflow: hidden;
}
.header-top-row,
.header-bottom-row {
	display: flex;
	width: 100%;
	min-width: 0;
}
.header-top-row {
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}
.header-bottom-row {
	align-items: center;
}
.room-mobile-title {
	display: inline-flex;
	align-items: center;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-text);
	overflow: hidden;
	white-space: nowrap;
	flex: 1;
	min-width: 0;
}
.room-mobile-timer {
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-muted);
	white-space: nowrap;
	line-height: 1.2;
}
.room-mobile-exit {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
	border: 0;
	background: transparent;
	color: var(--color-text-muted);
	font: inherit;
	font-size: 12px;
	font-weight: 700;
	cursor: pointer;
}
.room-mobile-exit:hover {
	color: var(--color-accent-hover);
}
.room-mobile-timer.event-timer--open {
	color: var(--color-primary);
	font-weight: 600;
}

/* ── ログイン/空状態 ── */
.anime-room-login,
.anime-room-empty {
	text-align: center;
	color: var(--color-text-muted);
	padding: 24px;
}

/* ── スケジュールへ戻るボタン ── */
.feed-column > .composer,
.feed-column > .anime-room-login {
	order: 3;
	position: relative;
	z-index: 2;
	flex: 0 0 auto;
	margin-top: 12px;
}

.feed-column > .composer,
.feed-column > .anime-room-login {
	margin-bottom: 24px;
}

@media (max-width: 960px) {
	.room-page-container {
		height: calc(100vh - 52px);
		padding-right: 12px;
		padding-bottom: calc(80px + env(safe-area-inset-bottom));
		padding-left: 12px;
	}

	.room-page-container > .feed-column {
		flex: 1 1 auto;
	}

	.room-mobile-bar {
		display: flex;
	}

	.room-page-container .room-post-list {
		padding-bottom: 14px;
	}

	.room-page-container .new-posts-badge {
		bottom: 8px;
	}

	.room-page-container .feed-column > .composer {
		margin-top: 8px;
		margin-bottom: 0;
		padding: 8px 10px;
		border-radius: 6px;
		transform: translateY(calc(0px - max(env(keyboard-inset-height, 0px), var(--room-keyboard-offset, 0px))));
		transition: transform 160ms ease;
		will-change: transform;
	}

	:global(html.room-scroll-lock .mobile-bottom-nav) {
		transform: translateY(max(env(keyboard-inset-height, 0px), var(--room-keyboard-offset, 0px)));
		transition: transform 160ms ease;
		will-change: transform;
	}

	.room-page-container .composer form,
	.room-page-container .composer-body {
		min-width: 0;
		width: 100%;
	}

	.room-page-container .composer-body {
		align-items: center;
		gap: 8px;
	}

	.room-page-container .composer-textarea {
		min-height: 24px;
		max-height: 80px;
		height: 24px;
		line-height: 1.5;
		font-size: 15px;
		overflow-y: auto;
	}

	.room-page-container .composer-footer {
		flex: 0 0 auto;
		gap: 8px;
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}

	.room-page-container .composer-footer .char-count {
		font-size: 12px;
		line-height: 1;
	}

	.room-page-container .composer-footer .btn {
		min-height: 32px;
		padding: 6px 12px;
		white-space: nowrap;
	}
}

@supports (height: 100svh) {
	.room-page-container {
		height: 100svh;
	}

	@media (max-width: 960px) {
		.room-page-container {
			height: calc(100svh - 52px);
		}
	}
}

@media (max-width: 480px) {
	.room-page-container {
		padding-right: 8px;
		padding-left: 8px;
	}
}

@media (max-width: 375px) {
	.room-page-container {
		padding-right: 6px;
		padding-left: 6px;
	}
}

.room-page-container .composer {
	padding: 10px 12px;
	border: 0;
	border-top: 1px solid var(--color-border);
	border-radius: 0;
	background: var(--color-bg);
	margin: 0;
}
.room-page-container .composer-body {
	align-items: flex-end;
	gap: 8px;
}
.room-page-container .composer-textarea {
	min-height: 36px;
	max-height: 144px;
	padding: 6px 0;
	height: auto;
	font-size: 15px;
	line-height: 24px;
}
.room-page-container .composer-footer {
	margin: 0;
	padding: 0;
	border: 0;
	gap: 8px;
}
.room-page-container .composer-footer .btn {
	min-height: 36px;
}
.room-mobile-bar {
	display: flex;
	padding: 12px;
	border-bottom: 1px solid var(--color-border);
}
.room-summary-card {
	box-shadow: none;
	border: 0;
	border-radius: 0;
}
@media (min-width: 961px) and (max-width: 1160px) {
	.room-page-container > .sidebar-column {
		display: none;
	}
}
</style>
