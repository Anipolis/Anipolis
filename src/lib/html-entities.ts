// 取得した HTML のテキストに残る文字参照（&copy; / &#169; / &#xA9; など）を文字へ戻す。
// © 収集系のスクリプト（collect:copyright・Wayback 回収など）で共有する。

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	ensp: " ",
	emsp: " ",
	thinsp: " ",
	copy: "©",
	reg: "®",
	trade: "™",
	frasl: "⁄",
	middot: "・",
	bull: "•",
	hellip: "…",
	ndash: "–",
	mdash: "—",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
	laquo: "«",
	raquo: "»",
	times: "×",
	star: "☆",
	starf: "★",
	hearts: "♥",
	sup2: "²",
	sup3: "³",
	// 作品名・社名に出るアクセント付きラテン文字（Pokémon など）
	aacute: "á",
	agrave: "à",
	acirc: "â",
	auml: "ä",
	eacute: "é",
	egrave: "è",
	ecirc: "ê",
	euml: "ë",
	iacute: "í",
	iuml: "ï",
	oacute: "ó",
	ocirc: "ô",
	ouml: "ö",
	uacute: "ú",
	ucirc: "û",
	uuml: "ü",
	ccedil: "ç",
	ntilde: "ñ",
	szlig: "ß",
};

/**
 * 名前付き・10進・16進の文字参照を1回の走査で文字に戻す（「&amp;copy;」を
 * 「©」まで二重に戻さない）。未知の名前付き参照はそのまま残す。
 */
export function decodeHtmlEntities(value: string): string {
	return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
		if (body.startsWith("#")) {
			const codePoint =
				body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
			return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
				? String.fromCodePoint(codePoint)
				: match;
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? match;
	});
}
