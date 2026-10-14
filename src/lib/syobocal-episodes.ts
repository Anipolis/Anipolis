/**
 * しょぼいカレンダーの話数（Count）の妥当性検査（GitHub #246）。
 *
 * Count は編集者の入力で、TID の誤マッピング・再放送・分割クール・通期 TID の続き番号などが
 * そのまま流れてくる。検証せずに episode_number として保存すると、カレンダーに 22/13 のような
 * バッジが出たり、実況履歴が 12 話から 73 話へ飛んだり、同じ 12 話が別日に並んだりする。
 *
 * 方針:
 *   - 単純な上限 clamp で隠さない。異常候補は episode_number を付けずに（ルーム自体は開く）
 *     レビュー対象として報告し、人が TID の有効期間や手動マッピングで直す。
 *   - 再放送（Flag bit 8）は選定段階で除外済み。ここに来る番組は本放送扱い。
 *   - 総集編・特別編は Count が無いのが普通で、その場合は検査対象外（イレギュラー放送
 *     オーバーライドが表示ラベルと話数カウントを管理する）。
 *   - 総話数（MAL 由来）は放送中の作品では当てにならないことが多い（放送前は 1 や不明のまま、
 *     クール途中で更新されない）。そこで上限超過は「同じ作品で上限以下の番号も観測されているのに
 *     途中から超えた」場合（12/12 の次に 13, 14…）だけ適用対象にする。全番号が上限を超える
 *     （通し番号の TID、または総話数が古い）場合は番号を活かしたまま count_mismatch として報告し、
 *     人が総話数か手動マッピングの有効期間を直す。総話数 1 で複数の番号付き放送がある場合は
 *     プレースホルダーとみなし、上限検査をしない。
 */

export type EpisodeAnomalyKind = "over_count" | "jump" | "duplicate" | "reset" | "count_mismatch";

/** セッションから話数を外す（自動適用しない）種別。count_mismatch は報告のみ */
export const APPLIED_EPISODE_ANOMALY_KINDS: ReadonlySet<EpisodeAnomalyKind> = new Set([
	"over_count",
	"jump",
	"duplicate",
	"reset",
]);

export function isAppliedEpisodeAnomaly(kind: EpisodeAnomalyKind): boolean {
	return APPLIED_EPISODE_ANOMALY_KINDS.has(kind);
}

export type EpisodeCheckProgram = {
	pid: number;
	startsAt: string;
	episodeNumber: number | null;
};

export type EpisodeAnomaly = {
	pid: number;
	kind: EpisodeAnomalyKind;
	episodeNumber: number;
	/** 比較対象（総話数、直前の話数、重複相手の pid）を人が読める形で */
	detail: string;
};

/** 週1本の放送で 1〜2 週飛ぶ程度は特番や休止で起こり得るので、それを超える差だけを飛びとみなす */
export const EPISODE_JUMP_TOLERANCE = 3;

/**
 * 総話数を 1〜2 話だけ超えるのは MAL 側の総話数が古い（最終話数が後から確定した）ことが多い。
 * それ以上超えたときだけ「別シーズンの続き番号が流れ込んだ」とみなして番号を外す。
 */
export const EPISODE_OVER_COUNT_TOLERANCE = 2;

/**
 * 総話数の文字列（MAL 由来の "12" や "Unknown"）を検査に使える整数へ。
 * 不明なら null を返し、上限検査はスキップする。
 */
