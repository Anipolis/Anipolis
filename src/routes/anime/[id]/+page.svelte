<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageProps } from './$types';
    import type { AnimeStatus } from '$lib/types';

    let { data, form }: PageProps = $props();

    const statusOptions: { value: AnimeStatus; label: string }[] = [
        { value: 'watching',      label: '視聴中' },
        { value: 'completed',     label: '完了' },
        { value: 'plan_to_watch', label: '視聴予定' },
        { value: 'on_hold',       label: '一時停止' },
        { value: 'dropped',       label: '断念' },
    ];

    const broadcastLabels: Record<string, string> = {
        airing:   '放送中',
        upcoming: '放送予定',
        finished: '放送終了',
    };

    let selectedStatus = $state<AnimeStatus>('plan_to_watch');
    let score = $state<string>('');
    let progress = $state<string>('0');

    $effect(() => {
        selectedStatus = data.anime.user_entry?.status ?? 'plan_to_watch';
        score = data.anime.user_entry?.score != null ? String(data.anime.user_entry.score) : '';
        progress = String(data.anime.user_entry?.progress ?? 0);
    });

    let coverUrl = $state(data.anime.cover_url ?? '');

    function getCoverUrl(url: string, width: number): string {
        if (!url) return '';
        const height = Math.round(width * 3 / 2);
        return url.replace('/object/public/', '/render/image/public/') + `?width=${width}&height=${height}&resize=cover&quality=85&format=webp`;
    }

    async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const ratio = Math.min(maxWidth / img.width, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * ratio);
                canvas.height = Math.round(img.height * ratio);
                canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95);
            };
            img.src = url;
        });
    }
    let coverUploading = $state(false);
    let coverError = $state('');

    async function uploadCover(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        coverUploading = true;
        coverError = '';
        const resized = await resizeImage(file, 2000);
        const form = new FormData();
        form.append('file', resized, file.name.replace(/\.[^.]+$/, '.jpg'));
        form.append('anime_id', String(data.anime.id));

        const res = await fetch('/api/upload/anime-cover', { method: 'POST', body: form });
        if (res.ok) {
            const json = await res.json();
            coverUrl = json.url;
        } else {
            const json = await res.json().catch(() => ({}));
            coverError = json.message ?? 'アップロードに失敗しました';
        }
        coverUploading = false;
        input.value = '';
    }
</script>

<svelte:head>
    <title>{data.anime.title} — Anipolis</title>
</svelte:head>

