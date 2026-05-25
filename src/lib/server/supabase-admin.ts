import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SECRET_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import type { Database } from "$lib/supabase/database.types";

export function createServiceRoleClient() {
	return createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
		auth: { persistSession: false },
	});
}
