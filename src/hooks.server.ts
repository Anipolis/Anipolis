import { createServerClient } from "@supabase/ssr";
import { type Handle, json } from "@sveltejs/kit";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { isApiRateLimited } from "$lib/server/rate-limit";

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith("/api/")) {
		let clientKey = "unknown";
		try {
			clientKey = event.getClientAddress();
		} catch {
			// アドレスを取得できないアダプターでは共有バケットにフォールバック
		}
		if (isApiRateLimited(event.url.pathname, event.request.method, clientKey)) {
			return json({ message: "リクエストが多すぎます。しばらく待ってからお試しください" }, { status: 429 });
		}
	}

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
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

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === "content-range" || name === "x-supabase-api-version";
		},
	});
};
