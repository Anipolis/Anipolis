import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPostCardSelect } from "./post-selects";

describe("buildPostCardSelect の CW（#317）", () => {
	it("どの組み合わせでも CW の ID と作品を含める", () => {
		for (const select of [buildPostCardSelect(), buildPostCardSelect({ exchangeShare: false })]) {
			expect(select).toMatch(/^cw_anime_id,$/m);
			expect(select).toContain("cw_anime:anime!posts_cw_anime_id_fkey ( id, title, cover_url )");
		}
	});

	it("ホームのフォールバックにも CW を外した取得を残さない", () => {
		const home = readFileSync(new URL("../../routes/+page.server.ts", import.meta.url), "utf8");
		expect(home).not.toMatch(/cwAnime:/);
		expect(home).toMatch(/POSTS_SELECT_WITH_EXCHANGE = buildPostCardSelect\(\{ exchangeShare: true \}\)/);
		expect(home).toMatch(/POSTS_SELECT_BASE = buildPostCardSelect\(\{ exchangeShare: false \}\)/);
	});
});
