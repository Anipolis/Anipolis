import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { isUsernameAvailable } from "./queries";

function client(rpcResult: { data: unknown; error: unknown }, existingProfileId: string | null = null) {
	const rpc = vi.fn(async () => rpcResult);
	const maybeSingle = vi.fn(async () => ({
		data: existingProfileId ? { id: existingProfileId } : null,
		error: null,
	}));
	const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
	return { supabase: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from };
}

describe("isUsernameAvailable（#363）", () => {
	it("使用中・保留中の判定は RPC に任せる", async () => {
		const free = client({ data: true, error: null });
		expect(await isUsernameAvailable(free.supabase, "alice")).toBe(true);
		expect(free.rpc).toHaveBeenCalledWith("is_username_available", { p_username: "alice" });
		expect(free.from).not.toHaveBeenCalled();

		const held = client({ data: false, error: null });
		expect(await isUsernameAvailable(held.supabase, "alice")).toBe(false);
	});

	it("RPC が失敗したら、使用中かどうかだけで判定する", async () => {
		const error = { code: "PGRST202", message: "function not found" };
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await isUsernameAvailable(client({ data: null, error }).supabase, "alice")).toBe(true);
		expect(await isUsernameAvailable(client({ data: null, error }, "user-1").supabase, "alice")).toBe(false);
	});
});
