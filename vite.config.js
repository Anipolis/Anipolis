import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

/** @type {import('@sveltejs/kit/vite').Config} */
const svelteConfig = {
	preprocess: vitePreprocess(),
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
			// OAuth のアイコン（Google / X / Discord）。本番の初期設定はアイコンの URL をそのまま保存するため。
			// develop ではアイコンを Storage に取り込むので（#328）、リリース後は取り込みスクリプトの実行で外せる
			"img-src": [
				"self",
				"data:",
				"blob:",
				"https://*.supabase.co",
				"https://lh3.googleusercontent.com",
				"https://pbs.twimg.com",
				// プロフィール画像を設定していない X アカウントの既定のアイコン
				"https://abs.twimg.com",
				"https://cdn.discordapp.com",
			],
			// Zen Maru Gothic は @fontsource でセルフホスト
			"font-src": ["self", "data:"],
			// Supabase REST / Auth / Storage と Realtime WebSocket
			"connect-src": ["self", "https://*.supabase.co", "wss://*.supabase.co"],
			"object-src": ["none"],
			"base-uri": ["self"],
			// OAuth ログインはフォーム送信が Supabase 認可エンドポイント → 各プロバイダー
			// （discord.com / accounts.google.com / x.com）へと連続リダイレクトする。form-action は
			// リダイレクト連鎖の全ホップに適用されるため、その全オリジンを許可しないと
			// CSP がフォーム送信ごとブロックし、ボタンが無反応になる。
			"form-action": [
				"self",
				"https://*.supabase.co",
				"https://discord.com",
				"https://accounts.google.com",
				"https://x.com",
				"https://api.x.com",
				"https://twitter.com",
			],
			"frame-ancestors": ["none"],
		},
	},
};

// SvelteKit は UnoCSS の transformIndexHtml フックを呼ばず、transform_index_html_unsupported の警告を出す。
// このフックは index.html 内のクラスを抽出するためのもので、src/app.html は UnoCSS のクラスを使わないため影響はない。
export default defineConfig({
	plugins: [UnoCSS(), sveltekit(svelteConfig)],
});
