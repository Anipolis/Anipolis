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

function createUpdateWriter() {
	const animeUpdate = vi.fn(() => ({
		eq: vi.fn(() => ({
			select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 123 }, error: null })) })),
		})),
	}));
	const animeRead = {
		eq: vi.fn(() => animeRead),
		maybeSingle: vi.fn(async () => ({ data: { mal_id: 123, title: "旧タイトル" }, error: null })),
	};
	const manualRead = {
		eq: vi.fn(() => manualRead),
		maybeSingle: vi
			.fn()
			.mockResolvedValueOnce({ data: null, error: { message: "temporary read failure" } })
			.mockResolvedValue({ data: null, error: null }),
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

function updateRequest(title: string) {
	const form = new FormData();
	form.set("title", title);
	form.set("episode_count", "12");
	form.set("broadcast_duration_minutes", "30");
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
});
