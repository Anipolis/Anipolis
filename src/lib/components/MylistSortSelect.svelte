<script lang="ts">
import { page } from "$app/state";
import { DEFAULT_MYLIST_SORT, MYLIST_SORTS, type MylistSort, parseMylistSort } from "$lib/mylist/sort";
import { replaceMylistParam } from "$lib/mylist/url";

/**
 * マイリストの並び替えの欄。並び順は URL（?sort=）に残し、再読み込みや戻るでも同じ表示にする。
 * 親は sort を URL から読んだ値で初めにし（サーバーで描くときにも使う）、bind で受け取る
 */
type Props = {
	sort: MylistSort;
};

let { sort = $bindable() }: Props = $props();

// 別のページへ移ったとき（他の人のプロフィールへ移るなど）は URL から読み直す
const locationKey = $derived(page.url.pathname + page.url.search);
$effect(() => {
	void locationKey;
	sort = parseMylistSort(new URL(location.href).searchParams.get("sort"));
});

function changeSort(event: Event) {
	sort = parseMylistSort((event.currentTarget as HTMLSelectElement).value);
	replaceMylistParam("sort", sort, DEFAULT_MYLIST_SORT);
}
</script>

<label class="sort-control">
	<span class="sr-only">並び替え</span>
	<select class="sort-select" value={sort} onchange={changeSort}>
		{#each MYLIST_SORTS as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<span class="i-lucide-chevron-down sort-chevron" aria-hidden="true"></span>
</label>

<style>
/* 枠と高さは .btn-secondary と同じ。開いたときの一覧は端末の標準のまま（スマホの選択画面やキーボード操作を活かす） */
.sort-control {
	position: relative;
	display: inline-flex;
	min-width: 0;
	align-items: center;
	height: 32px;
	border: 1.5px solid var(--color-border-hover);
	border-radius: 8px;
	color: var(--color-text-muted);
}

.sort-control:hover {
	background: var(--color-surface-hover);
}

.sort-control:focus-within {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
}

.sort-select {
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

.sort-select option {
	background: var(--color-surface);
	color: var(--color-text);
	font-weight: 400;
}

.sort-chevron {
	position: absolute;
	right: 7px;
	width: 14px;
	height: 14px;
	pointer-events: none;
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
</style>
