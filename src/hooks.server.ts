import { createServerClient } from "@supabase/ssr";
import type { Handle } from "@sveltejs/kit";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";

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

	// 同一リクエスト内でのPromiseキャッシュ（layout + page の両方で呼ばれても Auth リクエストは1回）
	let _sessionPromise: ReturnType<typeof computeSession> | undefined;
	const computeSession = async () => {
		const {
			data: { user },
			error,
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) return { session: null, user: null };

		// getSession() is called after getUser() validation; session.user must not be trusted directly
		const {
			data: { session },
		} = await event.locals.supabase.auth.getSession();

		return { session, user };
	};
	event.locals.safeGetSession = () => {
		_sessionPromise ??= computeSession();
		return _sessionPromise;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === "content-range" || name === "x-supabase-api-version";
		},
	});
};
