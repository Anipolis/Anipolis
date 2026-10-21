import { describe, expect, it } from "vitest";
import { excludeNonRealUsers } from "./queries";

describe("excludeNonRealUsers", () => {
	it("トレードのダミー（pool_dummy_）と本番の確認用アカウント（qa_tester）を集計から外す", () => {
		const calls: string[] = [];
		type FakeQuery = { not: (column: string, operator: string, value: string) => FakeQuery };
		const query: FakeQuery = {
			not(column: string, operator: string, value: string) {
				calls.push(`${column} not ${operator} ${value}`);
				return query;
			},
		};
		expect(excludeNonRealUsers(query)).toBe(query);
		expect(calls).toEqual(["username not like pool_dummy_%", "username not in (qa_tester)"]);
	});
});
