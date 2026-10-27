<script lang="ts">
interface Props {
	src: string | null | undefined;
	username: string;
	size?: "xs" | "sm" | "md" | "lg";
}

let { src, username, size = "md" }: Props = $props();

const initial = $derived(username ? (username[0] ?? "?").toUpperCase() : "?");

// 読み込めなかった画像（CSP で拒否・リンク切れ）は頭文字に切り替える。src が変わったら再挑戦する
let failedSrc = $state<string | null>(null);
const showImage = $derived(Boolean(src) && failedSrc !== src);

function markFailed() {
	failedSrc = src ?? null;
}

/**
 * 読み込みの失敗を見張る。onerror={...} と書くと、SSR がハイドレーション前のイベントを拾うための
 * インラインの onerror 属性を HTML に出し、CSP（script-src に unsafe-inline が無い）に止められて
 * コンソールにエラーが出るので、マウント時に addEventListener で付ける。
 * SSR の HTML で先に読み込みに失敗した画像には error が届かないので、マウント時にも確かめる
 */
// biome-ignore lint/correctness/noUnusedVariables: マークアップの {@attach} から使う
function watchFailure(img: HTMLImageElement) {
	if (img.complete && img.naturalWidth === 0) markFailed();
	img.addEventListener("error", markFailed);
	return () => img.removeEventListener("error", markFailed);
}
</script>

<div class="avatar avatar-{size}" aria-label={username}>
	{#if showImage}
		<img {src} alt={username} referrerpolicy="no-referrer" decoding="async" {@attach watchFailure}>
	{:else}
		{initial}
	{/if}
</div>

<style>
.avatar-xs {
	width: 20px;
	height: 20px;
	font-size: 10px;
}
</style>
