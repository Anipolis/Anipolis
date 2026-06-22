import adapter from "@sveltejs/adapter-cloudflare";
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
				// OAuth ログインはフォーム送信が Supabase 認可エンドポイント → 各プロバイダー
				// （discord.com / accounts.google.com）へと連続リダイレクトする。form-action は
				// リダイレクト連鎖の全ホップに適用されるため、その全オリジンを許可しないと
				// CSP がフォーム送信ごとブロックし、ボタンが無反応になる。
				"form-action": ["self", "https://*.supabase.co", "https://discord.com", "https://accounts.google.com"],
				"frame-ancestors": ["none"],
			},
		},
	},
};

export default config;
