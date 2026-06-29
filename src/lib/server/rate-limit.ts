/**
 * インメモリの固定ウィンドウ・レートリミッター。
 *
 * インスタンスごとのメモリなのでサーバーレス環境では完全な保証にはならないが、
 * 単一インスタンス内の連投・スパム・安価なDoSを止める一次防壁として機能する。
 * 厳密な制限が必要になったら CDN / Redis ベースに置き換えること。
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweepAt = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();

	if (now - lastSweepAt > SWEEP_INTERVAL_MS) {
		for (const [k, bucket] of buckets) {
			if (bucket.resetAt <= now) buckets.delete(k);
		}
		lastSweepAt = now;
	}

	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return false;
	}

	bucket.count += 1;
	return bucket.count > limit;
}

export interface RateRule {
	/** ルール名（バケットキーの一部になる） */
	name: string;
	pattern: RegExp;
	/** 未指定なら全メソッドに適用 */
	methods?: string[];
	limit: number;
	windowMs: number;
}

/** API ルートのレート制限ルール（IP 単位） */
export const API_RATE_RULES: RateRule[] = [
	{ name: "upload", pattern: /^\/api\/upload/, methods: ["POST"], limit: 10, windowMs: 60_000 },
	// 実況中の連投を考慮して 20回/分（3秒に1回ペース）まで許容
	{ name: "post-create", pattern: /^\/api\/posts$/, methods: ["POST"], limit: 20, windowMs: 60_000 },
	{ name: "report", pattern: /^\/api\/reports$/, methods: ["POST"], limit: 5, windowMs: 60_000 },
	{ name: "reaction", pattern: /^\/api\/posts\/[^/]+\/reactions$/, limit: 60, windowMs: 60_000 },
	{ name: "search", pattern: /^\/api\/(anime|users)\/search/, limit: 30, windowMs: 10_000 },
	{ name: "anime-count", pattern: /^\/api\/anime\/count$/, limit: 30, windowMs: 10_000 },
	{ name: "room-posts", pattern: /^\/api\/rooms\/posts$/, limit: 60, windowMs: 60_000 },
	{
		name: "room-experiment-visit",
		pattern: /^\/api\/room-experiment-visits$/,
		methods: ["POST"],
		limit: 60,
		windowMs: 60_000,
	},
	{
		name: "room-experiment-visit-update",
		pattern: /^\/api\/room-experiment-visits\/[^/]+\/(heartbeat|exit)$/,
		methods: ["POST"],
		limit: 180,
		windowMs: 60_000,
	},
	{ name: "account-switch", pattern: /^\/api\/account-switch$/, methods: ["POST"], limit: 10, windowMs: 60_000 },
];

/** マッチしたルールに対して制限超過なら true を返す */
export function isApiRateLimited(pathname: string, method: string, clientKey: string): boolean {
	for (const rule of API_RATE_RULES) {
		if (!rule.pattern.test(pathname)) continue;
		if (rule.methods && !rule.methods.includes(method)) continue;
		return isRateLimited(`${rule.name}:${clientKey}`, rule.limit, rule.windowMs);
	}
	return false;
}
