<script lang="ts">
import type { HTMLSelectAttributes } from "svelte/elements";

/**
 * 標準のプルダウン。閉じたときの見た目だけ .btn-secondary にそろえ、開いたときの一覧は端末の標準のまま
 * （スマホの選択画面やキーボード操作を活かす）。読み上げの名前は aria-label で渡す。
 * 幅と高さは、親から :global(.select-control) で決める
 */
let { children, ...rest }: HTMLSelectAttributes = $props();
</script>

<span class="select-control">
	<select {...rest}>
		{@render children?.()}
	</select>
	<span class="i-lucide-chevron-down select-chevron" aria-hidden="true"></span>
</span>

<style>
.select-control {
	position: relative;
	display: inline-flex;
	min-width: 0;
	align-items: center;
	height: 32px;
	border: 1.5px solid var(--color-border-hover);
	border-radius: 8px;
	color: var(--color-text-muted);
}

.select-control:hover {
	background: var(--color-surface-hover);
}

.select-control:focus-within {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
}

select {
	flex: 1 1 auto;
	min-width: 0;
	height: 100%;
	padding: 0 26px 0 10px;
	border: 0;
	outline: none;
	background: transparent;
	color: var(--color-text);
	font: inherit;
	font-size: 0.8rem;
	font-weight: 600;
	text-overflow: ellipsis;
	appearance: none;
	cursor: pointer;
}

select :global(option) {
	background: var(--color-surface);
	color: var(--color-text);
	font-weight: 400;
}

.select-chevron {
	position: absolute;
	right: 7px;
	width: 14px;
	height: 14px;
	pointer-events: none;
}
</style>
