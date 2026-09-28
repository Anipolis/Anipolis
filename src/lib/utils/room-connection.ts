/**
 * 実況ルームのライブ更新の接続状態を扱う純粋ロジック。
 *
 * LiveRoomView は Realtime(INSERT 購読)と差分API(ポーリング/受信トリガー)の
 * 2系統で更新しており、どちらが止まっても「誰も投稿していない」ように見えてしまう。
 * ここでは両系統の結果をイベントとして畳み込み、表示用の状態
 * (接続中/再接続中/定期更新中/更新失敗/停止/オフライン)と最終更新の相対表示を導出する。
 */

/** Supabase Realtime の subscribe コールバックが返す状態 */
export type RealtimeSubscribeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export type RealtimeLinkState = "idle" | "subscribed" | "reconnecting" | "closed";

export type RoomConnectionState = {
	realtime: RealtimeLinkState;
	/** 差分APIが最後に成功した時刻(ms)。未成功なら null */
	lastSuccessAt: number | null;
	/** 差分APIが最後に失敗した時刻(ms)。未失敗なら null */
	lastFailureAt: number | null;
	/** 直近の連続失敗回数。成功でリセットする */
	consecutiveFailures: number;
	/** 差分APIを実行中か */
	fetching: boolean;
	/** navigator.onLine 相当。不明な環境では true として扱う */
	online: boolean;
};

export type RoomConnectionEvent =
	| { type: "realtime"; status: RealtimeSubscribeStatus }
	| { type: "fetch_start" }
	| { type: "fetch_success"; at: number }
	| { type: "fetch_failure"; at: number }
	| { type: "online" }
	| { type: "offline" }
	| { type: "reconnect" };

export type RoomConnectionPhase =
	| "connecting"
	| "connected"
	| "reconnecting"
	| "polling"
	| "stale"
	| "failed"
	| "offline";

/** ポーリング間隔(ms)。LiveRoomView の setInterval と揃える */
export const ROOM_LIVE_POLL_INTERVAL_MS = 15_000;
/** 差分APIの1回あたりのタイムアウト(ms)。ハングした fetch がポーリングを塞がないようにする */
export const ROOM_LIVE_FETCH_TIMEOUT_MS = 10_000;
/** 最終更新からこの時間を超えて成功がなければ「停止」とみなす(ポーリング3回分) */
export const ROOM_LIVE_STALE_AFTER_MS = ROOM_LIVE_POLL_INTERVAL_MS * 3;

export function createRoomConnectionState(online = true): RoomConnectionState {
	return {
		realtime: "idle",
		lastSuccessAt: null,
		lastFailureAt: null,
		consecutiveFailures: 0,
		fetching: false,
		online,
	};
}

/** subscribe コールバックの状態を接続リンクの状態へ対応付ける。
 * realtime-js はエラー/タイムアウト後に自動で再参加を試みるため「再接続中」として扱う */
const REALTIME_STATUS_TO_LINK_STATE: Record<RealtimeSubscribeStatus, RealtimeLinkState> = {
	SUBSCRIBED: "subscribed",
	CHANNEL_ERROR: "reconnecting",
	TIMED_OUT: "reconnecting",
	CLOSED: "closed",
};

/** イベントを畳み込んで次の状態を返す(不変更新) */
export function reduceRoomConnection(state: RoomConnectionState, event: RoomConnectionEvent): RoomConnectionState {
	switch (event.type) {
		case "realtime":
			return { ...state, realtime: REALTIME_STATUS_TO_LINK_STATE[event.status] };
		case "fetch_start":
			return { ...state, fetching: true };
		case "fetch_success":
			return { ...state, fetching: false, lastSuccessAt: event.at, consecutiveFailures: 0 };
		case "fetch_failure":
			return {
				...state,
				fetching: false,
				lastFailureAt: event.at,
				consecutiveFailures: state.consecutiveFailures + 1,
			};
		case "online":
			return { ...state, online: true };
		case "offline":
			return { ...state, online: false };
		case "reconnect":
			// 手動再接続: チャンネルを張り直すので Realtime は未接続に戻し、失敗回数もリセットする
			return { ...state, realtime: "idle", consecutiveFailures: 0 };
	}
}

/** 最終更新から一定時間成功がないか */
export function isRoomUpdateStale(
	state: RoomConnectionState,
	now: number,
	staleAfterMs = ROOM_LIVE_STALE_AFTER_MS,
): boolean {
	if (state.lastSuccessAt === null) return false;
	return now - state.lastSuccessAt > staleAfterMs;
}

/** 状態から表示用のフェーズを導出する */
export function deriveRoomConnectionPhase(
	state: RoomConnectionState,
	now: number,
	staleAfterMs = ROOM_LIVE_STALE_AFTER_MS,
): RoomConnectionPhase {
	if (!state.online) return "offline";
	if (state.consecutiveFailures > 0) return "failed";
	if (isRoomUpdateStale(state, now, staleAfterMs)) return "stale";
	switch (state.realtime) {
		case "subscribed":
			return "connected";
		case "reconnecting":
			return "reconnecting";
		case "closed":
			return "polling";
		case "idle":
			// Realtime が未接続でも差分APIが成功していればポーリングで追従できている
			return state.lastSuccessAt === null ? "connecting" : "polling";
	}
}

export type RoomConnectionTone = "ok" | "pending" | "warn" | "error";

export const ROOM_CONNECTION_PHASE_LABELS: Record<RoomConnectionPhase, string> = {
	connecting: "接続中…",
	connected: "ライブ接続中",
	reconnecting: "再接続中…",
	polling: "定期更新中",
	stale: "更新が止まっています",
	failed: "更新に失敗しました",
	offline: "オフライン",
};

export const ROOM_CONNECTION_PHASE_TONES: Record<RoomConnectionPhase, RoomConnectionTone> = {
	connecting: "pending",
	connected: "ok",
	reconnecting: "pending",
	polling: "ok",
	stale: "warn",
	failed: "error",
	offline: "error",
};

/** 手動の再接続ボタンを目立たせるべきフェーズか */
export function shouldOfferManualReconnect(phase: RoomConnectionPhase): boolean {
	return phase === "stale" || phase === "failed" || phase === "reconnecting" || phase === "offline";
}

/** 「最終更新 x秒前」用の相対時刻表示 */
export function formatRelativeTime(at: number | null, now: number): string {
	if (at === null) return "未受信";
	const diffSec = Math.max(0, Math.floor((now - at) / 1000));
	if (diffSec < 5) return "たった今";
	if (diffSec < 60) return `${diffSec}秒前`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}分前`;
	const diffHour = Math.floor(diffMin / 60);
	return `${diffHour}時間前`;
}
