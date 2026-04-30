<script lang="ts">
    import type { PageProps } from './$types';
    import type { Anime, AnimeStatus } from '$lib/types';
    import { enhance } from '$app/forms';

    let { data, form }: PageProps = $props();

    // ── 登録フォーム用ステート ──
    const GENRES = ['アクション','アドベンチャー','コメディ','ドラマ','ファンタジー','ホラー',
        'ミステリー','ロマンス','SF','スポーツ','日常','魔法少女','メカ','音楽','学園',
        '歴史','異世界','ハーレム','百合','心理'];

    let selectedGenres = $state<string[]>([]);
    let studios       = $state<string[]>([]);
    let producers     = $state<string[]>([]);
    let hashtags      = $state<string[]>([]);

    let studioInput   = $state('');
    let producerInput = $state('');
    let hashtagInput  = $state('');

    function toggleGenre(g: string) {
        selectedGenres = selectedGenres.includes(g)
            ? selectedGenres.filter(x => x !== g)
            : [...selectedGenres, g];
    }
    function addTag(list: string[], input: string, setter: (v: string[]) => void, clearFn: () => void) {
        const val = input.trim().replace(/^#/, '');
        if (val && !list.includes(val)) setter([...list, val]);
        clearFn();
    }
    function removeTag(list: string[], val: string, setter: (v: string[]) => void) {
        setter(list.filter(x => x !== val));
    }

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
            {#if data.user}
                <a href="/anime?tab=register" class="tab-btn tab-btn--add" class:active={data.tab === 'register'}>＋登録</a>
            {/if}
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

        {#if data.tab === 'register'}
            <div class="register-section">
                <h2 class="register-title">アニメ登録</h2>

                {#if form?.success}
                    <div class="form-success">
                        登録しました！ <a href="/anime/{form.animeId}">詳細を見る →</a>
                    </div>
                {/if}
                {#if form?.message}
                    <div class="form-error">{form.message}</div>
                {/if}

                <form method="POST" action="?/registerAnime" use:enhance class="register-form">
                    <!-- タイトル -->
                    <div class="form-row">
                        <div class="form-group form-group--wide">
                            <label for="rf-title">タイトル <span class="required">*</span></label>
                            <input id="rf-title" name="title" type="text" required class="rf-input" />
                        </div>
                        <div class="form-group form-group--wide">
                            <label for="rf-title-en">英語タイトル</label>
                            <input id="rf-title-en" name="title_en" type="text" class="rf-input" />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group--wide">
                            <label for="rf-romaji">ローマ字タイトル</label>
                            <input id="rf-romaji" name="title_romaji" type="text" class="rf-input" />
                        </div>
                        <div class="form-group">
                            <label for="rf-season">シーズン（例: 2025春）</label>
                            <input id="rf-season" name="season" type="text" placeholder="2025春" class="rf-input" />
                        </div>
                        <div class="form-group form-group--narrow">
                            <label for="rf-ep">話数</label>
                            <input id="rf-ep" name="episode_count" type="number" min="1" class="rf-input" />
                        </div>
                    </div>

                    <!-- あらすじ -->
                    <div class="form-group">
                        <label for="rf-synopsis">あらすじ</label>
                        <textarea id="rf-synopsis" name="synopsis" rows="4" class="rf-textarea"></textarea>
                    </div>

                    <!-- ステータス・タイプ -->
                    <div class="form-row">
                        <div class="form-group">
                            <label for="rf-status">ステータス</label>
                            <select id="rf-status" name="status" class="rf-select">
                                <option value="">未設定</option>
                                <option value="airing">放送中</option>
                                <option value="upcoming">放送予定</option>
                                <option value="finished">放送終了</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="rf-type">タイプ</label>
                            <select id="rf-type" name="type" class="rf-select">
                                <option value="">未設定</option>
                                <option value="TV">TV</option>
                                <option value="映画">映画</option>
                                <option value="OVA">OVA</option>
                                <option value="ONA">ONA</option>
                                <option value="特別">特別</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="rf-source">原作</label>
                            <select id="rf-source" name="source" class="rf-select">
                                <option value="">未設定</option>
                                <option value="漫画">漫画</option>
                                <option value="ライトノベル">ライトノベル</option>
                                <option value="小説">小説</option>
                                <option value="ゲーム">ゲーム</option>
                                <option value="オリジナル">オリジナル</option>
                                <option value="その他">その他</option>
                            </select>
                        </div>
                    </div>

                    <!-- 放送期間 -->
                    <div class="form-row">
                        <div class="form-group">
                            <label for="rf-aired-from">放送開始</label>
                            <input id="rf-aired-from" name="aired_from" type="date" class="rf-input" />
                        </div>
                        <div class="form-group">
                            <label for="rf-aired-to">放送終了</label>
                            <input id="rf-aired-to" name="aired_to" type="date" class="rf-input" />
                        </div>
                    </div>

                    <!-- ジャンル -->
                    <div class="form-group">
                        <span class="field-label">ジャンル</span>
                        <div class="tag-picker">
                            {#each GENRES as g}
                                <button type="button" class="tag-btn" class:selected={selectedGenres.includes(g)} onclick={() => toggleGenre(g)}>{g}</button>
                            {/each}
                        </div>
                        {#each selectedGenres as g}
                            <input type="hidden" name="genre" value={g} />
                        {/each}
                    </div>

                    <!-- スタジオ -->
                    <div class="form-group">
                        <span class="field-label">スタジオ</span>
                        <div class="tag-input-row">
                            <input type="text" class="rf-input" placeholder="スタジオ名を入力"
                                bind:value={studioInput}
                                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(studios, studioInput, v => studios = v, () => studioInput = ''); } }} />
                            <button type="button" class="tag-add-btn" onclick={() => addTag(studios, studioInput, v => studios = v, () => studioInput = '')}>追加</button>
                        </div>
                        <div class="tag-chips">
                            {#each studios as s}
                                <span class="tag-chip">{s}<button type="button" class="chip-remove" onclick={() => removeTag(studios, s, v => studios = v)}>✕</button></span>
                                <input type="hidden" name="studio" value={s} />
                            {/each}
                        </div>
                    </div>

                    <!-- プロデューサー -->
                    <div class="form-group">
                        <span class="field-label">プロデューサー / 制作</span>
                        <div class="tag-input-row">
                            <input type="text" class="rf-input" placeholder="プロデューサー名を入力"
                                bind:value={producerInput}
                                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(producers, producerInput, v => producers = v, () => producerInput = ''); } }} />
                            <button type="button" class="tag-add-btn" onclick={() => addTag(producers, producerInput, v => producers = v, () => producerInput = '')}>追加</button>
                        </div>
                        <div class="tag-chips">
                            {#each producers as p}
                                <span class="tag-chip">{p}<button type="button" class="chip-remove" onclick={() => removeTag(producers, p, v => producers = v)}>✕</button></span>
                                <input type="hidden" name="producer" value={p} />
                            {/each}
                        </div>
                    </div>

                    <!-- 公式ハッシュタグ -->
                    <div class="form-group">
                        <span class="field-label">公式ハッシュタグ</span>
                        <div class="tag-input-row">
                            <input type="text" class="rf-input" placeholder="#アニメタグ"
                                bind:value={hashtagInput}
                                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(hashtags, hashtagInput, v => hashtags = v, () => hashtagInput = ''); } }} />
                            <button type="button" class="tag-add-btn" onclick={() => addTag(hashtags, hashtagInput, v => hashtags = v, () => hashtagInput = '')}>追加</button>
                        </div>
                        <div class="tag-chips">
                            {#each hashtags as h}
                                <span class="tag-chip">#{h}<button type="button" class="chip-remove" onclick={() => removeTag(hashtags, h, v => hashtags = v)}>✕</button></span>
                                <input type="hidden" name="official_hashtag" value={h} />
                            {/each}
                        </div>
                    </div>

                    <!-- 公式リンク -->
                    <div class="form-row">
                        <div class="form-group form-group--wide">
                            <label for="rf-site">公式サイト URL</label>
                            <input id="rf-site" name="official_site_url" type="url" class="rf-input" placeholder="https://..." />
                        </div>
                        <div class="form-group form-group--wide">
                            <label for="rf-x">公式 X (Twitter) URL</label>
                            <input id="rf-x" name="official_x_url" type="url" class="rf-input" placeholder="https://x.com/..." />
                        </div>
                    </div>

                    <!-- 権利表記・カバー -->
                    <div class="form-row">
                        <div class="form-group form-group--wide">
                            <label for="rf-copyright">権利表記</label>
                            <input id="rf-copyright" name="copyright" type="text" class="rf-input" />
                        </div>
                        <div class="form-group form-group--wide">
                            <label for="rf-cover">カバー画像 URL</label>
                            <input id="rf-cover" name="cover_url" type="url" class="rf-input" placeholder="https://..." />
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="submit-btn">登録する</button>
                        <a href="/anime" class="cancel-link">キャンセル</a>
                    </div>
                </form>
            </div>
        {:else if data.tab === 'mylist' && !data.user}
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

    /* ─── 登録タブ ─── */
    .tab-btn--add { color: var(--accent); font-weight: 600; }
    .tab-btn--add.active { background: var(--accent); color: #fff; }

    /* ─── 登録フォーム ─── */
    .register-section {
        max-width: 760px;
    }
    .register-title {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 20px;
        color: var(--text);
    }
    .form-success {
        padding: 12px 16px;
        border-radius: 8px;
        background: #16a34a18;
        color: #16a34a;
        margin-bottom: 16px;
        font-size: 0.9rem;
    }
    .form-success a { color: #16a34a; font-weight: 600; }
    .form-error {
        padding: 12px 16px;
        border-radius: 8px;
        background: #dc262618;
        color: #dc2626;
        margin-bottom: 16px;
        font-size: 0.9rem;
    }
    .register-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
        flex: 1 1 180px;
    }
    .form-group--wide  { flex: 2 1 240px; }
    .form-group--narrow { flex: 0 1 100px; }
    .form-group label, .field-label {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--text-muted);
    }
    .required { color: #dc2626; }
    .rf-input, .rf-textarea, .rf-select {
        padding: 8px 10px;
        border-radius: 7px;
        border: 1px solid var(--border);
        background: var(--card-bg);
        color: var(--text);
        font-size: 0.88rem;
        outline: none;
        transition: border-color 0.15s;
        width: 100%;
        box-sizing: border-box;
    }
    .rf-input:focus, .rf-textarea:focus, .rf-select:focus { border-color: var(--accent); }
    .rf-textarea { resize: vertical; }

    /* ─── ジャンル選択 ─── */
    .tag-picker {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .tag-btn {
        padding: 4px 10px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text-muted);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.12s;
    }
    .tag-btn:hover { background: var(--hover-bg); color: var(--text); }
    .tag-btn.selected { background: var(--accent); color: #fff; border-color: var(--accent); }

    /* ─── タグ入力 ─── */
    .tag-input-row {
        display: flex;
        gap: 6px;
    }
    .tag-input-row .rf-input { flex: 1; }
    .tag-add-btn {
        padding: 8px 14px;
        border-radius: 7px;
        border: 1px solid var(--border);
        background: var(--hover-bg);
        color: var(--text);
        font-size: 0.82rem;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s;
    }
    .tag-add-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
    .tag-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
    }
    .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 14px;
        background: var(--accent);
        color: #fff;
        font-size: 0.8rem;
    }
    .chip-remove {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        font-size: 0.75rem;
        line-height: 1;
        opacity: 0.7;
    }
    .chip-remove:hover { opacity: 1; }

    /* ─── 送信ボタン ─── */
    .form-actions {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 8px;
    }
    .submit-btn {
        padding: 10px 28px;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        border: none;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s;
    }
    .submit-btn:hover { opacity: 0.85; }
    .cancel-link {
        font-size: 0.85rem;
        color: var(--text-muted);
        text-decoration: none;
    }
    .cancel-link:hover { color: var(--text); }
</style>
