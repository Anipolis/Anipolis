import { readFile } from "node:fs/promises";
import presetIcons from "@unocss/preset-icons";
import { presetWind3 } from "@unocss/preset-wind3";
import { defineConfig } from "unocss";

// Zen Maru Gothic は @fontsource でセルフホストする（+layout.svelte / app.css）
export default defineConfig({
	presets: [
		presetWind3(),
		presetIcons({
			collections: {
				lucide: () => import("@iconify-json/lucide/icons.json").then((m) => m.default),
				// ログイン手段のロゴ（i-brand-discord など）。src/lib/assets/brand/*.svg を読む。
				// Discord・X は Simple Icons、Google は Google 配信の G。色を書いた SVG はその色のまま、
				// currentColor の SVG（X）は文字色で出る
				brand: (name) =>
					/^[a-z0-9-]+$/.test(name)
						? readFile(new URL(`./src/lib/assets/brand/${name}.svg`, import.meta.url), "utf8").catch(
								() => undefined,
							)
						: undefined,
			},
		}),
	],
});
