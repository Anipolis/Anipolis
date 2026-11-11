import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// border-radius に 999px/9999px/50% を指定した宣言ブロックは corner-shape: round を同一ブロック内に併記する。
// app.css が全要素へ corner-shape: squircle を適用するため、併記漏れは Chromium で円・ピルがスクワークルになる。
const SRC_ROOT = "src";
// % の直後は単語境界が成立しないため、px と % で終端条件を分けず先読みで宣言の終端を判定する。
const PILL_RADIUS_PATTERN = /border-radius\s*:\s*(999px|9999px|50%)(?=[\s;!}]|$)/;
const ROUND_SHAPE_PATTERN = /corner-shape\s*:\s*round\b/;
const STYLE_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style>/g;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const KEYFRAME_SELECTOR_PATTERN = /^\s*(\d+%|from|to)\s*$/;

interface Violation {
	file: string;
	line: number;
	selector: string;
}

// 行番号をずらさないため、コメント部分は改行だけ残して空白に置換する。
function stripCommentsPreservingLines(source: string): string {
	return source.replace(COMMENT_PATTERN, (match) => match.replace(/[^\n]/g, " "));
}

interface CssBlock {
	selector: string;
	braceIndex: number;
	contentStart: number;
	inner: Array<[number, number]>;
}

// 波括弧の対応を追跡し、各ブロック自身の宣言だけを検査する。入れ子の内側は親の宣言から除く。
function checkCssChunk(filePath: string, css: string, baseLine: number, violations: Violation[]): void {
	const stripped = stripCommentsPreservingLines(css);
	const stack: CssBlock[] = [];
	let selectorStart = 0;
	let quote: string | null = null;
	let escaped = false;
	for (let i = 0; i < stripped.length; i += 1) {
		const char = stripped[i];
		if (quote !== null) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
		} else if (char === "{") {
			stack.push({
				selector: stripped.slice(selectorStart, i),
				braceIndex: i,
				contentStart: i + 1,
				inner: [],
			});
			selectorStart = i + 1;
		} else if (char === "}") {
			const block = stack.pop();
			if (block === undefined) {
				selectorStart = i + 1;
				continue;
			}
			const sortedInner = [...block.inner].sort((a, b) => a[0] - b[0]);
			let declarations = "";
			let position = block.contentStart;
			for (const [start, end] of sortedInner) {
				declarations += stripped.slice(position, start);
				position = end + 1;
			}
			declarations += stripped.slice(position, i);
			const parent = stack[stack.length - 1];
			if (parent !== undefined) parent.inner.push([block.braceIndex, i]);
			const trimmedSelector = block.selector.trim();
			if (!KEYFRAME_SELECTOR_PATTERN.test(trimmedSelector) && !trimmedSelector.startsWith("@")) {
				if (PILL_RADIUS_PATTERN.test(declarations) && !ROUND_SHAPE_PATTERN.test(declarations)) {
					const relativeLine = stripped.slice(0, block.braceIndex).split("\n").length;
					const lastLine = trimmedSelector.split("\n").pop()?.trim() ?? trimmedSelector;
					violations.push({ file: filePath, line: baseLine + relativeLine, selector: lastLine });
				}
			}
			selectorStart = i + 1;
		} else if (char === ";") {
			selectorStart = i + 1;
		}
	}
}

// .svelte 内の行番号を通算するため、style 開始位置までの改行数を加算する。
function checkSvelteFile(filePath: string, source: string, violations: Violation[]): void {
	const stylePattern = new RegExp(STYLE_PATTERN);
	let match = stylePattern.exec(source);
	while (match !== null) {
		const css = match[1] ?? "";
		const chunkStart = (match.index ?? 0) + match[0].indexOf(css);
		const baseLine = source.slice(0, chunkStart).split("\n").length - 1;
		checkCssChunk(filePath, css, baseLine, violations);
		match = stylePattern.exec(source);
	}
}

function collectTargetFiles(directory: string, collected: string[]): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const fullPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			collectTargetFiles(fullPath, collected);
		} else if (entry.isFile() && (entry.name.endsWith(".css") || entry.name.endsWith(".svelte"))) {
			collected.push(fullPath);
		}
	}
}

const files: string[] = [];
collectTargetFiles(SRC_ROOT, files);
files.sort();
const violations: Violation[] = [];
for (const file of files) {
	const source = readFileSync(file, "utf8");
	if (file.endsWith(".svelte")) {
		checkSvelteFile(file, source, violations);
	} else {
		checkCssChunk(file, source, 0, violations);
	}
}

if (violations.length > 0) {
	for (const violation of violations) {
		console.error(
			`${violation.file}:${violation.line} ${violation.selector} に corner-shape: round の併記がありません。` +
				`border-radius: 999px/9999px/50% と同一ブロック内に corner-shape: round を追加してください。`,
		);
	}
	process.exit(1);
}

console.log(`All pill radii declare corner-shape: round (${files.length} files).`);
