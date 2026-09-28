import { describe, expect, it } from "vitest";
import {
	detectEpisodeAnomalies,
	detectEpisodeAnomaliesByGroup,
	isAppliedEpisodeAnomaly,
	isEpisodeSuppressedSnapshot,
	parseEpisodeCount,
} from "./syobocal-episodes";

function program(pid: number, week: number, episodeNumber: number | null) {
	// 毎週火曜 24:30 の枠を week 週目として並べる
	const day = String(6 + week * 7).padStart(2, "0");
	return { pid, startsAt: `2026-10-${day}T15:30:00.000Z`, episodeNumber };
}

describe("parseEpisodeCount", () => {
	it("accepts positive integers from strings and numbers, rejects unknowns", () => {
		expect(parseEpisodeCount("12")).toBe(12);
		expect(parseEpisodeCount(24)).toBe(24);
		expect(parseEpisodeCount("Unknown")).toBeNull();
		expect(parseEpisodeCount("0")).toBeNull();
		expect(parseEpisodeCount("12abc")).toBeNull();
		expect(parseEpisodeCount(" 12 ")).toBe(12);
		expect(parseEpisodeCount(12.5)).toBeNull();
		expect(parseEpisodeCount(null)).toBeNull();
	});
});

describe("detectEpisodeAnomalies", () => {
	it("accepts a normal weekly run with a one-week break", () => {
		const programs = [program(1, 0, 1), program(2, 1, 2), program(3, 3, 3), program(4, 4, 4)];
		expect(detectEpisodeAnomalies(programs, 12)).toEqual([]);
	});

	it("ignores unnumbered slots such as recaps and specials", () => {
		const programs = [program(1, 0, 1), program(2, 1, null), program(3, 2, 2)];
		expect(detectEpisodeAnomalies(programs, 12)).toEqual([]);
	});

	it("reports numbers slightly above the episode count but only drops clear overshoots", () => {
		// 12/12 の後に 13, 14（総話数が古い可能性）→ 報告のみ、15 以降（3 話以上超過）→ 番号を外す
		const programs = [program(1, 0, 12), program(2, 1, 13), program(3, 2, 14), program(4, 3, 15)];
		const anomalies = detectEpisodeAnomalies(programs, 12);
		expect(anomalies.map((a) => [a.pid, a.kind])).toEqual([
			[2, "count_mismatch"],
			[3, "count_mismatch"],
			[4, "over_count"],
		]);
		expect(anomalies[0]?.detail).toContain("12 episodes");
		expect(isAppliedEpisodeAnomaly("over_count")).toBe(true);
	});

	it("only drops an overshoot after an in-range episode was actually observed first", () => {
		// 15 話が先に来て、その後に 1 話: 15 は報告のみ（未来の 1 を根拠に外さない）、1 は巻き戻り
		const programs = [program(1, 0, 15), program(2, 1, 1)];
		expect(detectEpisodeAnomalies(programs, 12).map((a) => [a.pid, a.kind])).toEqual([
			[1, "count_mismatch"],
			[2, "reset"],
		]);
	});

	it("skips the count check when the episode count is unknown", () => {
		const programs = [program(1, 0, 40), program(2, 1, 41)];
		expect(detectEpisodeAnomalies(programs, null)).toEqual([]);
	});

	it("flags a sudden jump and keeps the last good episode as the baseline", () => {
		// 12 話の次に 73 話（別シリーズの TID 混入）、その後 13 話に戻る: 13 は正常
		const programs = [program(1, 0, 12), program(2, 1, 73), program(3, 2, 13)];
		const anomalies = detectEpisodeAnomalies(programs, null);
		expect(anomalies).toEqual([
			{ pid: 2, kind: "jump", episodeNumber: 73, detail: "jumps from episode 12 (pid 1)" },
		]);
	});

	it("flags the later occurrence of a duplicated episode number", () => {
		const programs = [program(1, 0, 12), program(2, 2, 12)];
		expect(detectEpisodeAnomalies(programs, 19)).toEqual([
			{ pid: 2, kind: "duplicate", episodeNumber: 12, detail: "same episode already scheduled by pid 1" },
		]);
	});

	it("flags a count that goes backwards as a reset", () => {
		const programs = [program(1, 0, 11), program(2, 1, 12), program(3, 2, 1)];
		expect(detectEpisodeAnomalies(programs, 12).map((a) => a.kind)).toEqual(["reset"]);
	});

	it("reports a continuous-series TID as a count mismatch without dropping the numbers", () => {
		// 2 期を同じ TID で 13 話から数えている作品（MAL 側の 2 期は 12 話）: 全番号が上限超え
		const programs = [program(1, 0, 13), program(2, 1, 14), program(3, 2, 15)];
		const anomalies = detectEpisodeAnomalies(programs, 12);
		expect(anomalies.map((a) => [a.pid, a.kind])).toEqual([
			[1, "count_mismatch"],
			[2, "count_mismatch"],
			[3, "count_mismatch"],
		]);
		expect(anomalies.every((a) => !isAppliedEpisodeAnomaly(a.kind))).toBe(true);
	});

	it("treats an episode count of 1 as a placeholder when several numbered slots exist", () => {
		const programs = [program(1, 0, 2), program(2, 1, 3), program(3, 2, 4)];
		expect(detectEpisodeAnomalies(programs, 1)).toEqual([]);
	});

	it("still applies the ordering checks inside a count-mismatched series", () => {
		const programs = [program(1, 0, 13), program(2, 1, 14), program(3, 2, 14)];
		expect(detectEpisodeAnomalies(programs, 12).map((a) => [a.pid, a.kind])).toEqual([
			[1, "count_mismatch"],
			[2, "count_mismatch"],
			[3, "duplicate"],
		]);
	});

	it("keeps jump and reset checks active inside a continuous-numbering series", () => {
		// 総話数 12 の通し番号シリーズ: 150 への飛びと 79 への巻き戻りは報告だけで済ませない
		const jump = [program(1, 0, 80), program(2, 1, 150), program(3, 2, 81)];
		expect(detectEpisodeAnomalies(jump, 12).map((a) => [a.pid, a.kind])).toEqual([
			[1, "count_mismatch"],
			[2, "jump"],
			[3, "count_mismatch"],
		]);
		const reset = [program(1, 0, 80), program(2, 1, 79), program(3, 2, 81)];
		expect(detectEpisodeAnomalies(reset, 12).map((a) => [a.pid, a.kind])).toEqual([
			[1, "count_mismatch"],
			[2, "reset"],
			[3, "count_mismatch"],
		]);
	});

	it("orders by air time regardless of input order", () => {
		const programs = [program(2, 1, 2), program(1, 0, 1), program(3, 2, 9)];
		expect(detectEpisodeAnomalies(programs, 12).map((a) => [a.pid, a.kind])).toEqual([[3, "jump"]]);
	});
});

