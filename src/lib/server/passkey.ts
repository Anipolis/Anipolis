import { env as publicEnv } from "$env/dynamic/public";

/**
 * パスキー UI を出すかどうか。Supabase 側で passkey（と WebAuthn の RP 設定）を
 * 有効化してから true にする。未設定のまま UI を出すと、すべての操作が失敗する。
 */
export function isPasskeyEnabled(): boolean {
	return publicEnv["PUBLIC_PASSKEY_ENABLED"] === "true";
}
