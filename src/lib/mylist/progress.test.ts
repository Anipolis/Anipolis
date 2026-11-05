import { describe, expect, it } from "vitest";
import { changeProgress } from "./progress";

describe("changeProgress", () => {
	it("話数だけを進める・戻す", () => {
		expect(changeProgress({ status: "watching", progress: 3 }, 4, 12)).toEqual({ progress: 4 });
		expect(changeProgress({ status: "watching", progress: 3 }, 2, 12)).toEqual({ progress: 2 });
	});

	it("最終話まで進めたら完了にする", () => {
		expect(changeProgress({ status: "watching", progress: 11 }, 12, 12)).toEqual({
			progress: 12,
			status: "completed",
		});
		expect(changeProgress({ status: "on_hold", progress: 11 }, 12, 12)).toEqual({
			progress: 12,
			status: "completed",
		});
	});

	it("1話だけの作品は、視聴予定からでも完了にする", () => {
		expect(changeProgress({ status: "plan_to_watch", progress: 0 }, 1, 1)).toEqual({
			progress: 1,
			status: "completed",
		});
	});

	it("視聴予定で見始めたら視聴中にする", () => {
		expect(changeProgress({ status: "plan_to_watch", progress: 0 }, 1, 12)).toEqual({
			progress: 1,
			status: "watching",
		});
		expect(changeProgress({ status: "plan_to_watch", progress: 0 }, 1, null)).toEqual({
			progress: 1,
			status: "watching",
		});
	});

	it("最終話の完了から戻したら視聴中に戻す", () => {
		expect(changeProgress({ status: "completed", progress: 12 }, 11, 12)).toEqual({
			progress: 11,
			status: "watching",
		});
	});

	it("話数を付けずに完了にした作品は、進めても完了のまま", () => {
		expect(changeProgress({ status: "completed", progress: 0 }, 1, 12)).toEqual({ progress: 1 });
		expect(changeProgress({ status: "completed", progress: 5 }, 4, 12)).toEqual({ progress: 4 });
	});

	it("中断・断念は最終話でなければ変えない", () => {
		expect(changeProgress({ status: "on_hold", progress: 3 }, 4, 12)).toEqual({ progress: 4 });
		expect(changeProgress({ status: "dropped", progress: 3 }, 4, 12)).toEqual({ progress: 4 });
	});

	it("全話数が分からない作品は完了にしない", () => {
		expect(changeProgress({ status: "watching", progress: 30 }, 31, null)).toEqual({ progress: 31 });
		expect(changeProgress({ status: "completed", progress: 30 }, 29, null)).toEqual({ progress: 29 });
	});

	it("端では変えない", () => {
		expect(changeProgress({ status: "watching", progress: 0 }, -1, 12)).toBeNull();
		expect(changeProgress({ status: "completed", progress: 12 }, 13, 12)).toBeNull();
		expect(changeProgress({ status: "watching", progress: 9999 }, 10000, null)).toBeNull();
	});

	it("数字の入力でも同じ決まりで変える", () => {
		expect(changeProgress({ status: "plan_to_watch", progress: 0 }, 8, 12)).toEqual({
			progress: 8,
			status: "watching",
		});
		expect(changeProgress({ status: "watching", progress: 3 }, 12, 12)).toEqual({
			progress: 12,
			status: "completed",
		});
		expect(changeProgress({ status: "completed", progress: 12 }, 0, 12)).toEqual({
			progress: 0,
			status: "watching",
		});
		expect(changeProgress({ status: "watching", progress: 8 }, 3, 12)).toEqual({ progress: 3 });
	});

	it("範囲の外や小数の入力は、端や整数にそろえる", () => {
		expect(changeProgress({ status: "watching", progress: 3 }, 99, 12)).toEqual({
			progress: 12,
			status: "completed",
		});
		expect(changeProgress({ status: "watching", progress: 3 }, -5, 12)).toEqual({ progress: 0 });
		expect(changeProgress({ status: "watching", progress: 3 }, 5.7, 12)).toEqual({ progress: 5 });
		expect(changeProgress({ status: "watching", progress: 3 }, 3, 12)).toBeNull();
	});

	it("全話数を超えた記録は、進めても縮めない", () => {
		expect(changeProgress({ status: "watching", progress: 15 }, 16, 12)).toBeNull();
		expect(changeProgress({ status: "watching", progress: 15 }, 14, 12)).toEqual({ progress: 12 });
	});
});