describe("detectEpisodeAnomaliesByGroup", () => {
	it("checks each title independently with its own episode count", () => {
		const programs = [
			{ ...program(1, 0, 1), malId: 100 },
			{ ...program(2, 1, 16), malId: 100 },
			{ ...program(3, 0, 13), malId: 200 },
		];
		const counts: Record<number, number | null> = { 100: 12, 200: 24 };
		const result = detectEpisodeAnomaliesByGroup(
			programs,
			(p) => p.malId,
			(malId) => counts[malId] ?? null,
		);
		expect([...result.keys()]).toEqual(["100:2"]);
		expect(result.get("100:2")).toMatchObject({ kind: "over_count", group: 100 });
	});

	it("keeps verdicts apart when two titles select the same program", () => {
		// 共有 TID: 同じ pid 9 を 2 作品が選ぶ。片方だけ重複扱い
		const programs = [
			{ ...program(9, 0, 5), malId: 100 },
			{ ...program(8, 1, 5), malId: 100 },
			{ ...program(9, 0, 5), malId: 200 },
		];
		const result = detectEpisodeAnomaliesByGroup(
			programs,
			(p) => p.malId,
			() => null,
		);
		expect([...result.keys()]).toEqual(["100:8"]);
	});
});

describe("isEpisodeSuppressedSnapshot", () => {
	it("recognizes only applied anomalies", () => {
		expect(isEpisodeSuppressedSnapshot({ episode_anomaly: { applied: true, kind: "duplicate" } })).toBe(true);
		expect(isEpisodeSuppressedSnapshot({ episode_anomaly: { applied: false, kind: "count_mismatch" } })).toBe(
			false,
		);
		expect(isEpisodeSuppressedSnapshot({})).toBe(false);
		expect(isEpisodeSuppressedSnapshot(null)).toBe(false);
	});
});
