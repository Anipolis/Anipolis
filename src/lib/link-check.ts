// 公式サイトのリンク点検（scripts/check-official-links.ts）の判定ロジック。
// 取得結果（ステータス・転送先・タイトル・本文の冒頭）から、リンクの状態を分類する。

export type LinkCheckStatus = "ok" | "dead" | "blocked" | "suspicious" | "retry";

export type LinkCheckInput = {
	url: string;
	finalUrl: string | null;
	httpStatus: number | null;
	errorCode: string | null;
	pageTitle: string;
	bodyText: string;
	animeTitles: string[];
};

export type LinkCheckVerdict = { status: LinkCheckStatus; reason: string };

// ドメインの売却・駐車ページ（乗っ取りの前段階や、失効後に業者が取得したもの）
const PARKED_PATTERN =
	// 売買サイトのドメイン名は、別ドメインの末尾（konodan.com の「dan.com」）に一致しないよう単独で探す
	/このドメイン|ドメイン(?:は|を)?(?:販売|売却|購入|取得)|domain (?:is |may be )?for sale|buy this domain|this domain (?:has expired|is parked)|お名前\.com|ムームードメイン|(?<![\w.-])(?:sedoparking|dan|hugedomains|afternic|parkingcrew|bodis)\.com/i;
// ギャンブル・金融スパム（乗っ取られたドメインの典型）
const SPAM_PATTERN =
	/オンラインカジノ|カジノ|casino|バカラ|ポーカー|poker|スロット|ギャンブル|ブックメーカー|キャッシング|闇金|即日融資|出会い系|bitcoin|仮想通貨/i;
// 成人向けの語。成人向けアニメの公式サイトも含まれるので、作品との関連が無いときだけ疑う
const ADULT_PATTERN = /アダルト|エロゲ|エロ動画|セフレ|風俗|人妻|av女優|porn|xxx/i;
// 200 で返る「見つかりません」「公開終了」ページ
const SOFT_404_PATTERN =
	/お探しのページ(?:は|が)見つかりません|ページが見つかりません|ページは存在しません|page not found|404 not found|公開(?:を)?終了(?:いた)?しました|サイト(?:は|を)?閉鎖|掲載(?:を)?終了しました/i;

const DEAD_ERROR_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ERR_INVALID_URL"]);
const TLS_ERROR_PATTERN = /CERT|SSL|TLS|SELF_SIGNED/i;
const RETRY_ERROR_CODES = new Set(["TIMEOUT", "ECONNRESET", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);

// 第2レベルが汎用ラベルの日本・英国などのドメイン（example.co.jp は3ラベルで1組織）
const SECOND_LEVEL_LABELS = new Set(["co", "ne", "or", "ac", "go", "ed", "gr", "lg", "ad", "com", "net", "org"]);

/** 登録ドメイン（組織単位）の近似。www.tv-tokyo.co.jp → tv-tokyo.co.jp */
const SEASON_ORDER: Record<string, number> = { winter: 1, spring: 2, summer: 3, fall: 4 };

/** "2020-winter" を時系列で比べられる数（202001）にする。形が違えば null。季節名の辞書順は時系列と合わない */
export function seasonSortKey(season: string | null | undefined): number | null {
	const match = season?.match(/^(\d{4})-(winter|spring|summer|fall)$/);
	if (!match) return null;
	return Number(match[1]) * 100 + (SEASON_ORDER[match[2] as string] as number);
}

export function registrableDomain(url: string): string | null {
	let host: string;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
	const labels = host.split(".");
	if (labels.length <= 2) return host;
	const secondLevel = labels[labels.length - 2] as string;
	const take = SECOND_LEVEL_LABELS.has(secondLevel) && (labels.at(-1) as string).length === 2 ? 3 : 2;
	return labels.slice(-take).join(".");
}

function bigrams(value: string): Set<string> {
	const text = value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s\p{P}\p{S}]/gu, "");
	const grams = new Set<string>();
	for (let index = 0; index < text.length - 1; index += 1) grams.add(text.slice(index, index + 2));
	return grams;
}

