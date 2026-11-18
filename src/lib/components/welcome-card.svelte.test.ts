import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FollowSuggestion } from "#lib/types.ts";
import WelcomeCard from "./WelcomeCard.svelte";

// おすすめのフォローボタンの use:enhance は、このテストの対象外なので no-op に差し替える
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));

const alice: FollowSuggestion = {
	id: "u1",
	username: "alice",
	displayName: null,
	avatarUrl: null,
	sharedCount: 1,
	sharedTitles: ["A"],
};

type Props = {
	profileEditHref?: string | null;
	listEmpty?: boolean;
	followsNobody?: boolean;
	suggestions?: FollowSuggestion[];
	suggestionsElsewhere?: boolean;
};

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
	localStorage.clear();
});

function render(props: Props): HTMLElement {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(WelcomeCard, {
		target,
		props: { userId: "me", listEmpty: false, followsNobody: false, suggestions: [], ...props },
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

describe("WelcomeCard", () => {
	it("放送・実況ルームの案内は出さない", () => {
		const target = render({ listEmpty: true, followsNobody: true });
		expect(target.textContent).toContain("アニメを探してマイリストに追加");
		expect(target.textContent).toContain("ユーザーを探してフォロー");
		expect(target.querySelector('a[href="/schedule"]')).toBeNull();
	});

	it("フォロー済みなら、フォローの案内を出さない", () => {
		const target = render({ profileEditHref: "/profile/me?edit=profile", followsNobody: false });
		expect(target.textContent).toContain("アイコンと表示名を設定する");
		expect(target.textContent).not.toContain("ユーザーを探してフォロー");
	});

	it("おすすめが 0 人なら、フォロー中タブでも検索へ送る", () => {
		const target = render({ followsNobody: true, suggestions: [], suggestionsElsewhere: true });
		expect(target.textContent).toContain("ユーザーを探してフォロー");
	});

	it("出す項目が無ければ、カードごと出さない", () => {
		const target = render({ followsNobody: true, suggestions: [alice], suggestionsElsewhere: true });
		expect(target.querySelector(".welcome-card")).toBeNull();
	});

	it("おすすめだけのときは、案内のボタン列を出さない", () => {
		const target = render({ followsNobody: true, suggestions: [alice] });
		expect(target.querySelector(".welcome-card-actions")).toBeNull();
		expect(target.textContent).toContain("フォローしてみませんか");
	});
});
