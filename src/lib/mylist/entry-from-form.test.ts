import { describe, expect, it } from "vitest";
import { entryFromForm } from "./entry-from-form";

function form(fields: Record<string, string>) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return formData;
}

describe("entryFromForm", () => {
	it("送った状態・スコア・進捗をそのままエントリにする", () => {
		const entry = entryFromForm(form({ anime_id: "1", status: "completed", score: "9", progress: "12" }));
		expect(entry).toMatchObject({ status: "completed", score: 9, progress: 12 });
	});

	it("スコアが空ならスコアなし、進捗が空なら0にする", () => {
		const entry = entryFromForm(form({ anime_id: "1", status: "plan_to_watch", score: "", progress: "" }));
		expect(entry).toMatchObject({ status: "plan_to_watch", score: null, progress: 0 });
	});
});
