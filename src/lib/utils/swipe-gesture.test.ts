import { describe, expect, it } from "vitest";
import {
	classifySwipe,
	decideSwipeStart,
	hasTextSelection,
	isDialogElement,
	isEditableElement,
	resolveSwipeAxis,
	type SwipeElementLike,
	startsInEdgeZone,
} from "./swipe-gesture";

type FakeElementInit = {
	tag?: string;
	attrs?: Record<string, string>;
	classes?: string[];
	isContentEditable?: boolean;
	parent?: SwipeElementLike | null;
};

/** 実 DOM を使わずに祖先チェーンを組み立てる疑似要素 */
function el(init: FakeElementInit = {}): SwipeElementLike {
	const attrs = init.attrs ?? {};
	const classes = new Set(init.classes ?? []);
	return {
		tagName: (init.tag ?? "div").toUpperCase(),
		parentElement: init.parent ?? null,
		getAttribute: (name) => attrs[name] ?? null,
		classList: { contains: (name) => classes.has(name) },
		...(init.isContentEditable !== undefined ? { isContentEditable: init.isContentEditable } : {}),
	};
}

describe("isEditableElement", () => {
	it("detects form controls including range inputs", () => {
		expect(isEditableElement(el({ tag: "input", attrs: { type: "range" } }))).toBe(true);
		expect(isEditableElement(el({ tag: "textarea" }))).toBe(true);
		expect(isEditableElement(el({ tag: "select" }))).toBe(true);
	});

	it("detects contenteditable and editable ARIA roles", () => {
		expect(isEditableElement(el({ isContentEditable: true }))).toBe(true);
		expect(isEditableElement(el({ attrs: { contenteditable: "" } }))).toBe(true);
		expect(isEditableElement(el({ attrs: { contenteditable: "false" } }))).toBe(false);
		expect(isEditableElement(el({ attrs: { role: "slider" } }))).toBe(true);
		expect(isEditableElement(el({ tag: "p" }))).toBe(false);
	});
});

describe("isDialogElement", () => {
	it("detects native and ARIA dialogs", () => {
		expect(isDialogElement(el({ tag: "dialog" }))).toBe(true);
		expect(isDialogElement(el({ attrs: { role: "dialog" } }))).toBe(true);
		expect(isDialogElement(el({ attrs: { role: "alertdialog" } }))).toBe(true);
		expect(isDialogElement(el({ attrs: { "aria-modal": "true" } }))).toBe(true);
		expect(isDialogElement(el({ attrs: { role: "button" } }))).toBe(false);
	});
});

describe("hasTextSelection", () => {
	it("is true only for a non-empty range selection", () => {
		expect(hasTextSelection(null)).toBe(false);
		expect(hasTextSelection({ isCollapsed: true, rangeCount: 1, toString: () => "" })).toBe(false);
		expect(hasTextSelection({ isCollapsed: false, rangeCount: 0, toString: () => "abc" })).toBe(false);
		expect(hasTextSelection({ isCollapsed: false, rangeCount: 1, toString: () => "" })).toBe(false);
		expect(hasTextSelection({ isCollapsed: false, rangeCount: 1, toString: () => "abc" })).toBe(true);
	});
});

describe("startsInEdgeZone", () => {
	it("flags touches near either screen edge", () => {
		expect(startsInEdgeZone(10, 390)).toBe(true);
		expect(startsInEdgeZone(385, 390)).toBe(true);
		expect(startsInEdgeZone(200, 390)).toBe(false);
		expect(startsInEdgeZone(200, 0)).toBe(false);
	});
});