export function parseEpisodeCount(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
	// "12abc" を 12 と読まない: 数字だけの文字列に限る
	const text = value.trim();
	if (!/^\d+$/.test(text)) return null;
	const parsed = Number(text);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** セッションの source_snapshot に「話数異常で番号を外した」印があるか（カレンダーの補完抑止に使う） */
export function isEpisodeSuppressedSnapshot(snapshot: unknown): boolean {
	if (!snapshot || typeof snapshot !== "object") return false;
	const anomaly = (snapshot as { episode_anomaly?: unknown }).episode_anomaly;
	if (!anomaly || typeof anomaly !== "object") return false;
	return (anomaly as { applied?: unknown }).applied === true;
}

/**
 * 1 作品分の主局番組を放送順に並べ、話数の異常を検出する。
 * 戻り値は pid ごとの異常。異常が無い番組は含まれない。
 */
export function detectEpisodeAnomalies(
	programs: readonly EpisodeCheckProgram[],
	episodeCount: number | null,
): EpisodeAnomaly[] {
	const ordered = [...programs]
		.filter((program) => program.episodeNumber !== null)
		.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.pid - right.pid);

	const anomalies: EpisodeAnomaly[] = [];
	const seen = new Map<number, number>(); // episodeNumber -> 最初に出た pid
	let previous: { pid: number; episodeNumber: number } | null = null;

	// 上限検査の扱い（上記ヘッダーの方針）。総話数 1 で複数話ならプレースホルダーとみなす
	const placeholderCount = episodeCount === 1 && ordered.length >= 2;
	const effectiveCount = placeholderCount ? null : episodeCount;
	// 判定時点までに上限内の番号を観測したか。未来の番組で判断しない（[15, 1] の 15 は報告のみ）
	let seenInRange = false;

	for (const program of ordered) {
		const episodeNumber = program.episodeNumber as number;
		let kind: EpisodeAnomalyKind | null = null;
		let detail = "";

		const firstPid = seen.get(episodeNumber);
		if (firstPid !== undefined) {
			kind = "duplicate";
			detail = `same episode already scheduled by pid ${firstPid}`;
		} else if (previous && episodeNumber < previous.episodeNumber) {
			// 順序検査（巻き戻り・飛び）は総話数検査より先に行う。通し番号のシリーズでは
			// 全番号が総話数を超えるため、総話数検査を先にすると 80 → 150 → 81 の飛びや
			// 80 → 79 の巻き戻りが報告のみの count_mismatch に吸収されてしまう
			kind = "reset";
			detail = `goes back from episode ${previous.episodeNumber} (pid ${previous.pid})`;
		} else if (previous && episodeNumber - previous.episodeNumber > EPISODE_JUMP_TOLERANCE) {
			kind = "jump";
			detail = `jumps from episode ${previous.episodeNumber} (pid ${previous.pid})`;
		} else if (effectiveCount !== null && episodeNumber > effectiveCount) {
			// 上限内の番号を先に観測していて、かつ大きく超えたときだけ番号を外す。
			// 少し超えるだけなら総話数の古さが濃厚、上限内を一度も見ていなければ通し番号の TID:
			// どちらも報告のみで番号は活かす
			kind =
				seenInRange && episodeNumber - effectiveCount > EPISODE_OVER_COUNT_TOLERANCE
					? "over_count"
					: "count_mismatch";
			detail = seenInRange
				? `exceeds the title's ${effectiveCount} episodes`
				: `exceeds the title's ${effectiveCount} episodes before any in-range episode (continuous TID or stale count)`;
		}

		if (kind && isAppliedEpisodeAnomaly(kind)) {
			anomalies.push({ pid: program.pid, kind, episodeNumber, detail });
			// 異常な番号は「直前の話数」として引き継がない。誤った 73 を基準にすると
			// 次の正しい 13 が reset 扱いになる。重複は最初の出現を基準のまま残す。
			continue;
		}
		if (kind) {
			// 報告のみ: 番号は活かし、順序検査の基準にも使う
			anomalies.push({ pid: program.pid, kind, episodeNumber, detail });
		}

		if (effectiveCount !== null && episodeNumber <= effectiveCount) seenInRange = true;
		seen.set(episodeNumber, program.pid);
		previous = { pid: program.pid, episodeNumber };
	}

	return anomalies;
}

/** 作品（グループ）と pid の組で異常を引くキー。共有 TID では同じ pid が複数作品に選ばれ得る */
export function episodeAnomalyKey(group: number, pid: number): string {
	return `${group}:${pid}`;
}

/**
 * 作品ごとにまとめて検査し、"作品:pid" → 異常 のマップで返す。
 * pid だけをキーにすると、同じ TID を有効期間で分け合う複数の MAL 作品が同じ番組を選んだときに
 * 一方の判定がもう一方を上書きする。importer の照合も同じキーで行う。
 */
