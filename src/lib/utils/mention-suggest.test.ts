import { describe, expect, it } from "vitest";
import { applyMention, findMentionQuery, mentionOptionId, moveActiveIndex, resolveMentionKey } from "./mention-suggest";

describe("findMentionQuery", () => {
	it("returns the partial username right before the cursor", () => {
		expect(findMentionQuery("hello @ali", 10)).toBe("ali");
	});

	it("returns an empty string right after @", () => {
		expect(findMentionQuery("hey @", 5)).toBe("");
	});

	it("returns null when the cursor is not inside a mention", () => {
		expect(findMentionQuery("hello world", 11)).toBeNull();
		expect(findMentionQuery("@alice done", 11)).toBeNull();
	});

	it("only looks at the text before the cursor", () => {
		expect(findMentionQuery("@ali ce", 4)).toBe("ali");
	});
});

describe("applyMention", () => {
	it("replaces the partial mention and appends a trailing space", () => {
		expect(applyMention("hi @ali", 7, "alice")).toEqual({ text: "hi @alice ", cursor: 10 });
	});

	it("keeps the text after the cursor", () => {
		expect(applyMention("@al tail", 3, "alice")).toEqual({ text: "@alice  tail", cursor: 7 });
	});
});

describe("moveActiveIndex", () => {
	it("moves down and wraps to the top", () => {
		expect(moveActiveIndex(0, 3, 1)).toBe(1);
		expect(moveActiveIndex(2, 3, 1)).toBe(0);
	});

	it("moves up and wraps to the bottom", () => {
		expect(moveActiveIndex(1, 3, -1)).toBe(0);
		expect(moveActiveIndex(0, 3, -1)).toBe(2);
	});

	it("starts from the nearest end when nothing is active", () => {
		expect(moveActiveIndex(-1, 3, 1)).toBe(0);
		expect(moveActiveIndex(-1, 3, -1)).toBe(2);
	});

	it("returns -1 for an empty list", () => {
		expect(moveActiveIndex(0, 0, 1)).toBe(-1);
	});
});

describe("resolveMentionKey", () => {
	const ctx = { open: true, count: 3, activeIndex: 1, composing: false };

	it("moves with the arrow keys", () => {
		expect(resolveMentionKey("ArrowDown", ctx)).toEqual({ type: "move", index: 2 });
		expect(resolveMentionKey("ArrowUp", ctx)).toEqual({ type: "move", index: 0 });
	});

	it("selects the active candidate with Enter or Tab", () => {
		expect(resolveMentionKey("Enter", ctx)).toEqual({ type: "select", index: 1 });
		expect(resolveMentionKey("Tab", ctx)).toEqual({ type: "select", index: 1 });
	});

	it("falls back to the first candidate when none is active", () => {
		expect(resolveMentionKey("Enter", { ...ctx, activeIndex: -1 })).toEqual({ type: "select", index: 0 });
	});

	it("closes with Escape", () => {
		expect(resolveMentionKey("Escape", ctx)).toEqual({ type: "close" });
	});

	it("ignores keys while the list is closed, empty, or an IME composition is active", () => {
		expect(resolveMentionKey("Enter", { ...ctx, open: false })).toEqual({ type: "none" });
		expect(resolveMentionKey("Enter", { ...ctx, count: 0 })).toEqual({ type: "none" });
		expect(resolveMentionKey("Enter", { ...ctx, composing: true })).toEqual({ type: "none" });
		expect(resolveMentionKey("ArrowDown", { ...ctx, composing: true })).toEqual({ type: "none" });
	});

	it("leaves unrelated keys alone", () => {
		expect(resolveMentionKey("a", ctx)).toEqual({ type: "none" });
		expect(resolveMentionKey(" ", ctx)).toEqual({ type: "none" });
	});
});

describe("mentionOptionId", () => {
	it("builds a stable id per index", () => {
		expect(mentionOptionId("mention-list", 2)).toBe("mention-list-option-2");
	});
});
