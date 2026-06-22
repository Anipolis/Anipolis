import presetIcons from "@unocss/preset-icons";
import { presetWind3 } from "@unocss/preset-wind3";
import { defineConfig, presetWebFonts } from "unocss";

export default defineConfig({
	presets: [
		presetWind3(),
		presetIcons({
			collections: {
				lucide: () => import("@iconify-json/lucide/icons.json").then((m) => m.default),
			},
		}),
		presetWebFonts({
			provider: "google",
			fonts: {
				sans: "Zen Maru Gothic",
			},
		}),
	],
});
