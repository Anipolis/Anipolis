import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertUserAnimeEntry = vi.fn(async () => ({ success: true }));
vi.mock("$lib/server/actions", () => ({
	upsertUserAnimeEntry,
	removeUserAnimeEntry: vi.fn(),
}));
vi.mock("$lib/server/queries", () => ({
	getAnimeRankingTrending: vi.fn(),
	getUserAnimeList: vi.fn(),
}));

const { actions } = await import("./+page.server");
const upsertWatchlist = actions["upsertWatchlist"];

function requestWith(fields: Record<string, string>) {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return new Request("https://example.test/mylist?/upsertWatchlist", { method: "POST", body: form });
}

function eventFor(userId: string, request: Request) {
	return {
		request,
		locals: { supabase: {}, safeGetSession: async () => ({ session: {}, user: { id: userId } }) },
	} as unknown as Parameters<NonNullable<typeof upsertWatchlist>>[0];
}

describe("mylist upsertWatchlist", () => {
	beforeEach(() => upsertUserAnimeEntry.mockClear());

	it("編集したユーザーと今のセッションが違えば書き込まない（自動保存がアカウント切り替え後に届いた）", async () => {
		const result = await upsertWatchlist?.(
			eventFor("user-b", requestWith({ anime_id: "10", status: "watching", expected_user_id: "user-a" })),
		);

		expect(result).toMatchObject({ status: 409 });
		expect(upsertUserAnimeEntry).not.toHaveBeenCalled();
	});

	it("同じユーザーなら保存し、本文を読み直せる", async () => {
		const request = requestWith({ anime_id: "10", status: "watching", expected_user_id: "user-a" });

		await upsertWatchlist?.(eventFor("user-a", request));

		expect(upsertUserAnimeEntry).toHaveBeenCalledWith({}, request, "user-a");
		await expect(request.formData()).resolves.toBeInstanceOf(FormData);
	});

	it("expected_user_id が無い送信（他の画面のフォーム）はそのまま保存する", async () => {
		await upsertWatchlist?.(eventFor("user-a", requestWith({ anime_id: "10", status: "watching" })));

		expect(upsertUserAnimeEntry).toHaveBeenCalledTimes(1);
	});
});
