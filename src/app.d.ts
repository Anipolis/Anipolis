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
		// Cloudflare Workers の実行コンテキストのうち使う部分だけ（adapter-cloudflare の ambient 型は
		// @cloudflare/workers-types ごと読み込むと DOM の型とぶつかるため取り込まない）。dev では無い
		interface Platform {
			ctx?: { waitUntil(promise: Promise<unknown>): void };
		}
		interface PageData {
			session?: Session | null;
			user?: User | null;
		}
		// shallow routing（pushState）で持たせる状態
		interface PageState {
			/** ログイン画面の上に重ねて出している規約・ポリシー */
			legal?: { title: string; html: string };
		}
	}
}
