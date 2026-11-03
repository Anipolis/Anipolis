<script lang="ts">
import type { Snippet } from "svelte";
import { replaceState } from "$app/navigation";
import { page } from "$app/state";
import {
	DEFAULT_MYLIST_SORT,
	DEFAULT_MYLIST_STATUS,
	MYLIST_SORTS,
	MYLIST_STATUS_ORDER,
	type MylistSort,
	parseMylistSort,
	parseMylistStatus,
} from "$lib/mylist/sort";
import type { AnimeStatus } from "$lib/types";

/**
 * マイリスト（自分のページとプロフィールのタブ）の上に置く、ステータスのタブと並び替えの欄。
 * 開いているタブと並び順は URL（?status= と ?sort=）に残し、再読み込みや戻るでも同じ表示にする。
 * 親は status と sort を URL から読んだ値で初めにし（サーバーで描くときにも使う）、bind で受け取る
 */
type Props = {
	counts: Record<AnimeStatus, number>;
	status: AnimeStatus;
	sort: MylistSort;
	/** 並び替えの欄の左に置くもの（件数など） */
	toolbarStart?: Snippet | undefined;
};

let { counts, status = $bindable(), sort = $bindable(), toolbarStart }: Props = $props();

const labels: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

const shortLabels: Record<AnimeStatus, string> = { ...labels, plan_to_watch: "予定" };

const icons: Record<AnimeStatus, string> = {
	watching: "i-lucide-circle-play",
	completed: "i-lucide-circle-check",
	plan_to_watch: "i-lucide-clipboard-list",
	on_hold: "i-lucide-circle-pause",
	dropped: "i-lucide-circle-x",
};

// 別のページへ移ったとき（他の人のプロフィールへ移るなど）は URL から読み直す。
// replaceState は page.url を変えないので、タブを押しただけではここは走らない
const locationKey = $derived(page.url.pathname + page.url.search);
$effect(() => {
	void locationKey;
	const params = new URL(location.href).searchParams;
	status = parseMylistStatus(params.get("status"));
	sort = parseMylistSort(params.get("sort"));
});

function syncUrl() {
	const url = new URL(location.href);
	if (status === DEFAULT_MYLIST_STATUS) url.searchParams.delete("status");
	else url.searchParams.set("status", status);
	if (sort === DEFAULT_MYLIST_SORT) url.searchParams.delete("sort");
	else url.searchParams.set("sort", sort);
	replaceState(url, page.state);
}

function selectStatus(next: AnimeStatus) {
	status = next;
	syncUrl();
}

function changeSort(event: Event) {
	sort = parseMylistSort((event.currentTarget as HTMLSelectElement).value);
	syncUrl();
}
</script>

<div class="status-tab-bar" role="tablist" aria-label="視聴ステータス">
	{#each MYLIST_STATUS_ORDER as option (option)}
		<button
			type="button"
			role="tab"
			class="status-tab status-tab--{option}"
			class:active={status === option}
			aria-selected={status === option}
			onclick={() => selectStatus(option)}
		>
			<span class="tab-icon {icons[option]}" aria-hidden="true"></span>
			<span class="desktop-tab-label">{labels[option]}</span>
			<span class="mobile-tab-label">{shortLabels[option]}</span>
			<span class="tab-count">{counts[option]}</span>
		</button>
	{/each}
</div>

<div class="mylist-toolbar">
	<div class="toolbar-start">{@render toolbarStart?.()}</div>
	<label class="sort-control">
		<span class="i-lucide-arrow-down-wide-narrow sort-icon" aria-hidden="true"></span>
		<span class="sr-only">並び替え</span>
		<select class="sort-select" value={sort} onchange={changeSort}>
			{#each MYLIST_SORTS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>
</div>

<style>
/* ---- ステータスのタブ（PC もスマホも同じ。スマホは短い名前だけ） ---- */
.status-tab-bar {
	display: flex;
	width: 100%;
	margin-bottom: 8px;
	border-bottom: 1px solid var(--color-border);
}

.status-tab {
	position: relative;
	display: flex;
	flex: 1 1 20%;
	align-items: center;
	justify-content: center;
	min-width: 0;
	gap: 6px;
	padding: 10px 0;
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

.status-tab:hover {
	color: var(--color-text);
}

.status-tab.active {
	color: var(--color-accent);
}
.status-tab--watching.active {
	color: var(--status-watching);
}
.status-tab--on_hold.active {
	color: var(--status-on-hold);
}
.status-tab--dropped.active {
	color: var(--status-dropped);
}
.status-tab--completed.active {
	color: var(--status-completed);
}
.status-tab--plan_to_watch.active {
	color: var(--watch-status-plan);
}

.status-tab.active::after {
	position: absolute;
	right: 8px;
	bottom: -1px;
	left: 8px;
	height: 2px;
	border-radius: 2px 2px 0 0;
	background: currentColor;
	content: "";
}

.tab-icon {
	width: 1em;
	height: 1em;
	flex: 0 0 auto;
	font-size: 0.9rem;
}

.mobile-tab-label {
	display: none;
}

.tab-count {
	font-size: 0.75rem;
	font-weight: 500;
	opacity: 0.8;
}

/* ---- 並び替え ---- */
.mylist-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
}

.toolbar-start {
	min-width: 0;
}

.sort-control {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 6px;
	color: var(--color-text-muted);
}

.sort-icon {
	width: 16px;
	height: 16px;
}

.sort-select {
	height: 32px;
	padding: 0 8px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	color: var(--color-text);
	font: inherit;
	font-size: 0.82rem;
	cursor: pointer;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 600px) {
	.status-tab {
		gap: 3px;
		padding: 8px 0;
		font-size: 11px;
	}

	.status-tab.active::after {
		right: 5px;
		left: 5px;
	}

	.tab-icon,
	.desktop-tab-label {
		display: none;
	}

	.mobile-tab-label {
		display: inline;
	}

	.tab-count {
		font-size: 10px;
		opacity: 0.75;
	}

	.mylist-toolbar {
		margin-bottom: 8px;
	}
}
</style>
