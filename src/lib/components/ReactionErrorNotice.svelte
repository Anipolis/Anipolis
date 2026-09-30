<script lang="ts">
import type { ReactionFeedback } from "$lib/reaction-feedback.svelte";

interface Props {
	feedback: ReactionFeedback;
}

let { feedback }: Props = $props();

// ルームのカードはクリックで展開するため、ボタン操作をカードへ伝播させない
function stop(event: Event) {
	event.stopPropagation();
}
</script>

<!-- role="alert" で即時読み上げ。表示中は楽観更新がロールバック済みであることを前提にする -->
{#if feedback.message}
	<div class="reaction-error" role="alert">
		<span class="reaction-error-text">{feedback.message}</span>
		{#if feedback.canRetry}
			<button type="button" class="reaction-error-btn" onclick={(event) => { stop(event); feedback.retry(); }}>
				再試行
			</button>
		{/if}
		<button
			type="button"
			class="reaction-error-btn reaction-error-dismiss"
			aria-label="メッセージを閉じる"
			onclick={(event) => { stop(event); feedback.clear(); }}
		>
			閉じる
		</button>
	</div>
{/if}

<style>
.reaction-error {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 10px;
	margin: 6px 0 2px;
	padding: 8px 12px;
	border: 1px solid var(--color-error-border, var(--color-danger));
	border-radius: var(--radius-sm, 12px);
	background: var(--color-error-bg);
	color: var(--color-error-text, var(--color-danger));
	font-size: 13px;
	line-height: 1.4;
}

.reaction-error-text {
	flex: 1 1 auto;
	min-width: 0;
}

.reaction-error-btn {
	flex: 0 0 auto;
	padding: 2px 8px;
	border: 1px solid currentColor;
	border-radius: 999px;
	corner-shape: round;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 12px;
	cursor: pointer;
}

.reaction-error-btn:hover {
	background: color-mix(in srgb, currentColor 10%, transparent);
}

.reaction-error-dismiss {
	border-color: transparent;
	opacity: 0.8;
}
</style>