export function detectEpisodeAnomaliesByGroup<T extends EpisodeCheckProgram>(
	programs: readonly T[],
	groupKey: (program: T) => number,
	episodeCountFor: (key: number) => number | null,
): Map<string, EpisodeAnomaly & { group: number }> {
	const groups = new Map<number, T[]>();
	for (const program of programs) {
		const key = groupKey(program);
		const values = groups.get(key) ?? [];
		values.push(program);
		groups.set(key, values);
	}
	const result = new Map<string, EpisodeAnomaly & { group: number }>();
	for (const [key, members] of groups) {
		for (const anomaly of detectEpisodeAnomalies(members, episodeCountFor(key))) {
			result.set(episodeAnomalyKey(key, anomaly.pid), { ...anomaly, group: key });
		}
	}
	return result;
}

/** 終了月と同じ月のうちは、最後の放送からこの日数が過ぎるまで「完結」とみなさない（未登録の最終回対策） */
export const FINAL_EPISODE_SETTLE_DAYS = 8;

export type FinalEpisodeSession = {
	scheduledAt: string;
	episodeNumber: number | null;
};

export type FinalEpisodeEnd = {
	/** しょぼいの FirstEndYear / FirstEndMonth（放送終了月）。未登録なら null */
	endYear: number | null;
	endMonth: number | null;
	/** マッピングの有効期間の終わり（共有 TID を分割した作品）。YYYY-MM-DD */
	validTo: string | null;
};

/**
 * しょぼい由来の放送セッションから「確定した総話数」を導く。確定できなければ null。
 *
 * しょぼいの Count は登録済みの放送分しか分からず、長期作品は1クール分だけ先に
 * 登録されることもあるため、放送中・放送前の最大話数を総話数としては使わない。
 * 次をすべて満たすときだけ最大話数を確定値とする:
 *   - 放送終了月（またはマッピングの有効期間の終わり）が登録済みで、既に過ぎている
 *   - 未来のセッションが残っていない
 *   - 第1話から最大話数まで欠けなく揃っている（通期 TID の続き番号・異常で番号を外した回を除外）
 */
export function confirmedFinalEpisodeCount(
	sessions: readonly FinalEpisodeSession[],
	end: FinalEpisodeEnd,
	now: Date,
): number | null {
	if (sessions.length === 0) return null;
	const nowMs = now.getTime();
	if (sessions.some((session) => Date.parse(session.scheduledAt) > nowMs)) return null;
	const lastAiredMs = Math.max(...sessions.map((session) => Date.parse(session.scheduledAt)));

	const today = jstDayKey(now);
	const settled = nowMs - lastAiredMs >= FINAL_EPISODE_SETTLE_DAYS * 86_400_000;
	let ended = end.validTo !== null && end.validTo < today;
	if (!ended && end.endYear !== null && end.endMonth !== null) {
		const endIndex = end.endYear * 12 + end.endMonth;
		const currentIndex = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
		ended = endIndex < currentIndex || (endIndex === currentIndex && settled);
	}
	if (!ended) return null;

	const numbered = sessions.filter(
		(session) =>
			session.episodeNumber !== null && Number.isInteger(session.episodeNumber) && session.episodeNumber > 0,
	);
	if (numbered.length === 0) return null;
	// 最後の番号付き放送より後に番号の無い放送が残っていれば確定しない。最終回の Count
	// 未登録や、異常検出で番号を外した回（over_count 等）を総話数から黙って落とすと
	// 「全11話」のような過少な値を MAL より優先して保存してしまう。途中の番号無し
	// （総集編・特番）は 1..max の連続性で判定できるので許容する。
	const lastNumberedMs = Math.max(...numbered.map((session) => Date.parse(session.scheduledAt)));
	if (sessions.some((session) => !numbered.includes(session) && Date.parse(session.scheduledAt) > lastNumberedMs)) {
		return null;
	}
	const numbers = new Set(numbered.map((session) => session.episodeNumber as number));
	const max = Math.max(...numbers);
	return numbers.size === max ? max : null;
}

function jstDayKey(value: Date): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(value);
}
