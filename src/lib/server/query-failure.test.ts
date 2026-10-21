import type { SupabaseClient } from "@supabase/supabase-js";
import { isHttpError } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { getEvent, getNotifications, getUserAnimeList } from "./queries";
import { failQuery, QUERY_FAILED_MESSAGE } from "./query-failure";

type Result = { data: unknown; error: { code?: string; message: string } | null };

const CHAIN = ["select", "eq", "in", "or", "order", "limit", "range", "is", "not", "maybeSingle", "single"] as const;

function chain(result: Result) {
	const promise = Promise.resolve(result) as Promise<Result> & Record<string, () => unknown>;
	for (const method of CHAIN) promise[method] = () => promise;
	return promise;
}

function fakeSupabase(result: Result) {
	return {
		from: vi.fn(() => chain(result)),
		rpc: vi.fn(async () => ({ data: [], error: null })),
	} as unknown as SupabaseClient<Database>;
}

const DB_ERROR = { code: "57014", message: "canceling statement due to statement timeout" };

/** 503（QUERY_FAILED_MESSAGE）で失敗することを確かめる */
async function expectQueryFailed(promise: Promise<unknown>) {
	const thrown = await promise.then(
		() => null,
		(reason: unknown) => reason,
	);
	expect(isHttpError(thrown)).toBe(true);
	expect(thrown).toMatchObject({ status: 503, body: { message: QUERY_FAILED_MESSAGE } });
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	log.mockRestore();
});

describe("failQuery（#262）", () => {
	it("処理の名前とエラーのコード・メッセージだけを1行の JSON で残し、503 を投げる", () => {
		expect(() => failQuery("getSomething", { ...DB_ERROR, details: "secret row values" })).toThrow();
		expect(log).toHaveBeenCalledWith(
			"[query_failed]",
			JSON.stringify({ context: "getSomething", code: DB_ERROR.code, message: DB_ERROR.message }),
		);
		expect(JSON.stringify(log.mock.calls)).not.toContain("secret row values");
	});
});

describe("主要な中身の取得の失敗を、空・見つからないと区別する（#262）", () => {
	it("通知: 失敗は 503、0 件は空の配列", async () => {
		await expectQueryFailed(getNotifications(fakeSupabase({ data: null, error: DB_ERROR }), "me", 50));
		expect(await getNotifications(fakeSupabase({ data: [], error: null }), "me", 50)).toEqual([]);
	});

	it("イベント: 失敗は 503、見つからなければ null（404 にするのは呼び出し側）", async () => {
		await expectQueryFailed(getEvent(fakeSupabase({ data: null, error: DB_ERROR }), "event-1"));
		expect(await getEvent(fakeSupabase({ data: null, error: null }), "event-1")).toBeNull();
	});

	it("マイリスト: 失敗は 503、0 件は空の配列", async () => {
		await expectQueryFailed(getUserAnimeList(fakeSupabase({ data: null, error: DB_ERROR }), "me"));
		expect(await getUserAnimeList(fakeSupabase({ data: [], error: null }), "me")).toEqual([]);
	});
});
