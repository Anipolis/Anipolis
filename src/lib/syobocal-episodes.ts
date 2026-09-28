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
	const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

	// 上限検査の扱いを先に決める（上記ヘッダーの方針）
	const numbers = ordered.map((program) => program.episodeNumber as number);
	const placeholderCount = episodeCount === 1 && numbers.length >= 2;
	const effectiveCount = placeholderCount ? null : episodeCount;
	const hasInRange = effectiveCount !== null && numbers.some((number) => number <= effectiveCount);
	const allOverCount = effectiveCount !== null && numbers.length > 0 && !hasInRange;

	for (const program of ordered) {
		const episodeNumber = program.episodeNumber as number;
		let kind: EpisodeAnomalyKind | null = null;
		let detail = "";

		const firstPid = seen.get(episodeNumber);
		if (firstPid !== undefined) {
			kind = "duplicate";
			detail = `same episode already scheduled by pid ${firstPid}`;
		} else if (effectiveCount !== null && episodeNumber > effectiveCount && hasInRange) {
			// 上限を少し超えるだけなら総話数の古さが濃厚: 報告のみで番号は活かす
			kind = episodeNumber - effectiveCount > EPISODE_OVER_COUNT_TOLERANCE ? "over_count" : "count_mismatch";
			detail = `exceeds the title's ${effectiveCount} episodes`;
		} else if (previous && episodeNumber < previous.episodeNumber) {
			kind = "reset";
			detail = `goes back from episode ${previous.episodeNumber} (pid ${previous.pid})`;
		} else if (previous && episodeNumber - previous.episodeNumber > EPISODE_JUMP_TOLERANCE) {
			kind = "jump";
			detail = `jumps from episode ${previous.episodeNumber} (pid ${previous.pid})`;
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
		} else if (allOverCount && effectiveCount !== null) {
			// 番号は活かす（報告のみ）。順序検査の基準にはそのまま使う
			anomalies.push({
				pid: program.pid,
				kind: "count_mismatch",
				episodeNumber,
				detail: `all numbers exceed the title's ${effectiveCount} episodes (continuous TID or stale count)`,
			});
		}

		seen.set(episodeNumber, program.pid);
		previous = { pid: program.pid, episodeNumber };
	}

	return anomalies;
}

/**
 * 作品ごとにまとめて検査し、pid → 異常 のマップで返す。
 * importer が番組をセッション行に変換するときと、既存セッションの監査で共用する。
 */
export function detectEpisodeAnomaliesByGroup<T extends EpisodeCheckProgram>(
	programs: readonly T[],
	groupKey: (program: T) => number,
	episodeCountFor: (key: number) => number | null,
): Map<number, EpisodeAnomaly & { group: number }> {
	const groups = new Map<number, T[]>();
	for (const program of programs) {
		const key = groupKey(program);
		const values = groups.get(key) ?? [];
		values.push(program);
		groups.set(key, values);
	}
	const result = new Map<number, EpisodeAnomaly & { group: number }>();
	for (const [key, members] of groups) {
		for (const anomaly of detectEpisodeAnomalies(members, episodeCountFor(key))) {
			result.set(anomaly.pid, { ...anomaly, group: key });
		}
	}
	return result;
}
