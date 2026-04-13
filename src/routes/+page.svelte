<script lang="ts">
import PostItem from "$lib/components/PostItem.svelte";
import { mockTimeline } from "$lib/mock/timeline";
</script>

<svelte:head> <title>タイムライン | Anipolis</title> </svelte:head>

<div class="mx-auto min-h-screen max-w-2xl bg-white">
	<!-- Header -->
	<header class="sticky top-0 border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur-md">
		<h1 class="text-lg font-bold text-gray-900">タイムライン</h1>
	</header>

	<!-- Timeline -->
	<div>
		{#each mockTimeline as post (post.id)}
			<PostItem {post} />
		{/each}
	</div>
</div>
