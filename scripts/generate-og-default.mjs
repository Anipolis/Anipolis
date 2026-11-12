// 共有用の既定 OG 画像 static/og-default.png（1200x630）を作る（#271）。
// ロゴ（static/anipolis-logo-light.png）と文字を合成する。文字は手元の OS のフォント（游ゴシック等）で描く。
// 使い方: node scripts/generate-og-default.mjs
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const BLUE = "#1b4790";
const logo = await sharp("static/anipolis-logo-light.png").resize(300, 300).png().toBuffer();
const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="0" y="${HEIGHT - 16}" width="100%" height="16" fill="${BLUE}"/>
  <text x="520" y="290" font-family="Yu Gothic UI, Yu Gothic, Meiryo, sans-serif" font-weight="700" font-size="112" fill="${BLUE}">Anipolis</text>
  <text x="524" y="370" font-family="Yu Gothic UI, Yu Gothic, Meiryo, sans-serif" font-weight="700" font-size="38" fill="#1f2937">アニメを観ながら、みんなで語ろう</text>
  <text x="524" y="430" font-family="Yu Gothic UI, Yu Gothic, Meiryo, sans-serif" font-weight="400" font-size="28" fill="#4b5563">実況ルーム・視聴記録・感想の共有</text>
</svg>`;
await sharp(Buffer.from(svg))
	.composite([{ input: logo, left: 150, top: 150 }])
	.png({ compressionLevel: 9 })
	.toFile("static/og-default.png");
console.log("wrote static/og-default.png");
