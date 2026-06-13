import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		csp: {
			mode: "auto",
			directives: {
				"default-src": ["self"],
				// SvelteKit が SSR スクリプトに nonce を自動付与する（app.html の
				// インラインスクリプトには %sveltekit.nonce% を明示）
				"script-src": ["self"],
				// Svelte の transition / style: ディレクティブがインラインスタイルを使う
				"style-src": ["self", "unsafe-inline"],
				// blob: は画像プレビュー、data: はアイコン類、
				// supabase.co はストレージ画像、googleusercontent は OAuth アバター
				"img-src": ["self", "data:", "blob:", "https://*.supabase.co", "https://lh3.googleusercontent.com"],
				// Zen Maru Gothic（UnoCSS presetWebFonts → Google Fonts）
				"font-src": ["self", "data:", "https://fonts.gstatic.com"],
				// Supabase REST / Auth / Storage と Realtime WebSocket
				"connect-src": ["self", "https://*.supabase.co", "wss://*.supabase.co"],
				"object-src": ["none"],
				"base-uri": ["self"],
				"form-action": ["self"],
				"frame-ancestors": ["none"],
			},
		},
	},
};

export default config;
