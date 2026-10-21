import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { MYLIST_SCORE_INVALID_MESSAGE, parseMylistScore, upsertUserAnimeEntry } from "./actions";

describe("parseMylistScore（#355）", () => {
	it("1〜10 の整数を受け付ける", () => {
		expect(parseMylistScore("1")).toEqual({ ok: true, score: 1 });
		expect(parseMylistScore(" 10 ")).toEqual({ ok: true, score: 10 });
	});

	it("未送信・空文字はスコアなし（null）", () => {
		expect(parseMylistScore(null)).toEqual({ ok: true, score: null });
		expect(parseMylistScore("")).toEqual({ ok: true, score: null });
		expect(parseMylistScore("  ")).toEqual({ ok: true, score: null });
	});

	it("0・範囲外・小数・数字以外は受け付けない（0 は「なし」と区別する）", () => {
		for (const raw of ["0", "11", "100", "7.5", "-1", "1e1", "abc", "５"]) {
			expect(parseMylistScore(raw), raw).toEqual({ ok: false });
		}
		expect(parseMylistScore(new File(["5"], "score.txt"))).toEqual({ ok: false });
	});
});

describe("upsertUserAnimeEntry のスコア検証（#355）", () => {
	function fakeSupabase() {
		const upsert = vi.fn(async (_row: { score: number | null }) => ({ error: null }));
		const client = {
			from: vi.fn((table: string) => {
				if (table === "account_moderation") {
					const chain = {
						select: () => chain,
						eq: () => chain,
						maybeSingle: async () => ({ data: null, error: null }),
					};
					return chain;
				}
				if (table === "user_anime_list") return { upsert };
				throw new Error(`unexpected table: ${table}`);
			}),
		};
		return { client: client as unknown as SupabaseClient<Database>, upsert };
	}

	function formRequest(fields: Record<string, string>) {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		return new Request("http://localhost/?/mylist", { method: "POST", body });
	}

	it("不正なスコアは保存せず、理由つきの 400 を返す", async () => {
		const { client, upsert } = fakeSupabase();
		const result = await upsertUserAnimeEntry(
			client,
			formRequest({ anime_id: "1", status: "watching", score: "7.5" }),
			"user-1",
		);
		expect(result).toMatchObject({ status: 400, data: { message: MYLIST_SCORE_INVALID_MESSAGE } });
		expect(upsert).not.toHaveBeenCalled();
	});

	it("正しいスコアは整数で保存し、空ならスコアを外す", async () => {
		const { client, upsert } = fakeSupabase();
		await upsertUserAnimeEntry(client, formRequest({ anime_id: "1", status: "watching", score: "8" }), "user-1");
		await upsertUserAnimeEntry(client, formRequest({ anime_id: "1", status: "watching", score: "" }), "user-1");
		expect(upsert.mock.calls.map(([row]) => row.score)).toEqual([8, null]);
	});
});
