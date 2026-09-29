import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/state", () => ({
	page: {
		get url() {
			return new URL(window.location.href);
		},
	},
}));

import AccountPage from "./account/+page.svelte";
import Harness from "./account-boundary.harness.svelte";
import PrivacyPage from "./privacy/+page.svelte";
import RoomNotificationsPage from "./rooms/notifications/+page.svelte";

type HarnessProps = {
	userId: string | null;
	page: unknown;
	pageProps: Record<string, unknown>;
};

const mounted: { cleanup: () => Promise<void> }[] = [];

function render(initial: HarnessProps) {
	const props = $state(initial);
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(Harness, { target, props: props as never });
	flushSync();
	mounted.push({
		async cleanup() {
			await unmount(component);
			target.remove();
		},
	});
	return { props, target };
}

function checkboxes(target: HTMLElement) {
	return [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((input) => input.checked);
}

afterEach(async () => {
	for (const entry of mounted.splice(0)) await entry.cleanup();
});

describe("settings after an account switch (#298)", () => {
	it("shows the new account's room notification settings instead of the previous ones", () => {
		const settings = (on: boolean) => ({ notify_1min: on, notify_5min: on, notify_30min: on });
		const { props, target } = render({
			userId: "a",
			page: RoomNotificationsPage,
			pageProps: { data: { notificationSettings: settings(true) }, form: null },
		});
		expect(checkboxes(target)).toEqual([true, true, true]);

		// アカウント切替: 同じページのまま、別ユーザーのデータで読み込み直される
		props.userId = "b";
		props.pageProps = { data: { notificationSettings: settings(false) }, form: null };
		flushSync();

		expect(checkboxes(target)).toEqual([false, false, false]);
	});

	it("shows the new account's privacy setting", () => {
		const { props, target } = render({
			userId: "a",
			page: PrivacyPage,
			pageProps: { data: { profile: { is_private: true } }, form: null },
		});
		expect(checkboxes(target)).toEqual([true]);

		props.userId = "b";
		props.pageProps = { data: { profile: { is_private: false } }, form: null };
		flushSync();

		expect(checkboxes(target)).toEqual([false]);
	});

	it("shows the new account's username", () => {
		const accountData = (username: string) => ({
			data: { profile: { username, display_name: null }, hasEmailProvider: true },
			form: null,
		});
		const { props, target } = render({ userId: "a", page: AccountPage, pageProps: accountData("alice") });
		const username = () => target.querySelector<HTMLInputElement>("input")?.value;
		expect(username()).toBe("alice");

		props.userId = "b";
		props.pageProps = accountData("bob");
		flushSync();

		expect(username()).toBe("bob");
	});

	it("keeps in-progress edits when the same user's data is reloaded", () => {
		const accountData = (username: string) => ({
			data: { profile: { username, display_name: null }, hasEmailProvider: true },
			form: null,
		});
		const { props, target } = render({ userId: "a", page: AccountPage, pageProps: accountData("alice") });
		const input = target.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("username input was not rendered");
		input.value = "alice_new";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();

		// セッション更新や保存後の再取得: ユーザーは同じなのでページを作り直さない
		props.pageProps = accountData("alice");
		flushSync();

		expect(target.querySelector<HTMLInputElement>("input")?.value).toBe("alice_new");
	});
});
