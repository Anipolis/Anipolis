<script lang="ts">
import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";
import { supabaseTarget } from "$lib/supabase-target";

// 開発サーバーで、いまどの DB につながっているかを常に見せる（本番には出ない）。
// pnpm dev は .env.staging を読むのでステージング、pnpm dev:prod は本番 DB。
// 目印だけでなく実際の接続先 URL で判定する（.env.staging に本番の値を書いてしまっても緑にしない）
const target = supabaseTarget(env["PUBLIC_SUPABASE_URL"], env["PUBLIC_ANIPOLIS_ENV"]);
const LABELS = { staging: "ステージング", production: "本番 DB", unknown: "接続先不明" } as const;
</script>

{#if dev}
	<div class="dev-env-badge" class:dev-env-badge--warn={target !== "staging"} aria-hidden="true">
		{LABELS[target]}
	</div>
{/if}

<style>
.dev-env-badge {
	position: fixed;
	top: 4px;
	left: 50%;
	z-index: 10000;
	transform: translateX(-50%);
	padding: 1px 8px;
	border-radius: 999px;
	background: #0f766e;
	color: #fff;
	font-size: 11px;
	font-weight: 700;
	line-height: 1.6;
	pointer-events: none;
	opacity: 0.85;
}
.dev-env-badge--warn {
	background: #dc2626;
}
</style>
