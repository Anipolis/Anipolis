import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { updateAnimeAction, upsertManualSourceRecord } from "./anime-admin";

function createSourceWriter(readResult: unknown) {
	const upsert = vi.fn(async () => ({ error: null }));
	const chain = {
		select: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		maybeSingle: vi.fn(async () => readResult),
		upsert,
	};
	const writer = {
		from: vi.fn(() => chain),
	};

	return { writer: writer as unknown as SupabaseClient<Database>, upsert };
}

function createUpdateWriter({
	previousRow = { mal_id: 123, title: "旧タイトル" } as Record<string, unknown>,
	updatedRow = { id: 123 } as Record<string, unknown>,
	failFirstManualRead = true,
} = {}) {
	const animeUpdate = vi.fn((_payload: Record<string, unknown>) => ({
		eq: vi.fn(() => ({
			select: vi.fn(() => ({ single: vi.fn(async () => ({ data: updatedRow, error: null })) })),
		})),
	}));
	const animeRead = {
		eq: vi.fn(() => animeRead),
		maybeSingle: vi.fn(async () => ({ data: previousRow, error: null })),
	};
	const manualReadResult = vi.fn().mockResolvedValue({ data: null, error: null });
	if (failFirstManualRead) {
		manualReadResult.mockResolvedValueOnce({ data: null, error: { message: "temporary read failure" } });
	}
	const manualRead = {
		eq: vi.fn(() => manualRead),
		maybeSingle: manualReadResult,
	};
	const manualUpsert = vi.fn(async () => ({ error: null }));
	const writer = {
		from: vi.fn((table: string) => {
			if (table === "anime") {
				return {
					select: vi.fn(() => animeRead),
					update: animeUpdate,
				};
			}
			return {
				select: vi.fn(() => manualRead),
				upsert: manualUpsert,
			};
		}),
		storage: {},
	};

	return {
		writer: writer as unknown as SupabaseClient<Database>,
		animeUpdate,
		manualUpsert,
	};
}

function updateRequest(title: string, fields: Record<string, string> = {}) {
	const form = new FormData();
	form.set("title", title);
	form.set("episode_count", "12");
	form.set("broadcast_duration_minutes", "30");
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return new Request("https://example.test/anime/123", { method: "POST", body: form });
}

describe("upsertManualSourceRecord", () => {
	it("does not overwrite a manual record when reading it fails", async () => {
		const { writer, upsert } = createSourceWriter({ data: null, error: { message: "temporary read failure" } });

		const result = await upsertManualSourceRecord(writer, 123, { title: "旧タイトル" }, { title: "新タイトル" });

		expect(result).toBe(false);
		expect(upsert).not.toHaveBeenCalled();
	});

	it("merges changed fields into an existing normalized record", async () => {
		const { writer, upsert } = createSourceWriter({
			data: {
				normalized_data: { title: "旧タイトル", studio: ["既存スタジオ"] },
				source_url: "https://example.test/source",
			},
			error: null,
		});

		const result = await upsertManualSourceRecord(writer, 123, { title: "旧タイトル" }, { title: "新タイトル" });

		expect(result).toBe(true);
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				mal_id: 123,
				source: "manual",
				source_url: "https://example.test/source",
				normalized_data: { title: "新タイトル", studio: ["既存スタジオ"] },
			}),
			{ onConflict: "mal_id,source" },
		);
	});

	it("preflights the manual record before updating anime so a retry keeps the diff", async () => {
		const { writer, animeUpdate, manualUpsert } = createUpdateWriter();

		const firstResult = await updateAnimeAction(writer, updateRequest("新タイトル"), "123", null);

		expect(firstResult).toMatchObject({ status: 500 });
		expect(animeUpdate).not.toHaveBeenCalled();

		const secondResult = await updateAnimeAction(writer, updateRequest("新タイトル"), "123", null);

		expect(secondResult).toEqual({ success: true, animeId: "123" });
		expect(animeUpdate).toHaveBeenCalledTimes(1);
		expect(manualUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				normalized_data: expect.objectContaining({ title: "新タイトル" }),
			}),
			{ onConflict: "mal_id,source" },
		);
	});

	it("writes the manual record with the source writer, not the admin's session client", async () => {
		// anime_source_records には管理者ユーザーの書き込みポリシーが無いため、
		// manual レコードはサーバーの service role クライアントで保存する
		const session = createUpdateWriter();
		const service = createSourceWriter({ data: null, error: null });

		const result = await updateAnimeAction(
			session.writer,
			updateRequest("新タイトル"),
			"123",
			null,
			service.writer,
		);

		expect(result).toEqual({ success: true, animeId: "123" });
		expect(session.animeUpdate).toHaveBeenCalledTimes(1);
		expect(session.manualUpsert).not.toHaveBeenCalled();
		expect(service.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "manual",
				normalized_data: expect.objectContaining({ title: "新タイトル" }),
			}),
			{ onConflict: "mal_id,source" },
		);
	});
});

describe("updateAnimeAction のカバー（migration 136 で © の無い作品は cover_url が隠れる）", () => {
	const coverSource = "https://example.test/covers/123.jpg";

	it("隠れているカバーを変えずに保存しても、カバーを編集したことにしない", async () => {
		const { writer, manualUpsert } = createUpdateWriter({
			previousRow: { mal_id: 123, title: "旧タイトル", cover_url: null, cover_source_url: coverSource },
			failFirstManualRead: false,
		});

		await updateAnimeAction(writer, updateRequest("新タイトル", { cover_url: coverSource }), "123", coverSource);

		const saved = manualUpsert.mock.calls[0] as unknown as [{ normalized_data: Record<string, unknown> }];
		expect(saved[0].normalized_data).toMatchObject({ title: "新タイトル" });
		expect(saved[0].normalized_data).not.toHaveProperty("cover_url");
	});

	it("URL 欄を空にして保存すると、画像の実体ごとカバーを外す", async () => {
		const { writer, animeUpdate } = createUpdateWriter({
			previousRow: { mal_id: 123, title: "旧タイトル", cover_url: null, cover_source_url: coverSource },
			failFirstManualRead: false,
		});

		await updateAnimeAction(writer, updateRequest("旧タイトル", { cover_url: "" }), "123", coverSource);

		expect(animeUpdate).toHaveBeenCalledWith(expect.objectContaining({ cover_url: null, cover_source_url: null }));
	});

	it("URL 欄が送られない（画像ファイルを選んだ）ときは今のカバーを引き継ぐ", async () => {
		const { writer, animeUpdate } = createUpdateWriter({ failFirstManualRead: false });

		await updateAnimeAction(writer, updateRequest("旧タイトル"), "123", coverSource);

		const payload = animeUpdate.mock.calls[0]?.[0];
		expect(payload).toMatchObject({ cover_url: coverSource });
		expect(payload).not.toHaveProperty("cover_source_url");
	});

	it("保存後に © が無くカバーが隠れていれば coverHidden を返す", async () => {
		const { writer } = createUpdateWriter({
			updatedRow: { id: 123, cover_url: null, cover_source_url: coverSource },
			failFirstManualRead: false,
		});

		const result = await updateAnimeAction(writer, updateRequest("旧タイトル"), "123", coverSource);

		expect(result).toEqual({ success: true, animeId: "123", coverHidden: true });
	});
});