function compact(value: string): string {
	return value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s\p{P}\p{S}]/gu, "");
}

/**
 * ページのタイトル・本文の冒頭に、作品名の手がかりがあるか。2文字単位の一致率に加え、
 * タイトルの語（3文字以上）がそのまま含まれていれば関連ありとする（英字と日本語が混ざる
 * 「DRAGON QUEST -ダイの大冒険-」と「ドラゴンクエスト ダイの大冒険」など）。
 */
export function mentionsAnime(pageText: string, animeTitles: readonly string[]): boolean {
	const page = bigrams(pageText);
	const pageCompact = compact(pageText);
	return animeTitles.some((title) => {
		const words = title
			.normalize("NFKC")
			.split(/[\s\p{P}\p{S}]+/u)
			.map(compact)
			.filter((word) => word.length >= 3);
		if (words.some((word) => pageCompact.includes(word))) return true;
		const grams = bigrams(title);
		if (grams.size === 0) return false;
		let hit = 0;
		for (const gram of grams) if (page.has(gram)) hit += 1;
		return hit / grams.size >= 0.5;
	});
}

export function classifyLink(input: LinkCheckInput): LinkCheckVerdict {
	if (input.errorCode) {
		if (DEAD_ERROR_CODES.has(input.errorCode))
			return { status: "dead", reason: `接続できない（${input.errorCode}）` };
		if (TLS_ERROR_PATTERN.test(input.errorCode))
			return { status: "dead", reason: `証明書エラー（${input.errorCode}）` };
		if (RETRY_ERROR_CODES.has(input.errorCode))
			return { status: "retry", reason: `応答なし（${input.errorCode}）` };
		return { status: "retry", reason: `取得エラー（${input.errorCode}）` };
	}
	const status = input.httpStatus ?? 0;
	if (status === 401 || status === 403 || status === 429) {
		return { status: "blocked", reason: `アクセス拒否（HTTP ${status}、ボット対策の可能性）` };
	}
	if (status === 404 || status === 410) return { status: "dead", reason: `HTTP ${status}` };
	if (status >= 500) return { status: "retry", reason: `HTTP ${status}` };
	if (status < 200 || status >= 400) return { status: "retry", reason: `HTTP ${status}` };

	const head = `${input.pageTitle}\n${input.bodyText.slice(0, 3000)}`;
	const related = mentionsAnime(`${input.pageTitle}\n${input.bodyText.slice(0, 20000)}`, input.animeTitles);
	if (PARKED_PATTERN.test(head)) return { status: "suspicious", reason: "ドメイン売却・駐車ページ" };
	if (SPAM_PATTERN.test(head) && !related) return { status: "suspicious", reason: "ギャンブル・金融系の内容" };
	// タイトルが空のページ（成人向けレーベルの商品ページなど）は作品との関連を判断できないので疑わない
	if (input.pageTitle && ADULT_PATTERN.test(head) && !related) {
		return { status: "suspicious", reason: "作品と無関係な成人向けの内容" };
	}
	if (SOFT_404_PATTERN.test(input.pageTitle) || (SOFT_404_PATTERN.test(head) && !related)) {
		return { status: "dead", reason: "「見つかりません」「公開終了」ページ" };
	}

	if (input.finalUrl) {
		const from = registrableDomain(input.url);
		const to = registrableDomain(input.finalUrl);
		let path = "/";
		try {
			path = new URL(input.finalUrl).pathname;
		} catch {}
		if (from && to && from !== to && (path === "/" || path === "") && !related) {
			return { status: "suspicious", reason: `別ドメインのトップへ転送（${to}）` };
		}
	}
	return { status: "ok", reason: related ? "作品名あり" : "正常に表示" };
}
