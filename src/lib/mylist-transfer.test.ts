import { describe, expect, it } from "vitest";
import {
	dedupeEntries,
	parseCsvRows,
	parseMalXml,
	parseMylistCsv,
	parseMylistFile,
	parseTransferDate,
	toMalXml,
	toMylistCsv,
} from "./mylist-transfer";

// MyAnimeList の「Export My List」の形（要素は実物から必要な分だけ）
const MAL_EXPORT = `<?xml version="1.0" encoding="UTF-8" ?>
<!--
 Created by XML Export feature at MyAnimeList.net
 Version 1.1.0
-->
<myanimelist>
	<myinfo>
		<user_id>1</user_id>
		<user_name>tester</user_name>
		<user_export_type>1</user_export_type>
		<user_total_anime>4</user_total_anime>
	</myinfo>
	<anime>
		<series_animedb_id>1</series_animedb_id>
		<series_title><![CDATA[Cowboy Bebop]]></series_title>
		<series_type>TV</series_type>
		<series_episodes>26</series_episodes>
		<my_id>0</my_id>
		<my_watched_episodes>26</my_watched_episodes>
		<my_start_date>2020-01-05</my_start_date>
		<my_finish_date>2020-02-10</my_finish_date>
		<my_score>9</my_score>
		<my_status>Completed</my_status>
		<my_comments><![CDATA[]]></my_comments>
		<my_times_watched>0</my_times_watched>
		<update_on_import>0</update_on_import>
	</anime>
	<anime>
		<series_animedb_id>5114</series_animedb_id>
		<series_title><![CDATA[Fullmetal Alchemist: Brotherhood & <Friends>]]></series_title>
		<my_watched_episodes>10</my_watched_episodes>
		<my_start_date>0000-00-00</my_start_date>
		<my_finish_date>0000-00-00</my_finish_date>
		<my_score>0</my_score>
		<my_status>Watching</my_status>
	</anime>
	<anime>
		<series_animedb_id>30</series_animedb_id>
		<series_title><![CDATA[Neon Genesis Evangelion]]></series_title>
		<my_watched_episodes>0</my_watched_episodes>
		<my_start_date>2021-05-00</my_start_date>
		<my_finish_date>2021-04-01</my_finish_date>
		<my_score>11</my_score>
		<my_status>Plan to Watch</my_status>
	</anime>
	<anime>
		<series_animedb_id>99</series_animedb_id>
		<series_title><![CDATA[Unknown status]]></series_title>
		<my_status>Rewatching</my_status>
	</anime>
</myanimelist>`;

describe("parseMalXml", () => {
	it("reads status, score, progress and dates from a MAL export", () => {
		const { entries, invalid } = parseMalXml(MAL_EXPORT);
		expect(entries).toEqual([
			{
				malId: 1,
				title: "Cowboy Bebop",
				status: "completed",
				score: 9,
				progress: 26,
				startedOn: "2020-01-05",
				finishedOn: "2020-02-10",
			},
			{
				malId: 5114,
				title: "Fullmetal Alchemist: Brotherhood & <Friends>",
				status: "watching",
				score: null,
				progress: 10,
				startedOn: null,
				finishedOn: null,
			},
			{
				malId: 30,
				title: "Neon Genesis Evangelion",
				status: "plan_to_watch",
				score: null,
				progress: 0,
				startedOn: null,
				finishedOn: "2021-04-01",
			},
		]);
		expect(invalid).toEqual([{ line: "Unknown status", reason: "ステータス「Rewatching」が分かりません" }]);
	});

	it("rejects XML that is not a MAL export", () => {
		expect(() => parseMalXml("<root></root>")).toThrow("MyAnimeList");
	});
});

describe("parseTransferDate", () => {
	it("accepts only real dates", () => {
		expect(parseTransferDate("2024-02-29")).toBe("2024-02-29");
		expect(parseTransferDate("2023-02-29")).toBeNull();
		expect(parseTransferDate("0000-00-00")).toBeNull();
		expect(parseTransferDate("2024-03-00")).toBeNull();
		expect(parseTransferDate("")).toBeNull();
	});
});

describe("CSV", () => {
	it("splits quoted fields with commas, quotes and newlines", () => {
		expect(parseCsvRows('a,"b,c","d ""e""",\r\n"f\ng",h\n')).toEqual([
			["a", "b,c", 'd "e"', ""],
			["f\ng", "h"],
		]);
	});

	it("reads the Anipolis CSV and requires mal_id and status", () => {
		const csv = `${String.fromCharCode(0xfeff)}mal_id,title,status,score,progress,started_on,finished_on\n1,Bebop,completed,8,26,,2020-02-10\n,No id,watching,,,,\n`;
		const { entries, invalid } = parseMylistCsv(csv);
		expect(entries).toEqual([
			{
				malId: 1,
				title: "Bebop",
				status: "completed",
				score: 8,
				progress: 26,
				startedOn: null,
				finishedOn: "2020-02-10",
			},
		]);
		expect(invalid).toEqual([{ line: "No id", reason: "MAL の ID がありません" }]);
		expect(() => parseMylistCsv("title,score\nA,1\n")).toThrow("mal_id");
	});

	it("detects the format from the contents", () => {
		expect(parseMylistFile(MAL_EXPORT).entries).toHaveLength(3);
		expect(parseMylistFile("mal_id,status\n1,On-Hold\n").entries[0]?.status).toBe("on_hold");
	});
});

describe("export", () => {
	const entries = [
		{
			malId: 1,
			title: "Bebop ]]> & co",
			type: "TV",
			episodeCount: 26,
			status: "completed" as const,
			score: 9,
			progress: 26,
			startedOn: "2020-01-05",
			finishedOn: null,
		},
		{
			malId: null,
			title: "Anipolis だけの作品",
			type: null,
			episodeCount: null,
			status: "watching" as const,
			score: null,
			progress: 3,
			startedOn: null,
			finishedOn: null,
		},
	];

	it("round-trips through the MAL XML (entries without a MAL id are left out)", () => {
		const xml = toMalXml(entries, "tester");
		expect(xml).toContain("<user_total_anime>1</user_total_anime>");
		const { entries: parsed } = parseMalXml(xml);
		expect(parsed).toEqual([
			{
				malId: 1,
				title: "Bebop ]]> & co",
				status: "completed",
				score: 9,
				progress: 26,
				startedOn: "2020-01-05",
				finishedOn: null,
			},
		]);
	});

	it("round-trips through the CSV and keeps entries without a MAL id in the file", () => {
		const csv = toMylistCsv(entries);
		expect(csv.split("\r\n")).toHaveLength(4);
		const { entries: parsed, invalid } = parseMylistCsv(csv);
		expect(parsed.map((entry) => entry.title)).toEqual(["Bebop ]]> & co"]);
		expect(invalid).toHaveLength(1);
	});

	it("keeps the last row when the same anime appears twice", () => {
		const { entries: parsed } = parseMylistCsv("mal_id,status\n1,watching\n1,completed\n");
		expect(dedupeEntries(parsed)).toEqual([expect.objectContaining({ malId: 1, status: "completed" })]);
	});
});
