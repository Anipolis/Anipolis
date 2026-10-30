import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import UserAvatar from "./UserAvatar.svelte";

describe("UserAvatar（サーバーで出す HTML）", () => {
	it("インラインのイベント属性（onerror など）を出さない。CSP に止められてコンソールにエラーが出る", () => {
		const { body } = render(UserAvatar, { props: { src: "https://example.com/a.webp", username: "animetaro" } });
		expect(body).toContain("<img");
		expect(body).not.toMatch(/\son[a-z]+=/);
	});
});
