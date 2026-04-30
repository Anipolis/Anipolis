import presetIcons from "@unocss/preset-icons";
import { defineConfig, presetUno, presetWebFonts } from "unocss";

export default defineConfig({
	presets: [
		presetUno(),
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
