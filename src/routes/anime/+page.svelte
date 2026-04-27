<script lang="ts">
    import type { PageProps } from './$types';
    import type { Anime, AnimeStatus } from '$lib/types';

    let { data }: PageProps = $props();



    const tabs = [
        { id: 'popular',   label: '人気' },
        { id: 'trending',  label: 'トレンド' },
        { id: 'top_rated', label: '高評価' },
        { id: 'airing',    label: '放送中' },
        { id: 'upcoming',  label: '放送予定' },
        { id: 'mylist',    label: 'マイリスト' },
    ] as const;

    const statusLabels: Record<AnimeStatus, string> = {
        watching:      '視聴中',
        completed:     '完了',
        plan_to_watch: '視聴予定',
        dropped:       '断念',
        on_hold:       '一時停止',
    };

    function getCoverUrl(url: string | null | undefined, width: number): string {
        if (!url) return '';
        const height = Math.round(width * 3 / 2);
        return url.replace('/object/public/', '/render/image/public/') + `?width=${width}&height=${height}&resize=cover&quality=85&format=webp`;
    }

    function animeStatusBadge(anime: Anime): string {
        if (anime.status === 'airing' || !anime.status) return '放送中';
        if (anime.status === 'upcoming') return '放送予定';
        return '放送終了';
    }
</script>

<svelte:head>
    <title>アニメ — Anipolis</title>
</svelte:head>

<div class="anime-page-wrap">
    <main class="anime-main">
        <h1 class="section-title">アニメ</h1>

        <form method="GET" action="/anime" class="search-form">
            <input
                type="text"
                name="search"
                class="search-input"
                placeholder="タイトルで検索..."
                value={data.search ?? ''}
            />
            <button type="submit" class="search-btn">検索</button>
            {#if data.search}
                <a href="/anime" class="search-clear">✕</a>
            {/if}
        </form>

        <nav class="tab-nav">
            {#each tabs as tab}
                {#if tab.id !== 'mylist' || data.user}
                    <a
                        href="/anime?tab={tab.id}"
                        class="tab-btn"
                        class:active={data.tab === tab.id}
                    >{tab.label}</a>
                {/if}
            {/each}
        </nav>

        {#if data.search}
            <p class="search-label">「{data.search}」の検索結果 — {data.animes.length}件</p>
        {:else if data.genre}
            <p class="search-label">ジャンル：<strong>{data.genre}</strong> — {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a></p>
        {:else if data.season}
            <p class="search-label">シーズン：<strong>{data.season}</strong> — {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a></p>
        {:else if data.studio}
            <p class="search-label">スタジオ：<strong>{data.studio}</strong> — {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a></p>
        {:else if data.producer}
            <p class="search-label">制作：<strong>{data.producer}</strong> — {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a></p>
        {/if}

        {#if data.tab === 'mylist' && !data.user}
            <div class="empty-state">
                <p>マイリストを見るにはログインが必要です</p>
            </div>
        {:else if data.animes.length === 0}
            <div class="empty-state">
                <p>アニメが見つかりません</p>
            </div>
        {:else}
            <div class="anime-grid">
                {#each data.animes as anime, i}
                    <a href="/anime/{anime.id}" class="anime-card">
                        <div class="anime-cover">
                            {#if anime.cover_url}
                                <img src={getCoverUrl(anime.cover_url, 400)} alt={anime.title} loading="lazy" />
                            {:else}
                                <div class="anime-cover-placeholder">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                                        <rect x="2" y="2" width="20" height="20" rx="2"/>
                                        <path d="M10 8l6 4-6 4V8z"/>
                                    </svg>
                                </div>
                            {/if}
                            {#if data.tab === 'popular' || data.tab === 'trending' || data.tab === 'top_rated'}
                                <span class="rank-badge">#{i + 1}</span>
                            {/if}
                        </div>
                        <div class="anime-info">
                            <p class="anime-title">{anime.title}</p>
                            {#if anime.title_en}
                                <p class="anime-title-en">{anime.title_en}</p>
                            {/if}
                            <div class="anime-meta">
                                <span class="anime-status-badge status-{anime.status}">{animeStatusBadge(anime)}</span>
                                {#if anime.season}
                                    <span class="anime-season">{anime.season}</span>
                                {/if}
                            </div>
                            {#if anime.user_entry}
                                <span class="mylist-badge">{statusLabels[anime.user_entry.status as AnimeStatus]}</span>
                            {/if}
                        </div>
                    </a>
                {/each}
            </div>
        {/if}
    </main>
</div>

<style>
    .anime-page-wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: 0 16px;
    }
    .anime-main {
        width: 100%;
    }

    .search-form {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        align-items: center;
    }
    .search-input {
        flex: 1;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--card-bg);
        color: var(--text);
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.15s;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-btn {
        padding: 8px 16px;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        border: none;
        font-size: 0.85rem;
        cursor: pointer;
        transition: opacity 0.15s;
    }
    .search-btn:hover { opacity: 0.85; }
    .search-clear {
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.85rem;
        transition: background 0.15s;
    }
    .search-clear:hover { background: var(--hover-bg); }
    .filter-clear {
        margin-left: 6px;
        padding: 2px 7px;
        border-radius: 6px;
        border: 1px solid var(--border);
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.8rem;
    }
    .filter-clear:hover { background: var(--hover-bg); }
    .search-label {
        font-size: 0.85rem;
        color: var(--text-muted);
        margin-bottom: 12px;
    }

    .tab-nav {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }
    .tab-btn {
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 0.85rem;
        color: var(--text-muted);
        text-decoration: none;
        border: 1px solid var(--border);
        transition: all 0.15s;
    }
    .tab-btn:hover { background: var(--hover-bg); color: var(--text); }
    .tab-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

    .anime-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 14px;
    }
    .anime-card {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: var(--text);
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--border);
        transition: border-color 0.15s, transform 0.15s;
    }
    .anime-card:hover { border-color: var(--accent); transform: translateY(-2px); }

    .anime-cover {
        position: relative;
        aspect-ratio: 2/3;
        background: var(--card-bg);
        overflow: hidden;
    }
    .anime-cover img {
        width: 100%; height: 100%;
        object-fit: cover;
        object-position: top center;
        image-rendering: -webkit-optimize-contrast;
    }
    .anime-cover-placeholder {
        width: 100%; height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        background: var(--hover-bg);
    }
    .rank-badge {
        position: absolute;
        top: 6px; left: 6px;
        background: rgba(0,0,0,0.7);
        color: #fff;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .anime-info {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
    }
    .anime-title {
        font-size: 0.85rem;
        font-weight: 600;
        line-height: 1.3;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .anime-title-en {
        font-size: 0.72rem;
        color: var(--text-muted);
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .anime-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
        margin-top: 2px;
    }
    .anime-status-badge {
        font-size: 0.7rem;
        padding: 1px 5px;
        border-radius: 3px;
        font-weight: 600;
    }
    .status-airing { background: #16a34a22; color: #16a34a; }
    .status-upcoming { background: #2563eb22; color: #2563eb; }
    .status-finished { background: var(--hover-bg); color: var(--text-muted); }

    .anime-season { font-size: 0.72rem; color: var(--text-muted); }
    .mylist-badge {
        font-size: 0.7rem;
        padding: 1px 5px;
        border-radius: 3px;
        background: var(--accent-muted, #7c3aed22);
        color: var(--accent);
        width: fit-content;
    }

    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: var(--text-muted);
    }
</style>
