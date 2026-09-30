import { describe, expect, it } from "vitest";
import { buildIlikeContainsPattern, escapeIlikePattern, normalizeAccountQuery } from "./search";

describe("normalizeAccountQuery", () => {
	it("strips a leading @ so mention-style input finds the account", () => {
		expect(normalizeAccountQuery("@mikan_cat")).toBe("mikan_cat");
		expect(normalizeAccountQuery("＠mikan_cat")).toBe("mikan_cat");
		expect(normalizeAccountQuery("  @@mikan ")).toBe("mikan");
	});

	it("leaves plain terms and inner @ untouched", () => {
		expect(normalizeAccountQuery("mikan")).toBe("mikan");
		expect(normalizeAccountQuery("mi@kan")).toBe("mi@kan");
	});

	it("treats a bare @ or empty input as no query", () => {
		expect(normalizeAccountQuery("@")).toBe("");
		expect(normalizeAccountQuery("  ")).toBe("");
		expect(normalizeAccountQuery(null)).toBe("");
	});
});

describe("search pattern escaping", () => {
	it("keeps wildcard characters literal while preserving the search term", () => {
		expect(escapeIlikePattern("100%_done")).toBe("100\\%\\_done");
		expect(buildIlikeContainsPattern("100%_done")).toBe("%100\\%\\_done%");
	});

	it("escapes backslashes before adding wildcard escapes", () => {
		expect(escapeIlikePattern(String.raw`C:\\temp\\100%`)).toBe(String.raw`C:\\\\temp\\\\100\%`);
	});

	it("leaves punctuation used by the search term intact", () => {
		expect(buildIlikeContainsPattern('a,b"c')).toBe('%a,b"c%');
		expect(buildIlikeContainsPattern("鬼滅の刃")).toBe("%鬼滅の刃%");
	});
});
