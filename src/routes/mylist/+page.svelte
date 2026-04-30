<script lang="ts">
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import type { PageProps } from './$types';
    import type { AnimeStatus, Anime } from '$lib/types';

    let { data, form }: PageProps = $props();

    const statusOrder: AnimeStatus[] = ['watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped'];

    const statusLabel: Record<AnimeStatus, string> = {
        watching: '視聴中',
        completed: '完了',
        plan_to_watch: '視聴予定',
        on_hold: '中断中',
        dropped: '断念',
    };

    const statusIcon: Record<AnimeStatus, string> = {
        watching: '▶',
        completed: '✓',
        plan_to_watch: '📋',
        on_hold: '⏸',
        dropped: '✕',
    };

    let isPublic = $state(data.profile.list_is_public);
    let viewMode = $state<'list' | 'edit'>('list');

    $effect(() => {
        if (form && 'list_is_public' in form) {
            isPublic = (form as { list_is_public: boolean }).list_is_public;
        }
    });

    const grouped = $derived(
        statusOrder.reduce<Record<AnimeStatus, Anime[]>>(
            (acc, status) => {
                acc[status] = data.animeList.filter((e) => e.user_entry?.status === status);
                return acc;
            },
            { watching: [], completed: [], plan_to_watch: [], on_hold: [], dropped: [] },
        ),
    );

    const totalCount = $derived(data.animeList.length);

    const statCounts = $derived(
        statusOrder.map((s) => ({ status: s, count: grouped[s].length })),
    );

    // 各エントリのローカル状態（編集用）
    type EntryState = { status: AnimeStatus; score: string; progress: number };
    let entryStates = $state<Record<string, EntryState>>({});

    $effect(() => {
        for (const anime of data.animeList) {
            entryStates[anime.id] = {
                status: anime.user_entry?.status ?? 'plan_to_watch',
                score: anime.user_entry?.score?.toString() ?? '',
                progress: anime.user_entry?.progress ?? 0,
            };
        }
    });
</script>

<svelte:head>
    <title>マイリスト — Anipolis</title>
</svelte:head>

