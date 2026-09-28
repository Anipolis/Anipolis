import { describe, expect, it } from "vitest";
import {
	createRoomConnectionState,
	deriveRoomConnectionPhase,
	formatRelativeTime,
	isRoomUpdateStale,
	ROOM_LIVE_STALE_AFTER_MS,
	type RoomConnectionEvent,
	type RoomConnectionState,
	reduceRoomConnection,
	shouldOfferManualReconnect,
} from "./room-connection";

function apply(events: RoomConnectionEvent[], initial = createRoomConnectionState()): RoomConnectionState {
	return events.reduce(reduceRoomConnection, initial);
}

describe("reduceRoomConnection", () => {
	it("tracks realtime subscribe statuses", () => {
		expect(apply([{ type: "realtime", status: "SUBSCRIBED" }]).realtime).toBe("subscribed");
		expect(apply([{ type: "realtime", status: "CHANNEL_ERROR" }]).realtime).toBe("reconnecting");
		expect(apply([{ type: "realtime", status: "TIMED_OUT" }]).realtime).toBe("reconnecting");
		expect(apply([{ type: "realtime", status: "CLOSED" }]).realtime).toBe("closed");
	});

	it("records fetch outcomes and resets the failure streak on success", () => {
		const failing = apply([
			{ type: "fetch_start" },
			{ type: "fetch_failure", at: 1_000 },
			{ type: "fetch_start" },
			{ type: "fetch_failure", at: 2_000 },
		]);
		expect(failing.fetching).toBe(false);
		expect(failing.consecutiveFailures).toBe(2);
		expect(failing.lastFailureAt).toBe(2_000);
		expect(failing.lastSuccessAt).toBeNull();

		const recovered = apply([{ type: "fetch_start" }, { type: "fetch_success", at: 3_000 }], failing);
		expect(recovered.consecutiveFailures).toBe(0);
		expect(recovered.lastSuccessAt).toBe(3_000);
		expect(recovered.lastFailureAt).toBe(2_000);
	});

	it("tracks online/offline and resets on manual reconnect", () => {
		const offline = apply([{ type: "realtime", status: "SUBSCRIBED" }, { type: "offline" }]);
		expect(offline.online).toBe(false);
		const back = apply([{ type: "online" }, { type: "fetch_failure", at: 10 }, { type: "reconnect" }], offline);
		expect(back.online).toBe(true);
		expect(back.realtime).toBe("idle");
		expect(back.consecutiveFailures).toBe(0);
	});

	it("does not mutate the previous state", () => {
		const before = createRoomConnectionState();
		const after = reduceRoomConnection(before, { type: "fetch_success", at: 5 });
		expect(before.lastSuccessAt).toBeNull();
		expect(after.lastSuccessAt).toBe(5);
	});
});

describe("deriveRoomConnectionPhase", () => {
	const now = 100_000;

	it("starts as connecting and becomes connected once subscribed", () => {
		expect(deriveRoomConnectionPhase(createRoomConnectionState(), now)).toBe("connecting");
		expect(deriveRoomConnectionPhase(apply([{ type: "realtime", status: "SUBSCRIBED" }]), now)).toBe("connected");
	});

	it("reports reconnecting while realtime retries and polling when realtime is closed or never joined", () => {
		expect(deriveRoomConnectionPhase(apply([{ type: "realtime", status: "CHANNEL_ERROR" }]), now)).toBe(
			"reconnecting",
		);
		expect(deriveRoomConnectionPhase(apply([{ type: "realtime", status: "CLOSED" }]), now)).toBe("polling");
		expect(deriveRoomConnectionPhase(apply([{ type: "fetch_success", at: now - 1_000 }]), now)).toBe("polling");
	});

	it("prioritises offline, then fetch failures, then staleness over the realtime link", () => {
		const healthy: RoomConnectionEvent[] = [
			{ type: "realtime", status: "SUBSCRIBED" },
			{ type: "fetch_success", at: now - 1_000 },
		];
		expect(deriveRoomConnectionPhase(apply([...healthy, { type: "offline" }]), now)).toBe("offline");
		expect(deriveRoomConnectionPhase(apply([...healthy, { type: "fetch_failure", at: now }]), now)).toBe("failed");

		const stale = apply([
			{ type: "realtime", status: "SUBSCRIBED" },
			{ type: "fetch_success", at: now - ROOM_LIVE_STALE_AFTER_MS - 1 },
		]);
		expect(deriveRoomConnectionPhase(stale, now)).toBe("stale");
		expect(
			deriveRoomConnectionPhase(
				apply([...healthy, { type: "offline" }, { type: "fetch_failure", at: now }]),
				now,
			),
		).toBe("offline");
	});
});

describe("isRoomUpdateStale", () => {
	it("is never stale before the first success and stale after the threshold", () => {
		expect(isRoomUpdateStale(createRoomConnectionState(), 1_000_000)).toBe(false);
		const state = apply([{ type: "fetch_success", at: 0 }]);
		expect(isRoomUpdateStale(state, ROOM_LIVE_STALE_AFTER_MS)).toBe(false);
		expect(isRoomUpdateStale(state, ROOM_LIVE_STALE_AFTER_MS + 1)).toBe(true);
		expect(isRoomUpdateStale(state, 3_000, 2_000)).toBe(true);
	});
});

describe("shouldOfferManualReconnect", () => {
	it("highlights the reconnect action only when updates are at risk", () => {
		expect(shouldOfferManualReconnect("connected")).toBe(false);
		expect(shouldOfferManualReconnect("polling")).toBe(false);
		expect(shouldOfferManualReconnect("connecting")).toBe(false);
		expect(shouldOfferManualReconnect("reconnecting")).toBe(true);
		expect(shouldOfferManualReconnect("stale")).toBe(true);
		expect(shouldOfferManualReconnect("failed")).toBe(true);
		expect(shouldOfferManualReconnect("offline")).toBe(true);
	});
});

describe("formatRelativeTime", () => {
	const now = 10 * 60 * 60 * 1000;

	it("formats seconds, minutes and hours in Japanese", () => {
		expect(formatRelativeTime(null, now)).toBe("未受信");
		expect(formatRelativeTime(now, now)).toBe("たった今");
		expect(formatRelativeTime(now - 4_999, now)).toBe("たった今");
		expect(formatRelativeTime(now - 5_000, now)).toBe("5秒前");
		expect(formatRelativeTime(now - 59_000, now)).toBe("59秒前");
		expect(formatRelativeTime(now - 60_000, now)).toBe("1分前");
		expect(formatRelativeTime(now - 59 * 60_000, now)).toBe("59分前");
		expect(formatRelativeTime(now - 2 * 60 * 60_000, now)).toBe("2時間前");
	});

	it("clamps future timestamps to now", () => {
		expect(formatRelativeTime(now + 30_000, now)).toBe("たった今");
	});
});
