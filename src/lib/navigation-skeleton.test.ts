import { describe, expect, it } from "vitest";
import { isSamePageRefresh, navigationSkeletonPath } from "./navigation-skeleton";

const at = (href: string) => ({ url: new URL(href, "http://localhost") });

describe("navigationSkeletonPath", () => {
	it("shows the destination skeleton when moving to another page", () => {
		expect(navigationSkeletonPath({ type: "link", from: at("/"), to: at("/anime") })).toBe("/anime");
		expect(navigationSkeletonPath({ type: "goto", from: at("/anime/1"), to: at("/anime/2") })).toBe("/anime/2");
	});

	it("keeps the page mounted when only the query changes", () => {
		// 検索欄の入力・フィルター・タブ・ページ番号: ページを残さないと入力欄が作り直される
		expect(
			navigationSkeletonPath({ type: "goto", from: at("/anime?search=ぼ"), to: at("/anime?search=ぼっ") }),
		).toBeNull();
		expect(navigationSkeletonPath({ type: "goto", from: at("/anime"), to: at("/anime?genres=Action") })).toBeNull();
		expect(
			navigationSkeletonPath({ type: "link", from: at("/"), to: at("/?before=2026-09-01T00:00:00Z") }),
		).toBeNull();
		expect(
			navigationSkeletonPath({ type: "popstate", from: at("/notifications?tab=room"), to: at("/notifications") }),
		).toBeNull();
	});

	it("never replaces the page for form submissions or when idle", () => {
		expect(navigationSkeletonPath({ type: "form", from: at("/search"), to: at("/profile/x") })).toBeNull();
		expect(navigationSkeletonPath({ type: null, from: null, to: null })).toBeNull();
		expect(navigationSkeletonPath(null)).toBeNull();
	});

	it("shows the skeleton on the first navigation, which has no origin", () => {
		expect(navigationSkeletonPath({ type: "enter", from: null, to: at("/anime") })).toBe("/anime");
	});
});

describe("isSamePageRefresh", () => {
	it("is true only while re-querying the same page", () => {
		expect(
			isSamePageRefresh({ type: "goto", from: at("/anime?search=a"), to: at("/anime?search=ab") }, "/anime"),
		).toBe(true);
		expect(isSamePageRefresh({ type: "link", from: at("/"), to: at("/anime") }, "/anime")).toBe(false);
		expect(isSamePageRefresh({ type: null, from: null, to: null }, "/anime")).toBe(false);
	});
});
