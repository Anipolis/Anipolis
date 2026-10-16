<script lang="ts">
import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";

// 開発サーバーで、いまどの DB につながっているかを常に見せる（本番には出ない）。
// pnpm dev は .env.staging を読むのでステージング、pnpm dev:prod は本番 DB。
const isStaging = env["PUBLIC_ANIPOLIS_ENV"] === "staging";
</script>

{#if dev}
	<div class="dev-env-badge" class:dev-env-badge--prod={!isStaging} aria-hidden="true">
		{isStaging ? "ステージング" : "本番 DB"}
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
.dev-env-badge--prod {
	background: #dc2626;
}
</style>
