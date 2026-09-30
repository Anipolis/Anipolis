import { afterEach, expect, it, vi } from "vitest";
import { timelineScroll } from "./timelineScroll";

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

it("preserves a paused reader's visible post when earlier content grows", async () => {
	let resize = () => {};
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resize = callback;
			}
			observe() {}
			disconnect() {}
		},
	);
	const list = document.body.appendChild(document.createElement("div"));
	const content = list.appendChild(document.createElement("div"));
	const post = content.appendChild(document.createElement("div"));
	post.dataset["postId"] = "first";
	let postTop = 120;
	list.scrollTop = 100;
	Object.defineProperty(list, "scrollHeight", { get: () => 1000 });
	vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 600, 400));
	vi.spyOn(post, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, postTop - list.scrollTop, 600, 46));
	const action = timelineScroll(list, { following: false, newestFirst: false });
	try {
		postTop += 80;
		resize();
		expect(list.scrollTop).toBe(180);
		expect(post.getBoundingClientRect().top).toBe(20);
		action.update({ following: true, newestFirst: false });
		await Promise.resolve();
		expect(list.scrollTop).toBe(1000);
		// An unchanged render must not pull a user back during the first frames of scrolling away.
		list.scrollTop = 970;
		action.update({ following: true, newestFirst: false });
		await Promise.resolve();
		expect(list.scrollTop).toBe(970);
	} finally {
		action.destroy();
	}
});

it("keeps following the latest post when only the viewport shrinks", () => {
	const observed = new Set<Element>();
	let resize = () => {};
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resize = callback;
			}
			observe(target: Element) {
				observed.add(target);
			}
			disconnect() {}
		},
	);
	const list = document.body.appendChild(document.createElement("div"));
	list.appendChild(document.createElement("div"));
	// Content height is fixed; the composer growing only shrinks the list itself.
	Object.defineProperty(list, "scrollHeight", { get: () => 1000 });
	const action = timelineScroll(list, { following: true, newestFirst: false });
	try {
		list.scrollTop = 600;
		expect(observed.has(list)).toBe(true);
		resize();
		expect(list.scrollTop).toBe(1000);
	} finally {
		action.destroy();
	}
});
