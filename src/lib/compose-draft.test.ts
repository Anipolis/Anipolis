import { describe, expect, it } from "vitest";
import {
	COMPOSE_CONTEXT_CW_TTL_MS,
	COMPOSE_CONTEXT_ROOM_TTL_MS,
	clearComposeContext,
	clearComposeDraft,
	composeContextKey,
	composeDraftKey,
	createEmptyDraft,
	DRAFT_TTL_MS,
	type DraftStorage,
	isDraftEmpty,
	loadComposeContext,
	loadComposeDraft,
	parseComposeDraft,
	saveComposeContext,
	saveComposeDraft,
	serializeComposeDraft,
} from "./compose-draft";

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value);
		},
		removeItem: (key) => {
			data.delete(key);
		},
	};
}

const anime = { id: "a1", title: "葬送のフリーレン", title_en: "Frieren", cover_url: null };
const room = {
	id: "r1",
	anime_id: "a1",
	room_date: "2026-09-28",
	room_kind: "episode" as const,
	room_key: "a1:2026-09-28",
	scheduled_at: "2026-09-28T12:00:00Z",
	anime: { id: "a1", title: "葬送のフリーレン", cover_url: null },
};

describe("isDraftEmpty", () => {
	it("treats whitespace-only content without attachments as empty", () => {
		expect(isDraftEmpty({ ...createEmptyDraft(), content: "   " })).toBe(true);
	});

	it("is not empty with content, images, or a quoted anime", () => {
		expect(isDraftEmpty({ ...createEmptyDraft(), content: "感想" })).toBe(false);
		expect(isDraftEmpty({ ...createEmptyDraft(), imageUrls: ["/img.png"] })).toBe(false);
		expect(isDraftEmpty({ ...createEmptyDraft(), anime })).toBe(false);
	});

	it("does not keep a draft that only has CW or room selections", () => {
		expect(isDraftEmpty({ ...createEmptyDraft(), cwAnime: anime, room })).toBe(true);
	});
});

describe("serialize / parse", () => {
	it("round-trips every field", () => {
		const draft = { content: "感想 @alice", imageUrls: ["/a.png", "/b.png"], anime, cwAnime: anime, room };
		const raw = serializeComposeDraft(draft, 1_000);
		expect(raw).not.toBeNull();
		expect(parseComposeDraft(raw, 2_000)).toEqual(draft);
	});

	it("serializes an empty draft to null", () => {
		expect(serializeComposeDraft(createEmptyDraft())).toBeNull();
	});

	it("rejects broken, foreign, and versionless payloads", () => {
		expect(parseComposeDraft(null)).toBeNull();
		expect(parseComposeDraft("{not json")).toBeNull();
		expect(parseComposeDraft('"string"')).toBeNull();
		expect(parseComposeDraft(JSON.stringify({ content: "x", savedAt: Date.now() }))).toBeNull();
	});

	it("drops drafts older than the TTL", () => {
		const raw = serializeComposeDraft({ ...createEmptyDraft(), content: "old" }, 0);
		expect(parseComposeDraft(raw, DRAFT_TTL_MS)).not.toBeNull();
		expect(parseComposeDraft(raw, DRAFT_TTL_MS + 1)).toBeNull();
	});

	it("sanitizes malformed attachments instead of failing", () => {
		const raw = JSON.stringify({
			v: 1,
			savedAt: 10,
			content: "x",
			imageUrls: ["/ok.png", 42, null],
			anime: { id: 1 },
			cwAnime: "nope",
			room: { id: "r1" },
		});
		expect(parseComposeDraft(raw, 20)).toEqual({
			content: "x",
			imageUrls: ["/ok.png"],
			anime: null,
			cwAnime: null,
			room: null,
		});
	});
});

