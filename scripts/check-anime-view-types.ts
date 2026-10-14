import { readFileSync } from "node:fs";

const TYPES_PATH = "src/lib/supabase/database.types.ts";
const EXTRA_VIEW_COLUMNS = new Set(["computed_broadcast_status"]);
// anime にあるが、意図してまだビューに入れていない列。
// episode_total（152）は episode_count（text）からトリガーで同期している移行途中の列で、ビューを作り直すと
// 依存するビュー（144 / 145）も作り直しになるため、書き込み側を episode_total に移し終えて episode_count を
// 外すときにまとめて作り直す（#354）。それまでは anime から直接読む。
const ANIME_COLUMNS_NOT_IN_VIEW = new Set(["episode_total"]);

function extractBalancedBlock(source: string, startMarker: string): string {
	const markerIndex = source.indexOf(startMarker);
	if (markerIndex === -1) throw new Error(`Could not find marker: ${startMarker}`);

	const openIndex = source.indexOf("{", markerIndex);
	if (openIndex === -1) throw new Error(`Could not find opening brace for marker: ${startMarker}`);

	let depth = 0;
	for (let i = openIndex; i < source.length; i += 1) {
		const char = source[i];
		if (char === "{") depth += 1;
		if (char === "}") depth -= 1;
		if (depth === 0) return source.slice(openIndex + 1, i);
	}

	throw new Error(`Could not find closing brace for marker: ${startMarker}`);
}

function extractRowColumns(source: string, objectMarker: string): string[] {
	const objectBlock = extractBalancedBlock(source, objectMarker);
	const rowBlock = extractBalancedBlock(objectBlock, "Row:");
	return rowBlock
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):/)?.[1])
		.filter((column): column is string => Boolean(column));
}

const source = readFileSync(TYPES_PATH, "utf8");
const animeColumns = extractRowColumns(source, "\n\t\t\tanime:");
const viewColumns = extractRowColumns(source, "\n\t\t\tanime_with_computed_broadcast_status:");

const missingFromView = animeColumns.filter(
	(column) => !viewColumns.includes(column) && !ANIME_COLUMNS_NOT_IN_VIEW.has(column),
);
const unexpectedViewColumns = viewColumns.filter(
	(column) => !animeColumns.includes(column) && !EXTRA_VIEW_COLUMNS.has(column),
);

if (missingFromView.length || unexpectedViewColumns.length) {
	console.error("anime_with_computed_broadcast_status is out of sync with anime Row.");
	if (missingFromView.length) console.error(`Missing from view: ${missingFromView.join(", ")}`);
	if (unexpectedViewColumns.length) console.error(`Unexpected in view: ${unexpectedViewColumns.join(", ")}`);
	process.exit(1);
}

console.log("anime_with_computed_broadcast_status matches anime Row columns.");
