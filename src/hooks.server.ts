import { createServerClient } from "@supabase/ssr";
import type { Session, User } from "@supabase/supabase-js";
import type { Handle } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";

// dev サーバーのライフタイム中に保持するセッションキャッシュ
let devCache: { session: Session; user: User; expiresAt: number } | null = null;

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll() {
				return event.cookies.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options: Parameters<typeof event.cookies.set>[2] }[]) {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: "/" });
				});
			},
		},
	});

	event.locals.safeGetSession = async () => {
		if (dev && env.DEV_USER_EMAIL && env.DEV_USER_PASSWORD) {
			const now = Date.now() / 1000;

			// キャッシュが有効なら再利用
			if (devCache && devCache.expiresAt > now + 60) {
				// RLS が効くようにリクエストスコープのクライアントにもセットする
				await event.locals.supabase.auth.setSession({
					access_token: devCache.session.access_token,
					refresh_token: devCache.session.refresh_token,
				});
				return { session: devCache.session, user: devCache.user };
			}

			// キャッシュ切れ or 初回 → 再ログイン
			const { data, error } = await event.locals.supabase.auth.signInWithPassword({
				email: env.DEV_USER_EMAIL,
				password: env.DEV_USER_PASSWORD,
			});

			if (!error && data.session) {
				devCache = {
					session: data.session,
					user: data.session.user,
					expiresAt: data.session.expires_at ?? now + 3600,
				};
				return { session: data.session, user: data.session.user };
			}

			console.warn("[dev] 開発アカウントへのログイン失敗:", error?.message);
			return { session: null, user: null };
		}

		// 本番パス
		const {
			data: { session },
		} = await event.locals.supabase.auth.getSession();

		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error,
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) return { session: null, user: null };

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === "content-range" || name === "x-supabase-api-version";
		},
	});
};
