import { describe, expect, it } from "vitest";
import { stepProgress } from "./progress";

describe("stepProgress", () => {
	it("話数だけを進める・戻す", () => {
		expect(stepProgress({ status: "watching", progress: 3 }, 1, 12)).toEqual({ progress: 4 });
		expect(stepProgress({ status: "watching", progress: 3 }, -1, 12)).toEqual({ progress: 2 });
	});

	it("最終話まで進めたら完了にする", () => {
		expect(stepProgress({ status: "watching", progress: 11 }, 1, 12)).toEqual({
			progress: 12,
			status: "completed",
		});
		expect(stepProgress({ status: "on_hold", progress: 11 }, 1, 12)).toEqual({ progress: 12, status: "completed" });
	});

	it("1話だけの作品は、視聴予定からでも完了にする", () => {
		expect(stepProgress({ status: "plan_to_watch", progress: 0 }, 1, 1)).toEqual({
			progress: 1,
			status: "completed",
		});
	});

	it("視聴予定で見始めたら視聴中にする", () => {
		expect(stepProgress({ status: "plan_to_watch", progress: 0 }, 1, 12)).toEqual({
			progress: 1,
			status: "watching",
		});
		expect(stepProgress({ status: "plan_to_watch", progress: 0 }, 1, null)).toEqual({
			progress: 1,
			status: "watching",
		});
	});

	it("最終話の完了から戻したら視聴中に戻す", () => {
		expect(stepProgress({ status: "completed", progress: 12 }, -1, 12)).toEqual({
			progress: 11,
			status: "watching",
		});
	});

	it("話数を付けずに完了にした作品は、進めても完了のまま", () => {
		expect(stepProgress({ status: "completed", progress: 0 }, 1, 12)).toEqual({ progress: 1 });
		expect(stepProgress({ status: "completed", progress: 5 }, -1, 12)).toEqual({ progress: 4 });
	});

	it("中断・断念は最終話でなければ変えない", () => {
		expect(stepProgress({ status: "on_hold", progress: 3 }, 1, 12)).toEqual({ progress: 4 });
		expect(stepProgress({ status: "dropped", progress: 3 }, 1, 12)).toEqual({ progress: 4 });
	});

	it("全話数が分からない作品は完了にしない", () => {
		expect(stepProgress({ status: "watching", progress: 30 }, 1, null)).toEqual({ progress: 31 });
		expect(stepProgress({ status: "completed", progress: 30 }, -1, null)).toEqual({ progress: 29 });
	});

	it("端では変えない", () => {
		expect(stepProgress({ status: "watching", progress: 0 }, -1, 12)).toBeNull();
		expect(stepProgress({ status: "completed", progress: 12 }, 1, 12)).toBeNull();
		expect(stepProgress({ status: "watching", progress: 9999 }, 1, null)).toBeNull();
	});

	it("全話数を超えた記録は、進めても縮めない", () => {
		expect(stepProgress({ status: "watching", progress: 15 }, 1, 12)).toBeNull();
		expect(stepProgress({ status: "watching", progress: 15 }, -1, 12)).toEqual({ progress: 12 });
	});
});
