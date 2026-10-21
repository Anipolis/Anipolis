import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./+server";

const PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
	(c) => c.charCodeAt(0),
);

function callGet(user: { user_metadata: Record<string, unknown> } | null) {
	const event = { locals: { safeGetSession: async () => ({ user, session: null }) } };
	return GET(event as unknown as Parameters<typeof GET>[0]);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("GET /onboarding/oauth-avatar", () => {
	it("本人の OAuth 画像を返し、ブラウザにもキャッシュさせない", async () => {
		const fetchMock = vi.fn(async () => new Response(PNG, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const res = await callGet({ user_metadata: { avatar_url: "https://cdn.discordapp.com/avatars/1/a.png" } });

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		// URL は全員共通なので、アカウントを切り替えたときに前の人の画像を再利用させない
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("未ログインは 401", async () => {
		await expect(callGet(null)).rejects.toMatchObject({ status: 401 });
	});

	it("取り込み対象外の画像は取得せずに 404", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(callGet({ user_metadata: { avatar_url: "https://example.com/a.png" } })).rejects.toMatchObject({
			status: 404,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
