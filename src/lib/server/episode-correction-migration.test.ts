import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/131_broadcast_room_episode_correction.sql", import.meta.url),
	"utf8",
);

describe("broadcast room episode correction migration (#246)", () => {
	it("keeps the schedule columns frozen unconditionally", () => {
		const trigger = migration.slice(
			migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_frozen_broadcast_room_schedule()"),
			migration.indexOf("CREATE OR REPLACE FUNCTION public.correct_broadcast_room_session_episode("),
		);
		for (const column of [
			"room_date",
			"scheduled_at",
			"posting_opens_at",
			"source_program_id",
			"source_channel_id",
		]) {
			expect(trigger).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`);
		}
		expect(trigger).toContain("RAISE EXCEPTION 'broadcast room schedule is frozen for session %'");
	});

	it("only lifts the freeze on episode fields while the correction flag is set", () => {
		expect(migration).toContain("current_setting('app.broadcast_room_episode_correction', true)");
		expect(migration).toMatch(
			/NOT episode_correction\s*AND \(\s*NEW\.episode_number IS DISTINCT FROM OLD\.episode_number\s*OR NEW\.episode_title IS DISTINCT FROM OLD\.episode_title\s*OR NEW\.source_snapshot IS DISTINCT FROM OLD\.source_snapshot\s*\)/,
		);
	});

	it("sets the flag transaction-locally inside the RPC and records the anomaly in the snapshot", () => {
		const rpc = migration.slice(
			migration.indexOf("CREATE OR REPLACE FUNCTION public.correct_broadcast_room_session_episode("),
		);
		expect(rpc).toContain("PERFORM set_config('app.broadcast_room_episode_correction', 'on', true);");
		expect(rpc).toContain("jsonb_build_object('episode_anomaly', p_anomaly)");
		expect(rpc).toContain("SECURITY DEFINER");
	});

	it("exposes the RPC to service_role only", () => {
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.correct_broadcast_room_session_episode(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;",
		);
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.correct_broadcast_room_session_episode(uuid, integer, jsonb) TO service_role;",
		);
	});
});
