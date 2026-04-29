<script lang="ts">
import { goto } from "$app/navigation";

let searchQuery = $state("");

function handleSearch(event: Event) {
	event.preventDefault();
	const form = event.currentTarget as HTMLFormElement | null;
	const formData = form ? new FormData(form) : null;
	const query = ((formData?.get("q")?.toString() ?? searchQuery) || "").trim();
	if (query) goto(`/search?q=${encodeURIComponent(query)}`);
}
</script>

<nav class="nav">
	<div class="nav-inner">
		<a href="/" class="nav-logo">Anipolis</a>

		<form class="nav-search" action="/search" method="get" onsubmit={handleSearch}>
			<span class="nav-search-icon">🔍</span>
			<input type="search" name="q" placeholder="検索" bind:value={searchQuery} aria-label="検索">
		</form>
	</div>
</nav>
