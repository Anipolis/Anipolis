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
			},
		}),
	],
});