<div class="detail-page">
    <a href="/anime" class="back-link">← アニメ一覧</a>

    <div class="anime-layout">
        <!-- Left: Cover + production info -->
        <aside class="left-panel">
            <div class="anime-cover">
                {#if coverUrl}
                    <img src={getCoverUrl(coverUrl, 400)} alt={data.anime.title} />
                {:else}
                    <div class="anime-cover-placeholder">
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                            <rect x="2" y="2" width="20" height="20" rx="2"/>
                            <path d="M10 8l6 4-6 4V8z"/>
                        </svg>
                    </div>
                {/if}
                {#if data.isAdmin}
                    <label class="cover-upload-btn" title="カバー画像を変更" class:uploading={coverUploading}>
                        {#if coverUploading}
                            <span>...</span>
                        {:else}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                        {/if}
                        <input type="file" accept="image/jpeg,image/png,image/webp" onchange={uploadCover} disabled={coverUploading} />
                    </label>
                {/if}
            </div>
            {#if coverError}
                <p class="cover-error">{coverError}</p>
            {/if}

            <!-- Production info below cover -->
            {#if data.anime.studio || data.anime.producer || data.anime.source || data.anime.genre?.length || data.anime.official_site_url || data.anime.official_x_url || data.anime.copyright}
                <dl class="prod-info">
                    {#if data.anime.studio}
                        <div class="prod-row">
                            <dt>スタジオ</dt>
                            <dd><a href="/anime?studio={encodeURIComponent(data.anime.studio)}" class="filter-link">{data.anime.studio}</a></dd>
                        </div>
                    {/if}
                    {#if data.anime.producer}
                        <div class="prod-row">
                            <dt>制作</dt>
                            <dd><a href="/anime?producer={encodeURIComponent(data.anime.producer)}" class="filter-link">{data.anime.producer}</a></dd>
                        </div>
                    {/if}
                    {#if data.anime.source}
                        <div class="prod-row">
                            <dt>原作</dt>
                            <dd>{data.anime.source}</dd>
                        </div>
                    {/if}
                    {#if data.anime.genre?.length}
                        <div class="prod-row prod-row--wrap">
                            <dt>ジャンル</dt>
                            <dd class="genre-list">
                                {#each data.anime.genre as g}
                                    <a href="/anime?genre={encodeURIComponent(g)}" class="genre-chip">{g}</a>
                                {/each}
                            </dd>
                        </div>
                    {/if}
                    {#if data.anime.official_site_url || data.anime.official_x_url}
                        <div class="prod-row prod-row--wrap">
                            <dt>公式</dt>
                            <dd class="links-list">
                                {#if data.anime.official_site_url}
                                    <a href={data.anime.official_site_url} target="_blank" rel="noopener noreferrer" class="official-link">公式サイト</a>
                                {/if}
                                {#if data.anime.official_x_url}
                                    <a href={data.anime.official_x_url} target="_blank" rel="noopener noreferrer" class="official-link">X (Twitter)</a>
                                {/if}
                            </dd>
                        </div>
                    {/if}
                    {#if data.anime.copyright}
                        <div class="prod-row">
                            <dt>©</dt>
                            <dd class="copyright">{data.anime.copyright}</dd>
                        </div>
                    {/if}
                </dl>
            {/if}
        </aside>

        <!-- Main: title, score, synopsis, watchlist -->
        <div class="main-content">
            <div class="title-block">
                <h1 class="anime-title">{data.anime.title}</h1>
                {#if data.anime.title_en}
                    <p class="anime-title-en">{data.anime.title_en}</p>
                {/if}
                <div class="meta-row">
                    {#if data.anime.status}
                        <span class="status-badge status-{data.anime.status}">
                            {broadcastLabels[data.anime.status] ?? data.anime.status}
                        </span>
                    {/if}
                    {#if data.anime.type}
                        <span class="meta-chip">{data.anime.type}</span>
                    {/if}
                    {#if data.anime.season}
                        <a href="/anime?season={encodeURIComponent(data.anime.season)}" class="meta-chip meta-chip--link">{data.anime.season}</a>
                    {/if}
                    {#if data.anime.episode_count}
                        <span class="meta-chip">{data.anime.episode_count}話</span>
                    {/if}
                    {#if data.anime.aired_from}
                        <span class="meta-chip aired">
                            {data.anime.aired_from.slice(0, 10)}{data.anime.aired_to ? ' 〜 ' + data.anime.aired_to.slice(0, 10) : ''}
                        </span>
                    {/if}
                </div>
            </div>

            <!-- Score hero -->
            <div class="stats-grid">
                {#if data.anime.avg_score != null}
                    <div class="stat-card stat-card--score">
                        <span class="stat-card-label">スコア</span>
                        <span class="stat-card-value">★ {data.anime.avg_score.toFixed(2)}</span>
                        {#if data.anime.score_count}
                            <span class="stat-card-sub">{data.anime.score_count}件の評価</span>
                        {/if}
                    </div>
                {/if}
                {#if data.anime.list_count}
                    <div class="stat-card">
                        <span class="stat-card-label">リスト登録</span>
                        <span class="stat-card-value">{data.anime.list_count}</span>
                        <span class="stat-card-sub">ユーザー</span>
                    </div>
                {/if}
            </div>

            <!-- Synopsis -->
            {#if data.anime.synopsis}
                <section class="synopsis">
                    <h2>あらすじ</h2>
                    <p>{data.anime.synopsis}</p>
                </section>
            {/if}

            <!-- Watchlist -->
            {#if data.user}
                <section class="watchlist-section">
                    <h2>マイリスト</h2>

                    {#if form?.message}
                        <p class="form-error">{form.message}</p>
                    {/if}

                    <form method="POST" action="?/upsertWatchlist" use:enhance>
                        <input type="hidden" name="anime_id" value={data.anime.id} />

                        <div class="form-row">
                            <label class="form-label">
                                ステータス
                                <select name="status" bind:value={selectedStatus} class="form-select">
                                    {#each statusOptions as opt}
                                        <option value={opt.value}>{opt.label}</option>
                                    {/each}
                                </select>
                            </label>

                            <label class="form-label">
                                スコア (1〜10)
                                <input
                                    type="number"
                                    name="score"
                                    min="1" max="10" step="0.5"
                                    bind:value={score}
                                    placeholder="未評価"
                                    class="form-input"
                                />
                            </label>

                            {#if data.anime.episode_count}
                                <label class="form-label">
                                    進捗 ({data.anime.episode_count}話中)
                                    <input
                                        type="number"
                                        name="progress"
                                        min="0" max={data.anime.episode_count}
                                        bind:value={progress}
                                        class="form-input"
                                    />
                                </label>
                            {:else}
                                <input type="hidden" name="progress" value={progress} />
                            {/if}
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn-primary {data.anime.user_entry ? 'btn-primary--update' : 'btn-primary--add'}">
                                {#if data.anime.user_entry}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                    更新
                                {:else}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    マイリストに追加
                                {/if}
                            </button>

                            {#if data.anime.user_entry}
                                <button
                                    type="submit"
                                    formaction="?/removeWatchlist"
                                    class="btn-danger"
                                    onclick={(e) => {
                                        if (!confirm('マイリストから削除しますか？')) e.preventDefault();
                                    }}
                                >削除</button>
                            {/if}
                        </div>
                    </form>
                </section>
            {:else}
                <section class="watchlist-section watchlist-section--guest">
                    <p class="login-prompt">
                        <a href="/" class="login-prompt-link">ログイン</a>してマイリストに追加
                    </p>
                </section>
            {/if}
        </div>
    </div>
</div>

<style>
    .detail-page {
        padding-top: calc(var(--nav-height) + 24px);
        padding-bottom: 48px;
        padding-left: 24px;
        padding-right: 24px;
        max-width: 1100px;
        margin: 0 auto;
    }

    .back-link {
        display: inline-block;
        margin-bottom: 20px;
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.9rem;
    }
    .back-link:hover { color: var(--text); }

    /* Two-column layout */
    .anime-layout {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 32px;
        align-items: flex-start;
    }

    /* ── Left panel ── */
    .left-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .anime-cover {
        width: 100%;
        aspect-ratio: 2/3;
        border-radius: 10px;
        overflow: hidden;
        background: var(--card-bg);
        border: 1px solid var(--border);
        position: relative;
    }
    .anime-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
        -webkit-backface-visibility: hidden;
        backface-visibility: hidden;
    }
    .anime-cover-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        background: var(--hover-bg);
    }

    .cover-upload-btn {
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(0,0,0,0.65);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
    }
    .cover-upload-btn input { display: none; }
    .cover-upload-btn.uploading { opacity: 1; cursor: wait; }
    .anime-cover:hover .cover-upload-btn { opacity: 1; }
    .cover-error { font-size: 0.78rem; color: var(--danger, #ef4444); margin: 0; }

    /* Production info */
    .prod-info {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 0;
        padding: 14px;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
    }
    .prod-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.8rem;
    }
    .prod-row dt {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .prod-row dd { margin: 0; color: var(--text); line-height: 1.4; }
    .genre-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .genre-chip {
        font-size: 0.72rem;
        padding: 2px 7px;
        border-radius: 10px;
        background: var(--hover-bg);
        color: var(--text-muted);
        border: 1px solid var(--border);
        text-decoration: none;
        transition: background 0.15s, color 0.15s;
    }
    .genre-chip:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
    .links-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .official-link {
        font-size: 0.78rem;
        color: var(--accent);
        text-decoration: none;
        padding: 2px 8px;
        border: 1px solid var(--accent);
        border-radius: 4px;
    }
    .official-link:hover { background: var(--accent); color: #fff; }
    .copyright { font-size: 0.72rem; color: var(--text-muted); }
    .filter-link {
        color: var(--accent);
        text-decoration: none;
        font-size: inherit;
    }
    .filter-link:hover { text-decoration: underline; }

    /* ── Main content ── */
    .main-content {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .title-block { display: flex; flex-direction: column; gap: 10px; }
    .anime-title { font-size: 1.6rem; font-weight: 700; margin: 0; line-height: 1.3; }
    .anime-title-en { font-size: 0.88rem; color: var(--text-muted); margin: 0; }

    .meta-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .status-badge {
        font-size: 0.75rem;
        padding: 3px 10px;
        border-radius: 4px;
        font-weight: 600;
    }
    .status-airing { background: #16a34a22; color: #16a34a; }
    .status-upcoming { background: #2563eb22; color: #2563eb; }
    .status-finished { background: var(--hover-bg); color: var(--text-muted); }
    .meta-chip {
        font-size: 0.78rem;
        padding: 3px 9px;
        border-radius: 4px;
        background: var(--hover-bg);
        color: var(--text-muted);
    }
    .meta-chip.aired { font-size: 0.75rem; }
    .meta-chip--link {
        text-decoration: none;
        transition: background 0.15s, color 0.15s;
    }
    .meta-chip--link:hover { background: var(--accent); color: #fff; }

    /* Stats cards */
    .stats-grid {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }
    .stat-card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px 24px;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 10px;
        min-width: 120px;
    }
    .stat-card-label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
    }
    .stat-card-value {
        font-size: 1.8rem;
        font-weight: 700;
        line-height: 1;
    }
    .stat-card--score .stat-card-value { color: #f59e0b; }
    .stat-card-sub { font-size: 0.75rem; color: var(--text-muted); }

    /* Synopsis */
    .synopsis h2 { font-size: 1rem; font-weight: 600; margin: 0 0 8px; }
    .synopsis p { font-size: 0.9rem; line-height: 1.7; color: var(--text-secondary, var(--text)); margin: 0; }

    /* Watchlist */
    .watchlist-section {
        border: 1px solid var(--accent, #6366f1);
        border-radius: 12px;
        padding: 20px;
        background: var(--card-bg);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #6366f1) 12%, transparent);
    }
    .watchlist-section h2 {
        font-size: 1rem;
        font-weight: 700;
        margin: 0 0 14px;
        color: var(--accent, #6366f1);
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .watchlist-section h2::before {
        content: '★';
        font-size: 0.9rem;
    }

    .form-row { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
    .form-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.82rem;
        color: var(--text-muted);
        font-weight: 500;
    }
    .form-select, .form-input {
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
        font-size: 0.9rem;
        min-width: 130px;
    }
    .form-input[type="number"] { width: 100px; }

    .form-actions { display: flex; gap: 10px; align-items: center; margin-top: 4px; }
    .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 11px 24px;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        border: none;
        font-weight: 700;
        cursor: pointer;
        font-size: 1rem;
        letter-spacing: 0.01em;
        transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--accent, #6366f1) 40%, transparent);
    }
    .btn-primary--add {
        background: var(--accent);
        min-width: 170px;
        justify-content: center;
    }
    .btn-primary--update {
        background: color-mix(in srgb, var(--accent, #6366f1) 75%, #000);
    }
    .btn-primary:hover {
        opacity: 0.92;
        transform: translateY(-1px);
        box-shadow: 0 4px 14px color-mix(in srgb, var(--accent, #6366f1) 50%, transparent);
    }
    .btn-primary:active { transform: translateY(0); }
    .btn-danger {
        padding: 8px 18px;
        border-radius: 6px;
        background: transparent;
        color: var(--danger, #ef4444);
        border: 1px solid var(--danger, #ef4444);
        font-weight: 600;
        cursor: pointer;
        font-size: 0.9rem;
    }
    .btn-danger:hover { background: #ef444422; }

    .form-error { color: var(--danger, #ef4444); font-size: 0.85rem; margin-bottom: 10px; }
    .watchlist-section--guest { border-color: var(--border); box-shadow: none; }
    .login-prompt { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
    .login-prompt-link {
        color: #fff;
        background: var(--accent);
        padding: 2px 10px;
        border-radius: 5px;
        font-weight: 600;
        text-decoration: none;
        margin-right: 4px;
    }
    .login-prompt-link:hover { opacity: 0.85; }

    /* Responsive */
    @media (max-width: 700px) {
        .anime-layout {
            grid-template-columns: 1fr;
        }
        .anime-cover {
            max-width: 200px;
        }
        .detail-page {
            padding-left: 14px;
            padding-right: 14px;
        }
    }
</style>
