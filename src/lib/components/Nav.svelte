<script lang="ts">
import { goto } from "$app/navigation";

let searchQuery = $state("");

function handleSearch(event: Event) {
	event.preventDefault();
	const query = searchQuery.trim();
	if (query) goto(`/search?q=${encodeURIComponent(query)}`);
}
</script>

<nav class="nav" aria-label="サイト検索">
	<div class="nav-inner">
		<a href="/" class="nav-logo">Anipolis</a>

		<form class="nav-search" onsubmit={handleSearch} role="search" aria-label="サイト内検索">
			<span class="nav-search-icon" aria-hidden="true">🔍</span>
			<input type="search" placeholder="検索" bind:value={searchQuery} aria-label="検索">
		</form>
	</div>
</nav>
