// いまどの Supabase プロジェクトにつながっているか。開発時に本番とステージングを取り違えないために使う。
// scripts/staging からも読むので、$lib エイリアスや SvelteKit 固有の import を持ち込まないこと。

/** 本番のプロジェクト（公開 URL にも出ている ID で、秘密ではない） */
export const PRODUCTION_SUPABASE_REF = "jxrfsbhluooyrkrooger";

export type SupabaseTarget = "production" | "staging" | "unknown";

export function supabaseProjectRef(url: string | null | undefined): string | null {
	return url ? (/^https:\/\/([a-z0-9]+)\.supabase\.co(?:\/|$)/.exec(url)?.[1] ?? null) : null;
}

/**
 * 接続先を、目印（PUBLIC_ANIPOLIS_ENV）だけでなく実際の URL で判定する。
 * 目印が staging でも URL が本番なら production（.env.staging に本番の値を書いてしまった場合）。
 */
export function supabaseTarget(url: string | null | undefined, marker: string | null | undefined): SupabaseTarget {
	const ref = supabaseProjectRef(url);
	if (ref === PRODUCTION_SUPABASE_REF) return "production";
	if (ref && marker === "staging") return "staging";
	return "unknown";
}
