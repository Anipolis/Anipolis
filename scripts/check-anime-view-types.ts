import { readFileSync } from "node:fs";

const TYPES_PATH = "src/lib/supabase/database.types.ts";
const EXTRA_VIEW_COLUMNS = new Set(["computed_broadcast_status"]);

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

const missingFromView = animeColumns.filter((column) => !viewColumns.includes(column));
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
