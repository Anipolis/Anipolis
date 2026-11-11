import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// border-radius に 999px/9999px/50% を指定した宣言ブロックは corner-shape: round を同一ブロック内に併記する。
// app.css が全要素へ corner-shape: squircle を適用するため、併記漏れは Chromium で円・ピルがスクワークルになる。
const SRC_ROOT = "src";
const PILL_RADIUS_PATTERN = /border-radius\s*:\s*(999px|9999px|50%)\b/;
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

// マッチ開始位置は直前の改行を含むため、開き括弧の位置で宣言ブロックの行を求める。
function checkCssChunk(filePath: string, css: string, baseLine: number, violations: Violation[]): void {
	const stripped = stripCommentsPreservingLines(css);
	const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
	let match = rulePattern.exec(stripped);
	while (match !== null) {
		const selector = match[1] ?? "";
		const body = match[2] ?? "";
		const trimmedSelector = selector.trim();
		if (!KEYFRAME_SELECTOR_PATTERN.test(trimmedSelector) && !trimmedSelector.startsWith("@")) {
			if (PILL_RADIUS_PATTERN.test(body) && !ROUND_SHAPE_PATTERN.test(body)) {
				const braceIndex = match.index + selector.length;
				const relativeLine = stripped.slice(0, braceIndex).split("\n").length;
				const lastLine = trimmedSelector.split("\n").pop()?.trim() ?? trimmedSelector;
				violations.push({ file: filePath, line: baseLine + relativeLine, selector: lastLine });
			}
		}
		match = rulePattern.exec(stripped);
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
