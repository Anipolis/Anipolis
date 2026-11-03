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
	/** スマホ幅ではアイコンだけにする（並べる幅が足りない見出しの行で使う）。押すとふつうに選べる */
	compactOnMobile?: boolean;
};

let { sort = $bindable(), compactOnMobile = false }: Props = $props();

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

<label class="sort-control" class:compact={compactOnMobile}>
	<span class="i-lucide-arrow-down-wide-narrow sort-icon" aria-hidden="true"></span>
	<span class="sr-only">並び替え</span>
	<select class="sort-select" value={sort} onchange={changeSort}>
		{#each MYLIST_SORTS as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</label>

<style>
.sort-control {
	position: relative;
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 4px;
	height: 32px;
	padding: 0 4px 0 8px;
	border: 1px solid var(--color-border-hover);
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

.sort-icon {
	flex: 0 0 auto;
	width: 16px;
	height: 16px;
}

.sort-select {
	height: 100%;
	border: 0;
	outline: none;
	background: transparent;
	color: var(--color-text);
	font: inherit;
	font-size: 0.8rem;
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
	.sort-control.compact {
		justify-content: center;
		width: 32px;
		padding: 0;
	}

	/* アイコンの上に透明なプルダウンを重ね、押すと端末の標準の選択画面を開く */
	.sort-control.compact .sort-select {
		position: absolute;
		inset: 0;
		width: 100%;
		opacity: 0;
	}
}
</style>
