import { describe, expect, it, vi } from "vitest";
import { fetchOAuthAvatar, getOAuthAvatarUrl, OAUTH_AVATAR_MAX_BYTES, parseOAuthAvatarUrl } from "./oauth-avatar";

// 1x1 の PNG（マジックバイトで判定されるので中身は最小限でよい）
const PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
	(c) => c.charCodeAt(0),
);

function imageResponse(bytes: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) {
	return new Response(bytes, { status: 200, headers: { "content-type": "image/png", ...headers } });
}

describe("getOAuthAvatarUrl", () => {
	it("Discord・X は avatar_url、Google は picture から取る", () => {
		expect(getOAuthAvatarUrl({ avatar_url: "https://cdn.discordapp.com/avatars/1/a.png" })).toBe(
			"https://cdn.discordapp.com/avatars/1/a.png",
		);
		expect(getOAuthAvatarUrl({ picture: "https://lh3.googleusercontent.com/a/x=s96-c" })).toBe(
			"https://lh3.googleusercontent.com/a/x=s96-c",
		);
		expect(getOAuthAvatarUrl({ avatar_url: "  " })).toBeNull();
		expect(getOAuthAvatarUrl(undefined)).toBeNull();
	});
});

describe("parseOAuthAvatarUrl", () => {
	it("プロバイダーの画像配信元だけを受け付ける", () => {
		expect(parseOAuthAvatarUrl("https://cdn.discordapp.com/avatars/1/a.png")).not.toBeNull();
		expect(parseOAuthAvatarUrl("https://lh3.googleusercontent.com/a/x=s96-c")).not.toBeNull();
		expect(parseOAuthAvatarUrl("https://pbs.twimg.com/profile_images/1/a_normal.jpg")).not.toBeNull();

		// 任意の取得先・http・ポート・認証情報付き・似た名前のホストは拒否する
		expect(parseOAuthAvatarUrl("https://example.com/a.png")).toBeNull();
		expect(parseOAuthAvatarUrl("http://cdn.discordapp.com/avatars/1/a.png")).toBeNull();
		expect(parseOAuthAvatarUrl("https://cdn.discordapp.com:8443/avatars/1/a.png")).toBeNull();
		expect(parseOAuthAvatarUrl("https://user:pass@cdn.discordapp.com/avatars/1/a.png")).toBeNull();
		expect(parseOAuthAvatarUrl("https://cdn.discordapp.com.evil.example/a.png")).toBeNull();
		expect(parseOAuthAvatarUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
		expect(parseOAuthAvatarUrl("not a url")).toBeNull();
		expect(parseOAuthAvatarUrl(null)).toBeNull();
	});

	it("各プロバイダーの小さい既定サイズを大きいものに変える", () => {
		expect(parseOAuthAvatarUrl("https://cdn.discordapp.com/avatars/1/a.png")?.toString()).toBe(
			"https://cdn.discordapp.com/avatars/1/a.png?size=256",
		);
		expect(parseOAuthAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c")?.toString()).toBe(
			"https://lh3.googleusercontent.com/a/abc=s256-c",
		);
		expect(parseOAuthAvatarUrl("https://pbs.twimg.com/profile_images/1/a_normal.jpg")?.toString()).toBe(
			"https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
		);
	});
});

describe("fetchOAuthAvatar", () => {
	it("画像を取得して形式を判定する", async () => {
		const fetchFn = vi.fn(async () => imageResponse(PNG));
		const result = await fetchOAuthAvatar("https://cdn.discordapp.com/avatars/1/a.png", fetchFn);

		expect(result?.mime).toBe("image/png");
		expect(result?.ext).toBe("png");
		expect(new Uint8Array(result?.bytes ?? new ArrayBuffer(0))).toEqual(PNG);
		// リダイレクト先は検証していないので追わない
		expect(fetchFn).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error" }));
	});

	it("対象外の URL には通信しない", async () => {
		const fetchFn = vi.fn();
		expect(await fetchOAuthAvatar("https://example.com/a.png", fetchFn)).toBeNull();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("取得失敗・画像でない応答・大きすぎる画像は取り込まない", async () => {
		const url = "https://cdn.discordapp.com/avatars/1/a.png";
		expect(
			await fetchOAuthAvatar(
				url,
				vi.fn(async () => new Response("nf", { status: 404 })),
			),
		).toBeNull();
		expect(
			await fetchOAuthAvatar(
				url,
				vi.fn(async () => {
					throw new TypeError("network");
				}),
			),
		).toBeNull();
		expect(
			await fetchOAuthAvatar(
				url,
				vi.fn(async () => imageResponse(new TextEncoder().encode("<html>"))),
			),
		).toBeNull();

		// 申告サイズで先に断る
		const declaredTooLarge = imageResponse(PNG, { "content-length": String(OAUTH_AVATAR_MAX_BYTES + 1) });
		expect(
			await fetchOAuthAvatar(
				url,
				vi.fn(async () => declaredTooLarge),
			),
		).toBeNull();

		// 申告が無くても、読み込み中に上限を超えたら断る
		const huge = new Uint8Array(OAUTH_AVATAR_MAX_BYTES + 1);
		huge.set(PNG);
		expect(
			await fetchOAuthAvatar(
				url,
				vi.fn(async () => new Response(huge)),
			),
		).toBeNull();
	});
});
