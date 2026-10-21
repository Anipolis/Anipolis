/**
 * 投稿本文の制御文字（#245）。クライアントからも使うので $lib/server に置かない。
 *
 * 本文に残してよい制御文字は、タブ（U+0009）・改行（LF U+000A・CR U+000D）だけ。
 * それ以外の C0（U+0000〜U+001F）・DEL（U+007F）・C1（U+0080〜U+009F）は表示されないのに文字数に数えられ、
 * 制御文字だけの投稿が「本文あり」として保存されて、タイムラインや読み上げソフトを壊していた。
 * DB の CHECK 制約（posts_content_no_control_chars、173）と同じ範囲を外す。
 * 絵文字の結合（ZWJ U+200D）・異体字セレクタ・結合文字は制御文字ではないので残す。
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字そのものを取り除くための正規表現
export const DISALLOWED_POST_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** 本文から、残してはいけない制御文字を取り除き、前後の空白を落とす */
export function normalizePostContent(content: string): string {
	return content.replace(DISALLOWED_POST_CONTROL_CHARS, "").trim();
}
