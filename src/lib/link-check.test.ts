import { describe, expect, it } from "vitest";
import { classifyLink, type LinkCheckInput, mentionsAnime, registrableDomain } from "./link-check";

function input(partial: Partial<LinkCheckInput>): LinkCheckInput {
	return {
		url: "https://example-anime.jp/",
		finalUrl: "https://example-anime.jp/",
		httpStatus: 200,
		errorCode: null,
		pageTitle: "",
		bodyText: "",
		animeTitles: ["例のアニメ"],
		...partial,
	};
}

describe("registrableDomain", () => {
	it("groups subdomains by organization", () => {
		expect(registrableDomain("https://www.tv-tokyo.co.jp/anime/x/")).toBe("tv-tokyo.co.jp");
		expect(registrableDomain("https://anime.example.com/")).toBe("example.com");
		expect(registrableDomain("not a url")).toBeNull();
	});
});

describe("classifyLink", () => {
	it("treats missing domains, 404/410 and soft-404 pages as dead", () => {
		expect(classifyLink(input({ errorCode: "ENOTFOUND", httpStatus: null })).status).toBe("dead");
		expect(classifyLink(input({ httpStatus: 410 })).status).toBe("dead");
		expect(classifyLink(input({ pageTitle: "お探しのページは見つかりませんでした：テレビ東京" })).status).toBe(
			"dead",
		);
	});

	it("keeps bot-blocked responses and retries timeouts and 5xx", () => {
		expect(classifyLink(input({ httpStatus: 403 })).status).toBe("blocked");
		expect(classifyLink(input({ errorCode: "TIMEOUT", httpStatus: null })).status).toBe("retry");
		expect(classifyLink(input({ httpStatus: 503 })).status).toBe("retry");
	});

	it("flags parked and spam takeovers (タテアニメのドメインの例)", () => {
		expect(
			classifyLink(
				input({
					pageTitle: "ゲームだけではなくアニメも制作された人気のあるアダルトゲーム",
					animeTitles: ["バイト先は「悪の組織」!?"],
				}),
			).status,
		).toBe("suspicious");
		expect(classifyLink(input({ pageTitle: "This domain is for sale" })).status).toBe("suspicious");
		expect(classifyLink(input({ pageTitle: "オンラインカジノ比較サイト" })).status).toBe("suspicious");
	});

	it("does not flag adult anime official sites that name the work", () => {
		expect(
			classifyLink(input({ pageTitle: "アダルトアニメ「例のアニメ」公式サイト", animeTitles: ["例のアニメ"] }))
				.status,
		).toBe("ok");
	});

	it("flags redirects to another organization's top page unless the page names the work", () => {
		expect(classifyLink(input({ finalUrl: "https://unrelated.com/" })).status).toBe("suspicious");
		expect(classifyLink(input({ finalUrl: "https://unrelated.com/", pageTitle: "例のアニメ 公式" })).status).toBe(
			"ok",
		);
		expect(classifyLink(input({ finalUrl: "https://www.example-anime.jp/top" })).status).toBe("ok");
	});
});

describe("false positives found in the first full run", () => {
	it("does not treat a domain ending in 'dan.com' as a domain marketplace (konodan.com)", () => {
		expect(
			classifyLink(
				input({
					url: "http://www.konodan.com/news/alien_news",
					finalUrl: "http://www.konodan.com/news/alien_news",
					pageTitle: "この男子、宇宙人と戦えます。",
					bodyText: "ギャラリーページ https://www.konodan.com/gallery",
					animeTitles: ["この男子、宇宙人と戦えます。"],
				}),
			).status,
		).toBe("ok");
	});

	it("does not flag adult label product pages whose title is empty", () => {
		expect(
			classifyLink(
				input({ pageTitle: "", bodyText: "アダルトアニメ 新作 発売日", animeTitles: ["恋乳オーダー"] }),
			).status,
		).toBe("ok");
	});

	it("recognizes a redirect to the work's page when a title word appears verbatim", () => {
		expect(
			classifyLink(
				input({
					url: "http://www.toei-anim.co.jp/tv/dai/",
					finalUrl: "https://dai-anime.com/",
					pageTitle: "ドラゴンクエスト ダイの大冒険 アニメ公式サイト",
					animeTitles: ["DRAGON QUEST -ダイの大冒険-"],
				}),
			).status,
		).toBe("ok");
	});
});

describe("mentionsAnime", () => {
	it("matches by bigram overlap regardless of punctuation and width", () => {
		expect(mentionsAnime("TVアニメ『ロウきゅーぶ！SS』公式サイト", ["ロウきゅーぶ！"])).toBe(true);
		expect(mentionsAnime("株式会社サンプル", ["ロウきゅーぶ！"])).toBe(false);
	});
});
