export const EXCHANGE_SUBJECTIVE_TAG_OPTIONS = [
	"泣ける",
	"心温まる",
	"胸熱",
	"燃える",
	"尊い",
	"癒される",
	"切ない",
	"感動",
	"爽快",
	"ドキドキ",
	"怖い",
	"狂気",
	"脳破壊",
	"考察したくなる",
	"中毒性高い",
	"哲学的",
	"笑える",
	"美しい",
	"学び",
	"懐かしい",
] as const;

export type ExchangeSubjectiveTag = (typeof EXCHANGE_SUBJECTIVE_TAG_OPTIONS)[number];

export const MAX_EXCHANGE_SUBJECTIVE_TAGS = 3;

const EXCHANGE_SUBJECTIVE_TAG_SET = new Set<ExchangeSubjectiveTag>(EXCHANGE_SUBJECTIVE_TAG_OPTIONS);

export function isExchangeSubjectiveTag(tag: string): tag is ExchangeSubjectiveTag {
	return EXCHANGE_SUBJECTIVE_TAG_SET.has(tag as ExchangeSubjectiveTag);
}

export function toExchangeSubjectiveTags(values: Iterable<unknown>): string[] {
	const tags: string[] = [];
	for (const value of values) {
		if (typeof value !== "string") continue;
		const tag = value.trim();
		if (!tag || tags.includes(tag)) continue;
		tags.push(tag);
	}
	return tags;
}

export function toValidExchangeSubjectiveTags(values: Iterable<unknown>): ExchangeSubjectiveTag[] {
	return toExchangeSubjectiveTags(values).filter(isExchangeSubjectiveTag).slice(0, MAX_EXCHANGE_SUBJECTIVE_TAGS);
}

export function validateExchangeSubjectiveTags(tags: readonly string[]): tags is readonly ExchangeSubjectiveTag[] {
	return tags.length <= MAX_EXCHANGE_SUBJECTIVE_TAGS && tags.every(isExchangeSubjectiveTag);
}
