import { createClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import type { Database } from "$lib/supabase/database.types";

export function createServiceRoleClient() {
	const secretKey = env["SUPABASE_SECRET_KEY"] ?? env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!secretKey) throw new Error("Supabase secret key is not configured");
	return createClient<Database>(PUBLIC_SUPABASE_URL, secretKey, {
		auth: { persistSession: false },
	});
}
