import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";

declare module "*.md?raw" {
	const content: string;
	export default content;
}

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
		}
		interface PageData {
			session?: Session | null;
			user?: User | null;
		}
	}
}
