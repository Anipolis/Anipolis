<script lang="ts">
import { onMount } from "svelte";

/**
 * はじめての人への案内（ホーム）。まだ誰もフォローしておらず、マイリストも空の人に、最初にやることを示す。
 * × で閉じたら、この端末では出さない（localStorage。読めない環境では毎回出る）
 */
interface Props {
	userId: string;
}

let { userId }: Props = $props();

const storageKey = $derived(`anipolis:welcome-dismissed:${userId}`);
// 閉じたかどうかを読むまでは出さない（閉じた人に一瞬出てから消えるのを防ぐ）
let visible = $state(false);

onMount(() => {
	try {
		visible = localStorage.getItem(storageKey) !== "1";
	} catch {
		visible = true;
	}
});

function dismiss(): void {
	visible = false;
	try {
		localStorage.setItem(storageKey, "1");
	} catch {
		// 保存できなくても、この画面では閉じたままにする
	}
}
</script>

{#if visible}
	<section class="welcome-card" aria-labelledby="welcome-card-title">
		<div class="welcome-card-header">
			<h2 id="welcome-card-title">Anipolisへようこそ</h2>
			<button type="button" class="welcome-card-close" onclick={dismiss} aria-label="案内を閉じる">
				<span class="i-lucide-x" aria-hidden="true"></span>
			</button>
		</div>
		<div class="welcome-card-actions">
			<a href="/anime" class="btn btn-secondary welcome-card-action">
				<span class="i-lucide-list-plus" aria-hidden="true"></span>
				アニメを探してマイリストに追加
			</a>
			<a href="/schedule" class="btn btn-secondary welcome-card-action">
				<span class="i-lucide-tv" aria-hidden="true"></span>
				今日の放送と実況ルームを見る
			</a>
			<a href="/search" class="btn btn-secondary welcome-card-action">
				<span class="i-lucide-user-search" aria-hidden="true"></span>
				ユーザーを探してフォロー
			</a>
		</div>
	</section>
{/if}

<style>
.welcome-card {
	margin: 0 0 12px;
	padding: 14px 16px 16px;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
}

.welcome-card-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 12px;
}

.welcome-card-header h2 {
	flex: 1;
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.welcome-card-close {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 8px;
	background: none;
	color: var(--color-text-muted);
	cursor: pointer;
}

.welcome-card-close:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.welcome-card-close [class^="i-lucide"] {
	width: 18px;
	height: 18px;
}

.welcome-card-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

/* 案内の中のボタンは補助の操作なので灰色の枠（.btn-secondary） */
.welcome-card-action {
	justify-content: flex-start;
	text-decoration: none;
}

.welcome-card-action:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
	text-decoration: none;
}

.welcome-card-action [class^="i-lucide"] {
	flex: none;
	width: 18px;
	height: 18px;
	color: var(--color-text-muted);
}
</style>
