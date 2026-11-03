<script lang="ts">
import { page } from "$app/state";
import SelectControl from "$lib/components/SelectControl.svelte";
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

<SelectControl aria-label="並び替え" value={sort} onchange={changeSort}>
	{#each MYLIST_SORTS as option (option.value)}
		<option value={option.value}>{option.label}</option>
	{/each}
</SelectControl>
