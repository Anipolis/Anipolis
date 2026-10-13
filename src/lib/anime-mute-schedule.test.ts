import { describe, expect, it } from "vitest";
import { computeMutedUntil, isRepeatMuteActive } from "./anime-mute-schedule";
import { dateKeyWeekday } from "./utils/jst";

/** JST の壁時計時刻（+09:00）を瞬間にする。テストの実行環境の時刻帯には依存しない */
const jst = (isoWithoutZone: string) => new Date(`${isoWithoutZone}+09:00`);

describe("isRepeatMuteActive（#326）", () => {
	const WEDNESDAY = 3;

	it("前提: 2026-10-07 は水曜日", () => {
		expect(dateKeyWeekday("2026-10-07")).toBe(WEDNESDAY);
	});

	it("水曜放送・1日は、水曜 04:00 JST から木曜 04:00 JST まで（深夜放送の25時台を含む）", () => {
		// 2026-10-07 01:00 JST は UTC では火曜。サーバーの getDay() だと曜日がずれていた
		expect(isRepeatMuteActive(WEDNESDAY, 1, jst("2026-10-07T01:00:00"))).toBe(false);
		expect(isRepeatMuteActive(WEDNESDAY, 1, jst("2026-10-07T03:59:59"))).toBe(false);
		expect(isRepeatMuteActive(WEDNESDAY, 1, jst("2026-10-07T04:00:00"))).toBe(true);
		expect(isRepeatMuteActive(WEDNESDAY, 1, jst("2026-10-07T23:30:00"))).toBe(true);
		expect(isRepeatMuteActive(WEDNESDAY, 1, jst("2026-10-08T01:30:00"))).toBe(true);
		expect(isRepeatMuteActive(WEDNESDAY, 1, jst("2026-10-08T04:00:00"))).toBe(false);
	});

	it("期間が複数日なら、放送曜日から数えた日数ぶん続き、週をまたいでも戻る", () => {
		expect(isRepeatMuteActive(WEDNESDAY, 3, jst("2026-10-09T12:00:00"))).toBe(true);
		expect(isRepeatMuteActive(WEDNESDAY, 3, jst("2026-10-10T12:00:00"))).toBe(false);
		expect(isRepeatMuteActive(WEDNESDAY, 3, jst("2026-10-14T12:00:00"))).toBe(true);
	});
});

describe("computeMutedUntil（#326）", () => {
	it("ルームの放送日の始まり（JST 04:00）から数える", () => {
		expect(computeMutedUntil("2026-10-07", 1).toISOString()).toBe(jst("2026-10-08T04:00:00").toISOString());
		expect(computeMutedUntil("2026-10-07", 3).toISOString()).toBe(jst("2026-10-10T04:00:00").toISOString());
	});

	it("深夜放送（放送日の25時台）が終わる前に切れない", () => {
		const until = computeMutedUntil("2026-10-07", 1);
		expect(until.getTime()).toBeGreaterThan(jst("2026-10-08T01:30:00").getTime());
	});

	it("放送日の指定が無い・不正なら、設定した時刻から数える", () => {
		const now = jst("2026-10-07T12:34:00");
		const expected = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
		expect(computeMutedUntil(null, 2, now).toISOString()).toBe(expected);
		expect(computeMutedUntil("2026-13-40", 2, now).toISOString()).toBe(expected);
	});
});