describe("storage helpers", () => {
	it("keys drafts per user so accounts never share a draft", () => {
		const storage = memoryStorage();
		saveComposeDraft(storage, "user-a", { ...createEmptyDraft(), content: "A の下書き" }, 1);
		saveComposeDraft(storage, "user-b", { ...createEmptyDraft(), content: "B の下書き" }, 1);

		expect(composeDraftKey("user-a")).not.toBe(composeDraftKey("user-b"));
		expect(loadComposeDraft(storage, "user-a", 2)?.content).toBe("A の下書き");
		expect(loadComposeDraft(storage, "user-b", 2)?.content).toBe("B の下書き");
	});

	it("removes the stored draft when the form becomes empty (e.g. after posting)", () => {
		const storage = memoryStorage();
		saveComposeDraft(storage, "u", { ...createEmptyDraft(), content: "投稿前" }, 1);
		expect(storage.data.size).toBe(1);
		saveComposeDraft(storage, "u", createEmptyDraft(), 2);
		expect(storage.data.size).toBe(0);
	});

	it("clears explicitly", () => {
		const storage = memoryStorage();
		saveComposeDraft(storage, "u", { ...createEmptyDraft(), content: "破棄される" }, 1);
		clearComposeDraft(storage, "u");
		expect(loadComposeDraft(storage, "u", 2)).toBeNull();
	});

	it("cleans up expired drafts on load", () => {
		const storage = memoryStorage();
		saveComposeDraft(storage, "u", { ...createEmptyDraft(), content: "古い" }, 0);
		expect(loadComposeDraft(storage, "u", DRAFT_TTL_MS + 1)).toBeNull();
		expect(storage.data.size).toBe(0);
	});

	it("tolerates a missing or throwing storage", () => {
		expect(loadComposeDraft(null, "u")).toBeNull();
		expect(() => saveComposeDraft(null, "u", createEmptyDraft())).not.toThrow();
		const throwing: DraftStorage = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("quota");
			},
			removeItem: () => {
				throw new Error("blocked");
			},
		};
		expect(loadComposeDraft(throwing, "u")).toBeNull();
		expect(() => saveComposeDraft(throwing, "u", { ...createEmptyDraft(), content: "x" })).not.toThrow();
		expect(() => clearComposeDraft(throwing, "u")).not.toThrow();
	});
});

describe("直前の投稿の文脈（#331）", () => {
	const now = Date.UTC(2026, 9, 13, 12, 0, 0);

	it("CW とルームを保存し、期限内なら戻す", () => {
		const storage = memoryStorage();
		saveComposeContext(storage, "user-1", { cwAnime: anime, room }, now);
		expect(loadComposeContext(storage, "user-1", now + 60_000)).toEqual({ cwAnime: anime, room });
		expect(storage.data.has(composeContextKey("user-2"))).toBe(false);
	});

	it("CW は30分、ルームは12時間を過ぎたら戻さない", () => {
		const storage = memoryStorage();
		saveComposeContext(storage, "user-1", { cwAnime: anime, room }, now);
		expect(loadComposeContext(storage, "user-1", now + COMPOSE_CONTEXT_CW_TTL_MS + 1)).toEqual({
			cwAnime: null,
			room,
		});
		expect(loadComposeContext(storage, "user-1", now + COMPOSE_CONTEXT_ROOM_TTL_MS + 1)).toEqual({
			cwAnime: null,
			room: null,
		});
	});

	it("どちらも無ければ保存を消し、破棄でも消える。壊れた保存は無視する", () => {
		const storage = memoryStorage();
		saveComposeContext(storage, "user-1", { cwAnime: anime, room: null }, now);
		saveComposeContext(storage, "user-1", { cwAnime: null, room: null }, now);
		expect(storage.data.size).toBe(0);

		saveComposeContext(storage, "user-1", { cwAnime: anime, room: null }, now);
		clearComposeContext(storage, "user-1");
		expect(storage.data.size).toBe(0);

		storage.setItem(composeContextKey("user-1"), "{broken");
		expect(loadComposeContext(storage, "user-1", now)).toEqual({ cwAnime: null, room: null });
		expect(loadComposeContext(null, "user-1", now)).toEqual({ cwAnime: null, room: null });
	});
});
