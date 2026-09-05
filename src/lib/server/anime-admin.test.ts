import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { upsertManualSourceRecord } from "./anime-admin";

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
});
