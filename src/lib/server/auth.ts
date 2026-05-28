type AuthUser = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>;
type AuthSession = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["session"]>;

function getJwtPayload(session: AuthSession | null) {
	if (!session?.access_token) return null;

	const [, payload] = session.access_token.split(".");
	if (!payload) return null;

	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
			amr?: { method?: string }[];
			app_metadata?: {
				provider?: string;
				providers?: string | string[];
			};
			user_metadata?: {
				has_password?: boolean | string;
			};
		};
	} catch {
		return null;
	}
}

export function hasPasswordProvider(user: AuthUser, session: AuthSession | null = null) {
	const providers = user.app_metadata.providers;
	const providerList = typeof providers === "string" ? [providers] : Array.isArray(providers) ? providers : [];
	const payload = getJwtPayload(session);
	const payloadProviders = payload?.app_metadata?.providers;
	const payloadProviderList =
		typeof payloadProviders === "string"
			? [payloadProviders]
			: Array.isArray(payloadProviders)
				? payloadProviders
				: [];

	return (
		user.identities?.some((id) => id.provider === "email") ||
		user.app_metadata.provider === "email" ||
		providerList.includes("email") ||
		user.user_metadata["has_password"] === true ||
		user.user_metadata["has_password"] === "true" ||
		payload?.app_metadata?.provider === "email" ||
		payloadProviderList.includes("email") ||
		payload?.user_metadata?.has_password === true ||
		payload?.user_metadata?.has_password === "true" ||
		payload?.amr?.some((entry) => entry.method === "password")
	);
}
