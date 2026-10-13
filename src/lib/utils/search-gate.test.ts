import { describe, expect, it } from "vitest";
import { createSearchGate } from "./search-gate";

describe("createSearchGate（#329）", () => {
	it("新しい検索を始めると、前の検索は中断され最新ではなくなる", () => {
		const gate = createSearchGate();
		const first = gate.start();
		const second = gate.start();
		expect(first.signal.aborted).toBe(true);
		expect(first.isCurrent()).toBe(false);
		expect(second.isCurrent()).toBe(true);
	});

	it("応答の順番が逆転しても、最新の検索の応答だけを反映できる", async () => {
		const gate = createSearchGate();
		const applied: string[] = [];
		const search = (query: string, delayMs: number) => {
			const request = gate.start();
			return new Promise<void>((resolve) =>
				setTimeout(() => {
					if (request.isCurrent()) applied.push(query);
					resolve();
				}, delayMs),
			);
		};
		// A を送った後に B を送り、B が先・A が後に返る
		await Promise.all([search("A", 30), search("B", 5)]);
		expect(applied).toEqual(["B"]);
	});

	it("閉じる・入力を空にする操作の後に届いた応答は反映しない", () => {
		const gate = createSearchGate();
		const request = gate.start();
		gate.cancel();
		expect(request.signal.aborted).toBe(true);
		expect(request.isCurrent()).toBe(false);
	});
});
