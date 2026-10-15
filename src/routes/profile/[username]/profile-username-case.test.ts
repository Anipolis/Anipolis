import { isRedirect } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";
import { load } from "./+layout.server";

function run(path: string) {
	const url = new URL(`https://anipolis.net${path}`);
	const username = decodeURIComponent(url.pathname.split("/")[2] ?? "");
	try {
		load({ params: { username }, url } as never);
		return null;
	} catch (thrown) {
		if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location };
		throw thrown;
	}
}

describe("profile username case", () => {
	it("大文字を含む ID の URL は小文字の URL へ転送する（下の画面とクエリも引き継ぐ）", () => {
		expect(run("/profile/Anipolis_info")).toEqual({ status: 301, location: "/profile/anipolis_info" });
		expect(run("/profile/Anipolis_info/followers?tab=1")).toEqual({
			status: 301,
			location: "/profile/anipolis_info/followers?tab=1",
		});
	});

	it("小文字の ID はそのまま", () => {
		expect(run("/profile/anipolis_info")).toBeNull();
		expect(run("/profile/anipolis_info/following")).toBeNull();
	});
});
