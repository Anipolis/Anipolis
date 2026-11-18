import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { FollowSuggestion } from "#lib/types.ts";
import FollowSuggestions from "./FollowSuggestions.svelte";

// happy-dom の複製フォームは method を "post" と報告しないため use:enhance が開発時チェックで投げる。
// フォーム送信はこのテストの対象外なので no-op に差し替える。
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));

function suggestion(extra: Partial<FollowSuggestion>): FollowSuggestion {
	return {
		id: "u1",
		username: "alice",
		displayName: null,
		avatarUrl: null,
		sharedCount: 0,
		sharedTitles: [],
		...extra,
	};
}

function render(suggestions: FollowSuggestion[]) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(FollowSuggestions, { target, props: { suggestions } });
	flushSync();
	return {
		target,
		async cleanup() {
			await unmount(component);
			target.remove();
		},
	};
}

describe("FollowSuggestions", () => {
	it("共通の作品を 2 件まで出し、残りは「ほか N 作品」にまとめる", async () => {
		const { target, cleanup } = render([
			suggestion({
				id: "u1",
				username: "alice",
				displayName: "ありす",
				sharedCount: 5,
				sharedTitles: ["A", "B"],
			}),
			suggestion({ id: "u2", username: "bob", sharedCount: 1, sharedTitles: ["C"] }),
		]);
		const rows = [...target.querySelectorAll(".follow-suggestion")];
		expect(rows).toHaveLength(2);
		expect(rows[0]?.textContent).toContain("ありす");
		expect(rows[0]?.textContent).toContain("共通の作品: A、B ほか3作品");
		// 表示名が無ければユーザー名を出す。ほかの作品が無ければ「ほか」は付けない
		expect(rows[1]?.querySelector(".follow-suggestion-name")?.textContent).toBe("bob");
		expect(rows[1]?.textContent).toContain("共通の作品: C");
		expect(rows[1]?.textContent).not.toContain("ほか");
		await cleanup();
	});

	it("共通の作品が無い人は「最近よく投稿しています」と出し、フォローの送り先を持つ", async () => {
		const { target, cleanup } = render([suggestion({ id: "u9", username: "carol" })]);
		expect(target.textContent).toContain("最近よく投稿しています");
		expect(target.querySelector<HTMLInputElement>("input[name=target_id]")?.value).toBe("u9");
		expect(target.querySelector("a")?.getAttribute("href")).toBe("/profile/carol");
		expect(target.querySelector("button")?.textContent?.trim()).toBe("フォローする");
		await cleanup();
	});
});
