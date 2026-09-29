import type { ActionResult } from "@sveltejs/kit";
import type { ReactionKind } from "./reaction-feedback";

/**
 * リアクション成功時に、楽観更新した状態をサーバーの結果で確定させる（#100）。
 *
 * 以前は成功後に SvelteKit の update()（= invalidateAll）でページ全体を再取得していたが、
 * ストリーミング配信のタイムラインでは再取得のたびにスケルトンへ切り替わり、
 * スクロール位置や展開状態も失われた。楽観更新は既に入っているので、
 * サーバーが返した最終状態（liked / bookmarked / reposted）で件数と状態を合わせるだけにする。
 */

const RESULT_FLAG: Record<ReactionKind, "liked" | "bookmarked" | "reposted"> = {
	like: "liked",
	bookmark: "bookmarked",
	repost: "reposted",
};

export type ConfirmedReaction = {
	/** サーバーが確定した状態。結果に含まれない場合は楽観更新どおり */
	active: boolean;
	/** 操作前の件数に、確定した状態の差分を足した件数 */
	count: number;
};

export function confirmReaction(
	kind: ReactionKind,
	result: ActionResult,
	before: { wasActive: boolean; countBefore: number },
): ConfirmedReaction {
	const flag = RESULT_FLAG[kind];
	const value = result.type === "success" ? (result.data as Record<string, unknown> | undefined)?.[flag] : undefined;
	const active = typeof value === "boolean" ? value : !before.wasActive;
	// 例: いいね済み(5件)で解除 → 4件。未いいね(5件)で押したがサーバーは「既にいいね済み」→ 5件のまま
	const count = before.countBefore + (active ? 1 : 0) - (before.wasActive ? 1 : 0);
	return { active, count: Math.max(0, count) };
}
