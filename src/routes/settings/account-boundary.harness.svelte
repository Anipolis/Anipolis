<script lang="ts">
// テスト専用: 設定ページを layout と同じ AccountBoundary で包んで描画する（#298）
import type { Component } from "svelte";
import AccountBoundary from "$lib/components/AccountBoundary.svelte";

interface Props {
	userId: string | null;
	// biome-ignore lint/suspicious/noExplicitAny: テスト対象のページごとに props の型が異なる
	page: Component<any>;
	pageProps: Record<string, unknown>;
}

let { userId, page: Page, pageProps }: Props = $props();
</script>

<AccountBoundary {userId}>
	<Page {...pageProps} />
</AccountBoundary>