<div class="mylist-page">
    <div class="mylist-container">
        <header class="mylist-header">
            <div class="mylist-title-row">
                <h1 class="mylist-title">★ マイリスト</h1>
                <div class="header-actions">
                    <!-- 表示切り替え -->
                    <div class="view-toggle">
                        <button
                            class="view-btn"
                            class:active={viewMode === 'list'}
                            onclick={() => (viewMode = 'list')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                            一覧
                        </button>
                        <button
                            class="view-btn"
                            class:active={viewMode === 'edit'}
                            onclick={() => (viewMode = 'edit')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            編集
                        </button>
                    </div>

                    <!-- 公開/非公開切り替え -->
                    <form
                        method="POST"
                        action="?/toggleVisibility"
                        use:enhance={() => {
                            return ({ result }) => {
                                if (result.type === 'success' && result.data) {
                                    isPublic = (result.data as { list_is_public: boolean }).list_is_public;
                                }
                            };
                        }}
                    >
                        <button type="submit" class="visibility-btn" class:public={isPublic} class:private={!isPublic}>
                            {#if isPublic}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                公開中
                            {:else}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                非公開
                            {/if}
                        </button>
                    </form>
                </div>
            </div>

            <div class="mylist-stats">
                <span class="stat-total">合計 <strong>{totalCount}</strong> 作品</span>
                {#each statCounts as { status, count }}
                    {#if count > 0}
                        <span class="stat-chip stat-chip--{status}">
                            {statusLabel[status]} {count}
                        </span>
                    {/if}
                {/each}
            </div>
        </header>

        {#if totalCount === 0}
            <div class="mylist-empty">
                <p>まだアニメがありません。<a href="/anime">アニメを探す</a></p>
            </div>
        {:else}
            {#each statusOrder as status}
                {#if grouped[status].length > 0}
                    <section class="status-section status-section--{status}">
                        <h2 class="status-heading">
                            <span class="status-icon">{statusIcon[status]}</span>
                            {statusLabel[status]}
                            <span class="status-count">{grouped[status].length}</span>
                        </h2>
                        <div class="anime-list" class:anime-list--edit={viewMode === 'edit'}>
                            {#each grouped[status] as anime (anime.id)}
                                {@const entry = entryStates[anime.id]}

                                {#if viewMode === 'list'}
                                    <!-- 一覧表示 -->
                                    <a href="/anime/{anime.id}" class="anime-card">
                                        <div class="card-cover">
                                            {#if anime.cover_url}
                                                <img src={anime.cover_url} alt={anime.title} />
                                            {:else}
                                                <div class="anime-cover-placeholder">?</div>
                                            {/if}
                                            {#if anime.user_entry?.score !== null && anime.user_entry?.score !== undefined}
                                                <div class="card-score">★ {anime.user_entry.score}</div>
                                            {/if}
                                        </div>
                                        <div class="card-info">
                                            <div class="card-title">{anime.title}</div>
                                            {#if anime.episode_count}
                                                <div class="card-progress">{anime.user_entry?.progress ?? 0}/{anime.episode_count}話</div>
                                            {:else if (anime.user_entry?.progress ?? 0) > 0}
                                                <div class="card-progress">{anime.user_entry?.progress}話</div>
                                            {/if}
                                        </div>
                                    </a>
                                {:else if entry}
                                    <!-- 編集表示 -->
                                    <div class="anime-row-edit">
                                        <a href="/anime/{anime.id}" class="anime-cover edit-cover" tabindex="-1">
                                            {#if anime.cover_url}
                                                <img src={anime.cover_url} alt={anime.title} />
                                            {:else}
                                                <div class="anime-cover-placeholder">?</div>
                                            {/if}
                                        </a>

                                        <form
                                            method="POST"
                                            action="?/upsertWatchlist"
                                            class="edit-form"
                                            use:enhance={() => {
                                                return async () => {
                                                    await invalidateAll();
                                                };
                                            }}
                                        >
                                            <input type="hidden" name="anime_id" value={anime.id} />
                                            <div class="edit-title">{anime.title}</div>
                                            <div class="edit-controls">
                                                <select
                                                    name="status"
                                                    class="edit-select"
                                                    bind:value={entry.status}
                                                    aria-label="ステータス"
                                                >
                                                    {#each statusOrder as s}
                                                        <option value={s}>{statusLabel[s]}</option>
                                                    {/each}
                                                </select>

                                                <div class="progress-group">
                                                    <button
                                                        type="button"
                                                        class="stepper-btn"
                                                        onclick={() => { if (entry.progress > 0) entry.progress -= 1; }}
                                                        aria-label="1話減らす"
                                                    >−</button>
                                                    <input
                                                        type="number"
                                                        name="progress"
                                                        class="edit-number"
                                                        min="0"
                                                        max={anime.episode_count ?? 9999}
                                                        bind:value={entry.progress}
                                                        aria-label="進捗"
                                                    />
                                                    <button
                                                        type="button"
                                                        class="stepper-btn"
                                                        onclick={() => {
                                                            const max = anime.episode_count ?? 9999;
                                                            if (entry.progress < max) entry.progress += 1;
                                                        }}
                                                        aria-label="1話増やす"
                                                    >+</button>
                                                    {#if anime.episode_count}
                                                        <span class="progress-max">/{anime.episode_count}</span>
                                                    {/if}
                                                </div>

                                                <select
                                                    name="score"
                                                    class="edit-select score-select"
                                                    bind:value={entry.score}
                                                    aria-label="スコア"
                                                >
                                                    <option value="">-</option>
                                                    {#each [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as n}
                                                        <option value={n.toString()}>★{n}</option>
                                                    {/each}
                                                </select>

                                                <button type="submit" class="save-btn">保存</button>
                                            </div>
                                        </form>

                                        <form
                                            method="POST"
                                            action="?/removeWatchlist"
                                            use:enhance={() => {
                                                return async () => {
                                                    await invalidateAll();
                                                };
                                            }}
                                        >
                                            <input type="hidden" name="anime_id" value={anime.id} />
                                            <button type="submit" class="remove-btn" aria-label="リストから削除" title="リストから削除">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                            </button>
                                        </form>
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    </section>
                {/if}
            {/each}
        {/if}
    </div>
</div>

<style>
    .mylist-page {
        padding: calc(var(--nav-height) + 24px) 16px 24px;
        min-height: 100vh;
    }

    .mylist-container {
        max-width: 860px;
        margin: 0 auto;
    }

    .mylist-header {
        margin-bottom: 28px;
    }

    .mylist-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;
    }

    .mylist-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--accent, #6366f1);
        margin: 0;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    /* 表示切り替え */
    .view-toggle {
        display: flex;
        background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
        border-radius: 8px;
        padding: 3px;
        gap: 2px;
    }

    .view-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        border: none;
        background: transparent;
        color: var(--fg-muted, #94a3b8);
        transition: background 0.12s, color 0.12s;
    }

    .view-btn.active {
        background: var(--surface, #1e293b);
        color: var(--fg, #e2e8f0);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .view-btn:hover:not(.active) {
        color: var(--fg, #e2e8f0);
    }

    .visibility-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: background 0.15s, color 0.15s;
    }

    .visibility-btn.public {
        background: color-mix(in srgb, var(--accent, #6366f1) 15%, transparent);
        color: var(--accent, #6366f1);
    }

    .visibility-btn.private {
        background: color-mix(in srgb, var(--fg, #e2e8f0) 10%, transparent);
        color: var(--fg-muted, #94a3b8);
    }

    .visibility-btn:hover {
        filter: brightness(1.1);
    }

    .mylist-stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: var(--fg-muted, #94a3b8);
    }

    .stat-total {
        margin-right: 4px;
    }

    .stat-total strong {
        color: var(--fg, #e2e8f0);
    }

    .stat-chip {
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.78rem;
        font-weight: 600;
        background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
        color: var(--fg-muted, #94a3b8);
    }

    .stat-chip--watching { color: #34d399; background: color-mix(in srgb, #34d399 15%, transparent); }
    .stat-chip--completed { color: var(--accent, #6366f1); background: color-mix(in srgb, var(--accent, #6366f1) 15%, transparent); }
    .stat-chip--plan_to_watch { color: #60a5fa; background: color-mix(in srgb, #60a5fa 15%, transparent); }
    .stat-chip--on_hold { color: #fbbf24; background: color-mix(in srgb, #fbbf24 15%, transparent); }
    .stat-chip--dropped { color: #f87171; background: color-mix(in srgb, #f87171 15%, transparent); }

    .mylist-empty {
        text-align: center;
        padding: 60px 0;
        color: var(--fg-muted, #94a3b8);
    }

    .mylist-empty a {
        color: var(--accent, #6366f1);
    }

    .status-section {
        margin-bottom: 32px;
    }

    .status-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.95rem;
        font-weight: 700;
        padding: 8px 0;
        margin: 0 0 8px;
        border-bottom: 1px solid var(--border, #334155);
        color: var(--fg, #e2e8f0);
    }

    .status-section--watching .status-icon { color: #34d399; }
    .status-section--completed .status-icon { color: var(--accent, #6366f1); }
    .status-section--plan_to_watch .status-icon { color: #60a5fa; }
    .status-section--on_hold .status-icon { color: #fbbf24; }
    .status-section--dropped .status-icon { color: #f87171; }

    .status-count {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--fg-muted, #94a3b8);
        font-weight: 400;
    }

    .anime-list {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 12px;
    }

    .anime-list--edit {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    /* ---- 一覧表示（グリッドカード） ---- */
    .anime-card {
        display: flex;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
        text-decoration: none;
        color: inherit;
        background: var(--surface, #1e293b);
        transition: transform 0.12s, box-shadow 0.12s;
    }

    .anime-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    }

    .card-cover {
        position: relative;
        aspect-ratio: 2 / 3;
        background: var(--bg, #0f172a);
        overflow: hidden;
    }

    .card-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .anime-cover-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--fg-muted, #94a3b8);
        font-size: 1.5rem;
    }

    .card-score {
        position: absolute;
        bottom: 5px;
        right: 5px;
        background: rgba(0, 0, 0, 0.72);
        color: #fbbf24;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .card-info {
        padding: 7px 8px 8px;
    }

    .card-title {
        font-size: 0.78rem;
        font-weight: 500;
        color: var(--fg, #e2e8f0);
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.35;
        margin-bottom: 3px;
    }

    .card-progress {
        font-size: 0.7rem;
        color: var(--fg-muted, #94a3b8);
    }

    /* ---- 編集表示 ---- */
    .anime-cover {
        width: 40px;
        height: 56px;
        border-radius: 4px;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--surface, #1e293b);
    }

    .anime-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .anime-row-edit {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--fg, #e2e8f0) 4%, transparent);
        border: 1px solid var(--border, #334155);
        margin-bottom: 4px;
    }

    .edit-cover {
        text-decoration: none;
        flex-shrink: 0;
    }

    .edit-form {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
    }

    .edit-title {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--fg, #e2e8f0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
        max-width: 200px;
    }

    .edit-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        flex-wrap: wrap;
    }

    .edit-select {
        background: var(--surface, #1e293b);
        border: 1px solid var(--border, #334155);
        color: var(--fg, #e2e8f0);
        border-radius: 6px;
        padding: 4px 7px;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .edit-select:focus {
        outline: none;
        border-color: var(--accent, #6366f1);
    }

    .score-select {
        min-width: 70px;
    }

    .progress-group {
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .stepper-btn {
        width: 24px;
        height: 26px;
        border: 1px solid var(--border, #334155);
        background: var(--surface, #1e293b);
        color: var(--fg, #e2e8f0);
        border-radius: 5px;
        font-size: 0.85rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.1s;
    }

    .stepper-btn:hover {
        background: color-mix(in srgb, var(--accent, #6366f1) 20%, transparent);
        border-color: var(--accent, #6366f1);
        color: var(--accent, #6366f1);
    }

    .edit-number {
        width: 46px;
        background: var(--surface, #1e293b);
        border: 1px solid var(--border, #334155);
        color: var(--fg, #e2e8f0);
        border-radius: 6px;
        padding: 4px 5px;
        font-size: 0.8rem;
        text-align: center;
    }

    .edit-number:focus {
        outline: none;
        border-color: var(--accent, #6366f1);
    }

    .progress-max {
        font-size: 0.75rem;
        color: var(--fg-muted, #94a3b8);
        white-space: nowrap;
    }

    .save-btn {
        padding: 4px 14px;
        background: var(--accent, #6366f1);
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.12s;
        white-space: nowrap;
    }

    .save-btn:hover {
        opacity: 0.85;
    }

    .remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: var(--fg-muted, #94a3b8);
        flex-shrink: 0;
        transition: background 0.12s, color 0.12s;
    }

    .remove-btn:hover {
        background: color-mix(in srgb, #f87171 20%, transparent);
        color: #f87171;
    }
</style>
