// 権利表記（©）の人力確認キュー（anime_copyright_reviews）の種類。
// サーバー処理（$lib/server/copyright-reviews）と管理画面の両方で使う。

export const COPYRIGHT_REVIEW_KINDS = [
	"collector_multiple",
	"annict_ambiguous",
	"annict_mismatch",
	"annict_shared",
] as const;
export type CopyrightReviewKind = (typeof COPYRIGHT_REVIEW_KINDS)[number];

export const COPYRIGHT_REVIEW_KIND_LABELS: Record<CopyrightReviewKind, { label: string; description: string }> = {
	collector_multiple: {
		label: "公式サイトの候補が複数",
		description: "公式サイトから複数の © が取れた作品です。正しい表記を選んでください。",
	},
	annict_ambiguous: {
		label: "Annictの候補が複数",
		description: "同じ作品に紐づく Annict の © が食い違っています。",
	},
	annict_mismatch: {
		label: "既存の©と食い違い",
		description: "Annict の © が、いま入っている © と異なります。既存の値が誤っていることもあります。",
	},
	annict_shared: {
		label: "シリーズ共通の©",
		description:
			"別作品と同じ © を入れた作品です。続編に1期の © が入っていないか確認してください。問題なければ一括で承認できます。",
	},
};

export function isCopyrightReviewKind(value: string | null): value is CopyrightReviewKind {
	return COPYRIGHT_REVIEW_KINDS.includes(value as CopyrightReviewKind);
}
