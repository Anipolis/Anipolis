// 作品の共有用カード（1200x630 の JPEG）を描く（#271）。左にカバー、右に題名・期・種類、
// 下に Anipolis のロゴと権利表記（©）。カバーを出すときは © を添える決まりなので、カードにも必ず入れる。
// 文字は sharp（librsvg）が OS のフォントで描く。定期同期を回す Windows 機の游ゴシックを想定。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { animeCardMeta } from "../src/lib/anime-labels.ts";
import { ANIME_OG_HEIGHT, ANIME_OG_WIDTH } from "../src/lib/anime-og.ts";

const BLUE = "#1b4790";
const FONT = "Yu Gothic UI, Yu Gothic, Meiryo, Hiragino Sans, Noto Sans CJK JP, sans-serif";
const COVER_HEIGHT = 536;
const COVER_WIDTH = Math.round((COVER_HEIGHT * 400) / 566);
const COVER_LEFT = 60;
const COVER_TOP = Math.round((ANIME_OG_HEIGHT - COVER_HEIGHT) / 2);
const TEXT_LEFT = COVER_LEFT + COVER_WIDTH + 56;
const TEXT_WIDTH = ANIME_OG_WIDTH - TEXT_LEFT - 60;

let logoCache: Buffer | null = null;
async function logo(size: number): Promise<Buffer> {
	if (!logoCache) logoCache = await readFile(join(import.meta.dirname, "..", "static", "anipolis-logo-light.png"));
	return sharp(logoCache).resize(size, size).png().toBuffer();
}

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/** 1 文字の幅（em）のおおよそ。游ゴシック UI の実測で全角は 0.92、半角は 0.55 */
function charWidth(char: string): number {
	const code = char.codePointAt(0) ?? 0;
	// ASCII・ラテン文字と半角カナは細い
	const narrow = code <= 0xff || (code >= 0xff61 && code <= 0xff9f);
	return narrow ? 0.55 : 0.92;
}

/**
 * 幅に収まるように行を分ける。収まらない分は最後の行の末尾を「…」にする。
 * 英単語の途中では切らないようにし、日本語は文字単位で切る。
 */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
	const limit = maxWidth / fontSize;
	const tokens = text.match(/[A-Za-z0-9'’.,!?:;&-]+\s*|\s+|./gu) ?? [];
	const lines: string[] = [];
	let line = "";
	let width = 0;
	for (const token of tokens) {
		const tokenWidth = [...token].reduce((sum, char) => sum + charWidth(char), 0);
		if (width + tokenWidth > limit && line.trim()) {
			lines.push(line.trimEnd());
			line = "";
			width = 0;
			if (lines.length === maxLines) break;
		}
		if (tokenWidth > limit) {
			// 1 語が 1 行より長いときは文字単位で切る
			for (const char of token) {
				const w = charWidth(char);
				if (width + w > limit) {
					lines.push(line);
					line = "";
					width = 0;
					if (lines.length === maxLines) break;
				}
				line += char;
				width += w;
			}
			if (lines.length === maxLines) break;
			continue;
		}
		if (!line && /^\s+$/.test(token)) continue;
		line += token;
		width += tokenWidth;
	}
	const consumed = lines.join("").replace(/\s/g, "").length;
	const total = text.replace(/\s/g, "").length;
	if (lines.length < maxLines && line.trim()) lines.push(line.trimEnd());
	else if (lines.length === maxLines && consumed < total) {
		const last = lines[maxLines - 1] ?? "";
		const chars = [...last];
		while (chars.length > 0 && chars.reduce((sum, char) => sum + charWidth(char), 0) + 1 > limit) chars.pop();
		lines[maxLines - 1] = `${chars.join("").trimEnd()}…`;
	}
	return lines;
}

export interface AnimeOgCardInput {
	title: string;
	copyright: string;
	season: string | null;
	type: string | null;
	cover: Buffer;
}

export async function renderAnimeOgCard(input: AnimeOgCardInput): Promise<Buffer> {
	const titleSize = [...input.title].length > 24 ? 48 : 58;
	const titleLines = wrapText(input.title, titleSize, TEXT_WIDTH, 4);
	const lineHeight = Math.round(titleSize * 1.3);
	const meta = animeCardMeta({ type: input.type, season: input.season });
	const titleTop = meta ? 200 : 150;
	const copyrightLines = wrapText(input.copyright.replace(/\s+/g, " ").trim(), 18, TEXT_WIDTH, 2);

	const svg = `
<svg width="${ANIME_OG_WIDTH}" height="${ANIME_OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f4f6fb"/>
  <rect x="${COVER_LEFT - 2}" y="${COVER_TOP - 2}" width="${COVER_WIDTH + 4}" height="${COVER_HEIGHT + 4}" rx="18" fill="#dde3ee"/>
  ${meta ? `<text x="${TEXT_LEFT}" y="118" font-family="${FONT}" font-weight="700" font-size="28" fill="#4b5563">${escapeXml(meta)}</text>` : ""}
  ${titleLines
		.map(
			(line, index) =>
				`<text x="${TEXT_LEFT}" y="${titleTop + index * lineHeight}" font-family="${FONT}" font-weight="700" font-size="${titleSize}" fill="#111827">${escapeXml(line)}</text>`,
		)
		.join("\n  ")}
  <text x="${TEXT_LEFT + 64}" y="${ANIME_OG_HEIGHT - 118}" font-family="${FONT}" font-weight="700" font-size="34" fill="${BLUE}">Anipolis</text>
  <text x="${TEXT_LEFT + 64 + 160}" y="${ANIME_OG_HEIGHT - 118}" font-family="${FONT}" font-weight="400" font-size="22" fill="#4b5563">感想・実況・視聴記録</text>
  ${copyrightLines
		.map(
			(line, index) =>
				`<text x="${TEXT_LEFT}" y="${ANIME_OG_HEIGHT - 66 + index * 24}" font-family="${FONT}" font-weight="400" font-size="18" fill="#6b7280">${escapeXml(line)}</text>`,
		)
		.join("\n  ")}
</svg>`;

	const roundedMask = Buffer.from(
		`<svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}"><rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" rx="16" fill="#fff"/></svg>`,
	);
	const cover = await sharp(input.cover)
		.resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover", position: "top" })
		.composite([{ input: roundedMask, blend: "dest-in" }])
		.png()
		.toBuffer();

	return sharp(Buffer.from(svg))
		.composite([
			{ input: cover, left: COVER_LEFT, top: COVER_TOP },
			{ input: await logo(46), left: TEXT_LEFT, top: ANIME_OG_HEIGHT - 158 },
		])
		.flatten({ background: "#f4f6fb" })
		.jpeg({ quality: 82, mozjpeg: true })
		.toBuffer();
}
