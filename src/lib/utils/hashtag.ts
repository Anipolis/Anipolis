// 日本語・英数字・アンダースコアを含むハッシュタグにマッチ
const HASHTAG_PATTERN = '#([a-zA-Z0-9぀-ゟ゠-ヿ㐀-鿿_]+)';
// ユーザー名（ASCII英数字・アンダースコア）にマッチ
const MENTION_PATTERN = '@([a-zA-Z0-9_]+)';

/**
 * テキストからハッシュタグ名の配列を抽出する
 * 例: "今日も #進撃の巨人 #アニメ" → ["進撃の巨人", "アニメ"]
 */
export function extractHashtags(content: string): string[] {
    const regex = new RegExp(HASHTAG_PATTERN, 'g');
    const matches = [...content.matchAll(regex)];
    const tags = matches.map((m) => m[1] ?? '').filter(Boolean).map((t) => t.toLowerCase());
    return [...new Set(tags)];
}

/**
 * テキストからメンションユーザー名の配列を抽出する
 * 例: "こんにちは @alice と @bob" → ["alice", "bob"]
 */
export function extractMentions(content: string): string[] {
    const regex = new RegExp(MENTION_PATTERN, 'g');
    const matches = [...content.matchAll(regex)];
    const mentions = matches.map((m) => m[1] ?? '').filter(Boolean).map((m) => m.toLowerCase());
    return [...new Set(mentions)];
}

/**
 * テキストをテキストパートとハッシュタグ・メンションパートに分割する
 * XSSを防ぐためにinnerHTMLを使わずSvelteで安全にレンダリングするため
 */
export type ContentPart =
    | { type: 'text'; value: string }
    | { type: 'hashtag'; value: string }
    | { type: 'mention'; value: string };

export function parseContentParts(content: string): ContentPart[] {
    const parts: ContentPart[] = [];
    const combinedRegex = new RegExp(`${HASHTAG_PATTERN}|${MENTION_PATTERN}`, 'g');
    let lastIndex = 0;

    for (const match of content.matchAll(combinedRegex)) {
        if ((match.index ?? 0) > lastIndex) {
            parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }
        if (match[1]) {
            parts.push({ type: 'hashtag', value: match[1] });
        } else if (match[2]) {
            parts.push({ type: 'mention', value: match[2] });
        }
        lastIndex = (match.index ?? 0) + match[0].length;
    }

    if (lastIndex < content.length) {
        parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return parts;
}
