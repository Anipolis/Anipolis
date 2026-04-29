<script lang="ts">
    import { goto } from '$app/navigation';

    let searchQuery = $state('');

    function handleSearch(event: Event) {
        event.preventDefault();
        const query = searchQuery.trim();
        if (query) goto(`/search?q=${encodeURIComponent(query)}`);
    }
</script>

<nav class="nav">
    <div class="nav-inner">
        <a href="/" class="nav-logo">Anipolis</a>

        <form class="nav-search" onsubmit={handleSearch}>
            <span class="nav-search-icon">🔍</span>
            <input type="search" placeholder="検索" bind:value={searchQuery} aria-label="検索" />
        </form>
    </div>
</nav>
