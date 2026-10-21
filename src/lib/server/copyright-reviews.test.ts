import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { resolveCopyrightReviewAction } from "./copyright-reviews";

function createClient(review: Record<string, unknown> | null) {
	const animeUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
	const reviewUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }));
	const reviewRead = {
		eq: vi.fn(() => reviewRead),
		maybeSingle: vi.fn(async () => ({ data: review, error: null })),
	};
	const client = {
		from: vi.fn((table: string) =>
			table === "anime" ? { update: animeUpdate } : { select: vi.fn(() => reviewRead), update: reviewUpdate },
		),
	};
	return { client: client as unknown as SupabaseClient<Database>, animeUpdate, reviewUpdate };
}

function request(fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return new Request("https://example.test/admin/copyright-reviews", { method: "POST", body: form });
}

const pendingReview = {
	id: 7,
	anime_id: 58,
	status: "pending",
	candidates: [{ text: "©Annict 側", source: "annict" }],
	anime: { copyright: "©既存" },
};

describe("resolveCopyrightReviewAction", () => {
	it("replaces the copyright with the chosen candidate and closes the anime's reviews", async () => {
		const { client, animeUpdate, reviewUpdate } = createClient(pendingReview);

		const result = await resolveCopyrightReviewAction(
			request({ review_id: "7", choice: "candidate:0" }),
			client,
			"admin",
		);

		expect(result).toEqual({ success: true });
		expect(animeUpdate).toHaveBeenCalledWith({ copyright: "©Annict 側" });
		expect(reviewUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ status: "resolved", resolution: "replaced", resolved_copyright: "©Annict 側" }),
		);
	});

	it("keeps the current copyright without touching the anime row", async () => {
		const { client, animeUpdate, reviewUpdate } = createClient(pendingReview);

		await resolveCopyrightReviewAction(request({ review_id: "7", choice: "keep" }), client, "admin");

		expect(animeUpdate).not.toHaveBeenCalled();
		expect(reviewUpdate).toHaveBeenCalledWith(expect.objectContaining({ resolution: "kept" }));
	});

	it("clears the copyright when the admin confirms there is none", async () => {
		const { client, animeUpdate, reviewUpdate } = createClient(pendingReview);

		await resolveCopyrightReviewAction(request({ review_id: "7", choice: "clear" }), client, "admin");

		expect(animeUpdate).toHaveBeenCalledWith({ copyright: null });
		expect(reviewUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ resolution: "cleared", resolved_copyright: null }),
		);
	});

	it("rejects keep when the anime has no copyright yet, and already-resolved reviews", async () => {
		const empty = createClient({ ...pendingReview, anime: { copyright: null } });
		const keep = await resolveCopyrightReviewAction(
			request({ review_id: "7", choice: "keep" }),
			empty.client,
			"admin",
		);
		expect(keep).toMatchObject({ status: 400 });

		const resolved = createClient({ ...pendingReview, status: "resolved" });
		const again = await resolveCopyrightReviewAction(
			request({ review_id: "7", choice: "clear" }),
			resolved.client,
			"admin",
		);
		expect(again).toMatchObject({ status: 409 });
		expect(resolved.animeUpdate).not.toHaveBeenCalled();
	});
});

describe("cover visibility migration (136)", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/136_hide_cover_without_copyright.sql", import.meta.url),
		"utf8",
	);

	it("hides existing covers before the trigger exists so the stored URL survives", () => {
		const hide = migration.indexOf("SET cover_url = NULL");
		expect(migration.indexOf("SET cover_source_url = cover_url")).toBeLessThan(hide);
		expect(hide).toBeLessThan(migration.indexOf("CREATE TRIGGER anime_apply_cover_visibility"));
	});

	it("exposes the stored cover only while a copyright notice exists", () => {
		expect(migration).toContain("NEW.cover_source_url := NEW.cover_url;");
		expect(migration).toMatch(
			/NEW\.cover_url := CASE\s*WHEN nullif\(btrim\(coalesce\(NEW\.copyright, ''\)\), ''\) IS NOT NULL THEN NEW\.cover_source_url\s*END;/,
		);
	});
});

describe("cover visibility on upsert migration (139)", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/139_fix_cover_visibility_on_upsert.sql", import.meta.url),
		"utf8",
	);

	it("does not mask the cover while inserting, so ON CONFLICT updates never receive a hidden NULL", () => {
		const fn = migration.slice(
			migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_anime_cover_visibility()"),
			migration.indexOf("CREATE OR REPLACE FUNCTION public.mask_inserted_anime_cover()"),
		);
		const insertBranch = fn.slice(
			fn.indexOf("IF TG_OP = 'INSERT' THEN"),
			fn.indexOf("END IF;", fn.indexOf("IF TG_OP = 'INSERT' THEN")),
		);
		expect(insertBranch).toContain("RETURN NEW;");
		expect(insertBranch).not.toContain("NEW.cover_url :=");
	});

	it("re-masks genuinely inserted rows after insert (AFTER INSERT does not fire on ON CONFLICT updates)", () => {
		expect(migration).toMatch(/CREATE TRIGGER anime_mask_inserted_cover\s+AFTER INSERT ON public\.anime/);
		expect(migration).toContain("SET cover_url = cover_url WHERE id = $1");
	});
});

describe("blank copyright normalization migration (138)", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/138_normalize_blank_copyright.sql", import.meta.url),
		"utf8",
	);

	it("stores blank notices as NULL so importers and the cover check agree on 'no copyright'", () => {
		expect(migration).toContain("WHERE copyright IS NOT NULL AND btrim(copyright) = '';");
		const normalize = migration.indexOf("NEW.copyright := NULL;");
		expect(normalize).toBeGreaterThan(-1);
		// 正規化してから表示判定する（順序が逆だと空白の © で画像が出てしまう）
		expect(normalize).toBeLessThan(migration.indexOf("NEW.cover_url := CASE"));
		expect(migration).toMatch(/WHEN NEW\.copyright IS NOT NULL THEN NEW\.cover_source_url/);
	});
});
