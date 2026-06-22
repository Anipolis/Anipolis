import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { StoredAccount } from "$lib/types";

const COOKIE_NAME = "anipolis_extra_accounts";
const COOKIE_OPTS = {
	httpOnly: true,
	secure: !dev,
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60 * 24 * 7,
};

export function getExtraAccounts(cookies: Cookies): StoredAccount[] {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(a): a is StoredAccount =>
				typeof a?.userId === "string" &&
				typeof a?.refreshToken === "string" &&
				typeof a?.profile?.username === "string",
		);
	} catch {
		return [];
	}
}

export function setExtraAccounts(cookies: Cookies, accounts: StoredAccount[]): void {
	const capped = accounts.slice(0, 2);
	if (capped.length === 0) {
		cookies.delete(COOKIE_NAME, { path: "/" });
		return;
	}
	cookies.set(COOKIE_NAME, JSON.stringify(capped), COOKIE_OPTS);
}
