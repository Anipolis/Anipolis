/** マイリストとフォローの案内（ようこそカード）を出すのは、登録からこの日数まで */
export const WELCOME_PERIOD_DAYS = 30;

/**
 * 登録してまだ間もない人か。マイリストを使わずフォローだけしている既存ユーザーに、
 * ある日突然「はじめての人への案内」が出ないようにする。登録日が読めなければ出さない
 */
export function isWithinWelcomePeriod(createdAt: string | null | undefined, now: Date = new Date()): boolean {
	if (!createdAt) return false;
	const created = Date.parse(createdAt);
	if (Number.isNaN(created)) return false;
	return now.getTime() - created < WELCOME_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}
