<script lang="ts">
import { onMount } from "svelte";
import { invalidate } from "$app/navigation";
import Nav from "$lib/components/Nav.svelte";
import Sidebar from "$lib/components/Sidebar.svelte";
import type { LayoutProps } from "./$types";
import "../app.css";

let { data, children }: LayoutProps = $props();

// 通知バッジ数は deferred Promise で渡される。
// 初期値 0 で描画を開始し、Promise が解決されたらリアクティブに更新する。
// ページコンテンツのレンダリングをバッジ取得待ちでブロックしないための実装。
let resolvedUnreadCount = $state(0);
let resolvedPendingCount = $state(0);

$effect(() => {
	Promise.resolve(data.unreadNotificationCount).then((v) => {
		resolvedUnreadCount = v ?? 0;
	});
	Promise.resolve(data.pendingFollowRequestCount).then((v) => {
		resolvedPendingCount = v ?? 0;
	});
});

onMount(() => {
	const {
		data: { subscription },
	} = data.supabase.auth.onAuthStateChange(() => {
		invalidate("supabase:auth");
	});
	return () => subscription.unsubscribe();
});
</script>

<div class="app-layout">
	<Sidebar
		supabase={data.supabase}
		session={data.session}
		profile={data.profile}
		unreadNotificationCount={resolvedUnreadCount}
		pendingFollowRequestCount={resolvedPendingCount}
	/>
	<div class="app-main">
		<Nav />
		{@render children()}
	</div>
</div>
