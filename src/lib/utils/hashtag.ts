// 日本語・英数字・アンダースコアを含むハッシュタグにマッチ
const HASHTAG_PATTERN = '#([a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u3400-\u9FFF_]+)';

/**
 * テキストからハッシュタグ名の配列を抽出する
 * 例: "神回！ #進撃の巨人 #アニメ" → ["進撃の巨人", "アニメ"]
 */
export function extractHashtags(content: string): string[] {
    const regex = new RegExp(HASHTAG_PATTERN, 'g');
    const matches = [...content.matchAll(regex)];
    const tags = matches.map((m) => m[1] ?? '').filter(Boolean).map((t) => t.toLowerCase());
    return [...new Set(tags)];
}

/**
 * テキストをテキストパーツとハッシュタグパーツに分割する
 * XSS を防ぐためにinnerHTMLを使わずSvelteで安全にレンダリングするため
 */
export type ContentPart =
    | { type: 'text'; value: string }
    | { type: 'hashtag'; value: string };

export function parseContentParts(content: string): ContentPart[] {
    const parts: ContentPart[] = [];
    const regex = new RegExp(HASHTAG_PATTERN, 'g');
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }
        const tag = match[1];
        if (tag) {
            parts.push({ type: 'hashtag', value: tag });
        }
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
        parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return parts;
}
