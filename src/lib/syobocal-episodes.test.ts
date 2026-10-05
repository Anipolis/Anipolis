import { describe, expect, it } from "vitest";
import {
	confirmedFinalEpisodeCount,
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
		// 作品 100 は 10〜12 話の後に 15 話（3 話超過・飛びには当たらない）、作品 200 は 13/24 で正常
		const programs = [
			{ ...program(1, 0, 10), malId: 100 },
			{ ...program(2, 1, 11), malId: 100 },
			{ ...program(3, 2, 12), malId: 100 },
			{ ...program(4, 3, 15), malId: 100 },
			{ ...program(5, 0, 13), malId: 200 },
		];
		const counts: Record<number, number | null> = { 100: 12, 200: 24 };
		const result = detectEpisodeAnomaliesByGroup(
			programs,
			(p) => p.malId,
			(malId) => counts[malId] ?? null,
		);
		expect([...result.keys()]).toEqual(["100:4"]);
		expect(result.get("100:4")).toMatchObject({ kind: "over_count", group: 100 });
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

describe("confirmedFinalEpisodeCount", () => {
	// 2026-10-06 から毎週火曜 23:00 JST に count 話を並べる
	function weekly(count: number, numbered: (episode: number) => number | null = (episode) => episode) {
		return Array.from({ length: count }, (_, index) => ({
			scheduledAt: new Date(Date.UTC(2026, 9, 6, 14) + index * 7 * 86_400_000).toISOString(),
			episodeNumber: numbered(index + 1),
		}));
	}
	const endedInDecember = { endYear: 2026, endMonth: 12, validTo: null };

	it("confirms the total once the end month has passed and episodes 1..N are all present", () => {
		expect(confirmedFinalEpisodeCount(weekly(12), endedInDecember, new Date("2027-01-05T00:00:00Z"))).toBe(12);
	});

	it("does not treat the registered maximum of an airing show as the total", () => {
		// 終了月未登録（長期作品で1クール分だけ登録済み等）
		const unknownEnd = { endYear: null, endMonth: null, validTo: null };
		expect(confirmedFinalEpisodeCount(weekly(12), unknownEnd, new Date("2027-03-01T00:00:00Z"))).toBeNull();
		// 未来のセッションが残っている
		expect(confirmedFinalEpisodeCount(weekly(12), endedInDecember, new Date("2026-12-01T00:00:00Z"))).toBeNull();
	});

	it("waits a week after the last broadcast while still in the end month", () => {
		// 第12話は 2026-12-22。同月内は最終回の未登録に備えて8日待つ
		expect(confirmedFinalEpisodeCount(weekly(12), endedInDecember, new Date("2026-12-25T00:00:00Z"))).toBeNull();
		expect(confirmedFinalEpisodeCount(weekly(12), endedInDecember, new Date("2026-12-31T00:00:00Z"))).toBe(12);
	});

	it("rejects continuation numbering and gaps", () => {
		const now = new Date("2027-01-05T00:00:00Z");
		// 通期 TID の第2クール（13話始まり）
		expect(
			confirmedFinalEpisodeCount(
				weekly(12, (episode) => episode + 12),
				endedInDecember,
				now,
			),
		).toBeNull();
		// 異常で番号を外した回がある
		expect(
			confirmedFinalEpisodeCount(
				weekly(12, (episode) => (episode === 5 ? null : episode)),
				endedInDecember,
				now,
			),
		).toBeNull();
		expect(confirmedFinalEpisodeCount([], endedInDecember, now)).toBeNull();
	});

	it("does not drop an unnumbered broadcast after the last numbered episode", () => {
		const now = new Date("2027-01-05T00:00:00Z");
		// 最終回だけ Count 未登録／異常で番号を外した → 1..11 が揃っていても「全11話」にしない
		expect(
			confirmedFinalEpisodeCount(
				weekly(12, (episode) => (episode === 12 ? null : episode)),
				endedInDecember,
				now,
			),
		).toBeNull();
		// 途中の番号無し放送（総集編）は総話数に含めずに確定する
		expect(
			confirmedFinalEpisodeCount(
				weekly(13, (episode) => (episode === 7 ? null : episode > 7 ? episode - 1 : episode)),
				endedInDecember,
				now,
			),
		).toBe(12);
	});

	it("uses the mapping's valid_to when a shared TID is split between titles", () => {
		const firstCour = { endYear: null, endMonth: null, validTo: "2026-12-31" };
		expect(confirmedFinalEpisodeCount(weekly(12), firstCour, new Date("2027-01-02T00:00:00Z"))).toBe(12);
		expect(confirmedFinalEpisodeCount(weekly(12), firstCour, new Date("2026-12-30T00:00:00Z"))).toBeNull();
	});
});
