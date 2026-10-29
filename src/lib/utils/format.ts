/**
 * 相対時間を日本語で返す
 * 例: "2分前", "3時間前", "昨日", "4月10日"
 */
export function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diffSeconds <= 0) return "たった今";
	if (diffSeconds < 60) return `${diffSeconds}秒前`;
	if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分前`;
	if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}時間前`;
	if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}日前`;

	return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export function formatBroadcastRelativeTime(commentCreatedAt: string | Date, broadcastStartAt: string | Date): string {
	const commentMs = new Date(commentCreatedAt).getTime();
	const broadcastMs = new Date(broadcastStartAt).getTime();
	const diffSeconds = Math.round((commentMs - broadcastMs) / 1000);
	const sign = diffSeconds < 0 ? "-" : "+";
	const abs = Math.abs(diffSeconds);
	const minutes = Math.floor(abs / 60);
	const seconds = abs % 60;
	return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 投稿文字数のクラス名を返す（色変化用）
 */
export function charCountClass(length: number, max: number): string {
	if (max <= 0) throw new Error("max must be > 0");
	const ratio = length / max;
	if (ratio >= 1) return "danger";
	if (ratio >= 0.9) return "warning";
	return "";
}

const POST_TIME_JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST の年月日と時刻。サーバー（UTC）とブラウザで表示が食い違わないよう、TZ に依存せず計算する */
function jstParts(value: string | Date) {
	const date = new Date(new Date(value).getTime() + POST_TIME_JST_OFFSET_MS);
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate(),
		clock: `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`,
		seconds: String(date.getUTCSeconds()).padStart(2, "0"),
	};
}

/** 投稿の日付（JST）。実況画面で名前の横に出す。今日なら「今日」、前日なら「昨日」、今年なら「10/21」、それより前は「2025/10/21」 */
export function formatPostDay(value: string | Date, now: Date = new Date()): string {
	const post = jstParts(value);
	const sameDay = (other: ReturnType<typeof jstParts>) =>
		post.year === other.year && post.month === other.month && post.day === other.day;
	if (sameDay(jstParts(now))) return "今日";
	if (sameDay(jstParts(new Date(now.getTime() - 24 * 60 * 60 * 1000)))) return "昨日";
	if (post.year === jstParts(now).year) return `${post.month}/${post.day}`;
	return `${post.year}/${post.month}/${post.day}`;
}

/** 投稿の時刻だけ（JST の「21:03」）。実況画面でアイコンの列（左端）に出す */
export function formatPostClock(value: string | Date): string {
	return jstParts(value).clock;
}

/** 投稿の日時（JST の「2026/10/21 21:03:05」）。時刻の title に出す */
export function formatPostDateTime(value: string | Date): string {
	const post = jstParts(value);
	return `${post.year}/${post.month}/${post.day} ${post.clock}:${post.seconds}`;
}

/** 人数などの数を「12,345」と区切って出す */
export function formatCount(value: number): string {
	return value.toLocaleString("ja-JP");
}

/** 狭い場所向けの短い表記。1万未満は「9,999」、それ以上は「1.2万」「345万」「1.2億」 */
export function formatCompactCount(value: number): string {
	if (value < 10_000) return formatCount(value);
	const [unit, label] = value < 100_000_000 ? [10_000, "万"] : [100_000_000, "億"];
	const scaled = value / unit;
	// 10未満は小数1桁まで（切り捨てて、実際より多く見せない）
	const text = scaled < 10 ? (Math.floor(scaled * 10) / 10).toString() : Math.floor(scaled).toString();
	return `${text}${label}`;
}