describe("decideSwipeStart", () => {
	it("tracks a plain touch on ordinary content", () => {
		const main = el({ classes: ["app-main"] });
		const target = el({ tag: "p", parent: el({ parent: main }) });
		expect(decideSwipeStart({ target, boundary: main })).toBe("TRACK");
	});

	it("ignores touches that start inside editable elements or their descendants", () => {
		const main = el({ classes: ["app-main"] });
		const input = el({ tag: "input", attrs: { type: "search" }, parent: main });
		expect(decideSwipeStart({ target: input, boundary: main })).toBe("IGNORE_EDITABLE");

		const editable = el({ isContentEditable: true, parent: main });
		const span = el({ tag: "span", parent: editable });
		expect(decideSwipeStart({ target: span, boundary: main })).toBe("IGNORE_EDITABLE");
	});

	it("ignores touches inside dialogs and navigation chrome", () => {
		const main = el({ classes: ["app-main"] });
		const dialog = el({ attrs: { role: "dialog", "aria-modal": "true" }, parent: main });
		const button = el({ tag: "button", parent: dialog });
		expect(decideSwipeStart({ target: button, boundary: main })).toBe("IGNORE_DIALOG");

		const nav = el({ classes: ["mobile-bottom-nav"], parent: main });
		const link = el({ tag: "a", parent: nav });
		expect(decideSwipeStart({ target: link, boundary: main })).toBe("IGNORE_CHROME");
	});

	it("ignores touches on horizontally scrollable ancestors but stops at the boundary", () => {
		const main = el({ classes: ["app-main"] });
		const scroller = el({ classes: ["scroller"], parent: main });
		const card = el({ parent: scroller });
		const isHorizontalScroller = (element: SwipeElementLike) => element === scroller || element === main;
		expect(decideSwipeStart({ target: card, boundary: main, isHorizontalScroller })).toBe("IGNORE_SCROLLER");

		const plain = el({ parent: main });
		expect(decideSwipeStart({ target: plain, boundary: main, isHorizontalScroller })).toBe("TRACK");
	});

	it("ignores touches while text is selected, with multiple fingers, or at the screen edge", () => {
		const target = el({ tag: "p" });
		expect(
			decideSwipeStart({ target, selection: { isCollapsed: false, rangeCount: 1, toString: () => "選択" } }),
		).toBe("IGNORE_SELECTION");
		expect(decideSwipeStart({ target, touchCount: 2 })).toBe("IGNORE_MULTITOUCH");
		expect(decideSwipeStart({ target, startX: 8, viewportWidth: 390 })).toBe("IGNORE_EDGE");
		expect(decideSwipeStart({ target: null })).toBe("IGNORE_TARGET");
	});
});

describe("resolveSwipeAxis", () => {
	it("stays undecided until the finger moves past the slop", () => {
		expect(resolveSwipeAxis("undecided", 4, 3)).toBe("undecided");
	});

	it("locks to horizontal only when the horizontal delta clearly dominates", () => {
		expect(resolveSwipeAxis("undecided", 20, 4)).toBe("horizontal");
		expect(resolveSwipeAxis("undecided", 20, 15)).toBe("vertical");
		expect(resolveSwipeAxis("undecided", 2, 20)).toBe("vertical");
	});

	it("never changes a locked axis", () => {
		expect(resolveSwipeAxis("vertical", 200, 0)).toBe("vertical");
		expect(resolveSwipeAxis("horizontal", 0, 200)).toBe("horizontal");
	});
});

describe("classifySwipe", () => {
	const nav = { currentIndex: 1, tabCount: 5 };

	it("ignores gestures locked to the vertical axis regardless of distance", () => {
		expect(classifySwipe(120, 0, "vertical", nav)).toBe("IGNORE_VERTICAL");
	});

	it("ignores short or diagonal gestures", () => {
		expect(classifySwipe(30, 0, "horizontal", nav)).toBe("IGNORE_SHORT");
		expect(classifySwipe(60, 40, "horizontal", nav)).toBe("IGNORE_VERTICAL");
	});

	it("maps a clean horizontal swipe to next/prev", () => {
		expect(classifySwipe(-80, 10, "horizontal", nav)).toBe("SWIPE_NEXT");
		expect(classifySwipe(80, -10, "horizontal", nav)).toBe("SWIPE_PREV");
	});

	it("ignores swipes past either end of the tab list or off any tab", () => {
		expect(classifySwipe(80, 0, "horizontal", { currentIndex: 0, tabCount: 5 })).toBe("IGNORE_ROUTE");
		expect(classifySwipe(-80, 0, "horizontal", { currentIndex: 4, tabCount: 5 })).toBe("IGNORE_ROUTE");
		expect(classifySwipe(-80, 0, "horizontal", { currentIndex: -1, tabCount: 5 })).toBe("IGNORE_ROUTE");
	});
});
