<script lang="ts">
import { page } from "$app/state";
import { scrollableTabs } from "$lib/actions/scrollableTabs";
import {
	DEFAULT_MYLIST_TAB,
	MYLIST_TAB_LABELS,
	MYLIST_TAB_ORDER,
	type MylistTab,
	parseMylistTab,
} from "$lib/mylist/sort";
import { replaceMylistParam } from "$lib/mylist/url";

/**
 * マイリスト（自分のページとプロフィールのタブ）の上に置く、ステータスのタブ。
 * 開いているタブは URL（?status=）に残し、再読み込みや戻るでも同じ表示にする。
 * 親は status を URL から読んだ値で初めにし（サーバーで描くときにも使う）、bind で受け取る
 */
type Props = {
	counts: Record<MylistTab, number>;
	status: MylistTab;
};

let { counts, status = $bindable() }: Props = $props();

// 別のページへ移ったとき（他の人のプロフィールへ移るなど）は URL から読み直す。
// replaceState は page.url を変えないので、タブを押しただけではここは走らない
const locationKey = $derived(page.url.pathname + page.url.search);
$effect(() => {
	void locationKey;
	status = parseMylistTab(new URL(location.href).searchParams.get("status"));
});

function selectTab(next: MylistTab) {
	status = next;
	replaceMylistParam("status", status, DEFAULT_MYLIST_TAB);
}
</script>

<div
	class="status-tab-bar"
	role="tablist"
	aria-label="視聴ステータス"
	{@attach scrollableTabs(".status-tab.active", status)}
>
	{#each MYLIST_TAB_ORDER as option (option)}
		<button
			type="button"
			role="tab"
			class="status-tab"
			class:active={status === option}
			aria-selected={status === option}
			onclick={() => selectTab(option)}
		>
			{MYLIST_TAB_LABELS[option]}
			<span class="tab-count">{counts[option]}</span>
		</button>
	{/each}
</div>

<style>
/* ---- ステータスのタブ（PC もスマホも同じ。入らない幅では横に送る） ---- */
.status-tab-bar {
	display: flex;
	width: 100%;
	margin-bottom: 16px;
	overflow-x: auto;
	border-bottom: 1px solid var(--color-border);
	scrollbar-width: none;
}

.status-tab-bar::-webkit-scrollbar {
	display: none;
}

.status-tab {
	position: relative;
	display: flex;
	flex: 1 0 auto;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 10px 8px;
	border: none;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1;
	white-space: nowrap;
	transition: color 0.15s;
}

.status-tab:hover,
.status-tab.active {
	color: var(--color-text);
}

.status-tab.active::after {
	position: absolute;
	right: 8px;
	bottom: 0;
	left: 8px;
	height: 2px;
	border-radius: 2px 2px 0 0;
	background: var(--color-accent);
	content: "";
}

.tab-count {
	font-size: 0.75rem;
	font-weight: 500;
	opacity: 0.8;
}

@media (max-width: 600px) {
	.status-tab-bar {
		margin-bottom: 12px;
	}

	.status-tab {
		gap: 4px;
		padding: 10px 12px;
		font-size: 0.8rem;
	}

	.status-tab.active::after {
		right: 12px;
		left: 12px;
	}

	.tab-count {
		font-size: 0.7rem;
	}
}
</style>
