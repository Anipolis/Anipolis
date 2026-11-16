import { createClient } from "@supabase/supabase-js";
import type { Database } from "#lib/supabase/database.types.ts";
import { SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY } from "$app/env/private";
import { PUBLIC_SUPABASE_URL } from "$app/env/public";

export function createServiceRoleClient() {
	const secretKey = SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY;
	if (!secretKey) throw new Error("Supabase secret key is not configured");
	return createClient<Database>(PUBLIC_SUPABASE_URL, secretKey, {
		auth: { persistSession: false },
	});
}
