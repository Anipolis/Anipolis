<script lang="ts">
    import type { PageProps } from './$types';
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import PostCard from '$lib/components/PostCard.svelte';
    import UserAvatar from '$lib/components/UserAvatar.svelte';
    import TrendingPanel from '$lib/components/TrendingPanel.svelte';
    import type { AnimeStatus, Anime } from '$lib/types';

    let { data }: PageProps = $props();

    const { profile, posts, isOwn } = $derived(data);
    const displayName = $derived(profile.display_name ?? profile.username);

    let isFollowing = $state(data.isFollowing);
    let followerCount = $state(data.followCounts.followers);

    $effect(() => {
        isFollowing = data.isFollowing;
        followerCount = data.followCounts.followers;
    });

    const activeTab = $derived((page.url.searchParams.get('tab') ?? 'posts') as 'posts' | 'list');

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

    const animeList = $derived((data.animeList ?? []) as Anime[]);

    const grouped = $derived(
        statusOrder.reduce<Record<AnimeStatus, Anime[]>>(
            (acc, status) => {
                acc[status] = animeList.filter((e) => e.user_entry?.status === status);
                return acc;
            },
            { watching: [], completed: [], plan_to_watch: [], on_hold: [], dropped: [] },
        ),
    );
</script>

<svelte:head>
    <title>{displayName} (@{profile.username}) — Anipolis</title>
</svelte:head>

<div class="page-container">
    <main class="feed-column">
        <div class="profile-header">
            <UserAvatar src={profile.avatar_url} username={profile.username} size="lg" />
            <div class="profile-info">
                <div class="profile-display-name">{displayName}</div>
                <div class="profile-username">@{profile.username}</div>
                {#if profile.bio}
                    <p class="profile-bio">{profile.bio}</p>
                {/if}
                <div class="profile-stats">
                    <span class="profile-stat">
                        <strong>{posts.length}</strong>
                        <span>投稿</span>
                    </span>
                    <span class="profile-stat">
                        <strong>{followerCount}</strong>
                        <span>フォロワー</span>
                    </span>
                    <span class="profile-stat">
                        <strong>{data.followCounts.following}</strong>
                        <span>フォロー中</span>
                    </span>
                    {#if profile.list_is_public || isOwn}
                        <span class="profile-stat">
                            <strong>{animeList.length}</strong>
                            <span>アニメ</span>
                        </span>
                    {/if}
                </div>

                {#if isOwn}
                    <a href="/settings/profile" class="btn btn-outline" style="margin-top: 12px; font-size: 13px;">
                        プロフィールを編集
                    </a>
                {:else if data.user}
                    <form
                        method="POST"
                        action="?/follow"
                        use:enhance={() => {
                            return ({ result }) => {
                                if (result.type === 'success' && result.data) {
                                    const followed = (result.data as { followed: boolean }).followed;
                                    isFollowing = followed;
                                    followerCount += followed ? 1 : -1;
                                }
                            };
                        }}
                        style="margin-top: 12px;"
                    >
                        <input type="hidden" name="target_id" value={profile.id} />
                        <button
                            type="submit"
                            class="btn {isFollowing ? 'btn-outline' : 'btn-primary'}"
                            style="font-size: 13px;"
                        >
                            {isFollowing ? 'フォロー中' : 'フォローする'}
                        </button>
                    </form>
                {/if}
            </div>
        </div>

        <!-- タブ -->
        <div class="profile-tabs">
            <a
                href="/profile/{profile.username}"
                class="profile-tab"
                class:active={activeTab === 'posts'}
            >投稿</a>
            <a
                href="/profile/{profile.username}?tab=list"
                class="profile-tab"
                class:active={activeTab === 'list'}
            >
                マイリスト
                {#if !profile.list_is_public && !isOwn}
                    <span class="tab-lock">🔒</span>
                {/if}
            </a>
        </div>

        <!-- 投稿タブ -->
        {#if activeTab === 'posts'}
            {#if posts.length === 0}
                <div class="empty-state">
                    <p>まだ投稿がありません</p>
                </div>
            {:else}
                {#each posts as post (post.id)}
                    <PostCard {post} currentUserId={data.user?.id ?? null} />
                {/each}
            {/if}
        {/if}

        <!-- マイリストタブ -->
        {#if activeTab === 'list'}
            {#if !profile.list_is_public && !isOwn}
                <div class="empty-state list-private">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-bottom:12px; color: var(--fg-muted)">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <p>このユーザーのマイリストは非公開です</p>
                </div>
            {:else if animeList.length === 0}
                <div class="empty-state">
                    <p>まだアニメがありません</p>
                </div>
            {:else}
                <div class="list-summary">
                    <span class="list-total">合計 <strong>{animeList.length}</strong> 作品</span>
                    {#if isOwn}
                        <a href="/mylist" class="list-manage-link">リストを管理</a>
                    {/if}
                </div>

                {#each statusOrder as status}
                    {#if grouped[status].length > 0}
                        <section class="status-section status-section--{status}">
                            <h3 class="status-heading">
                                <span class="status-icon">{statusIcon[status]}</span>
                                {statusLabel[status]}
                                <span class="status-count">{grouped[status].length}</span>
                            </h3>
                            <div class="anime-list">
                                {#each grouped[status] as anime (anime.id)}
                                    <a href="/anime/{anime.id}" class="anime-row">
                                        <div class="anime-cover">
                                            {#if anime.cover_url}
                                                <img src={anime.cover_url} alt={anime.title} />
                                            {:else}
                                                <div class="anime-cover-placeholder">?</div>
                                            {/if}
                                        </div>
                                        <div class="anime-info">
                                            <div class="anime-title">{anime.title}</div>
                                            <div class="anime-meta">
                                                {#if anime.episode_count}
                                                    <span class="meta-progress">{anime.user_entry?.progress ?? 0} / {anime.episode_count} 話</span>
                                                {:else if (anime.user_entry?.progress ?? 0) > 0}
                                                    <span class="meta-progress">{anime.user_entry?.progress} 話</span>
                                                {/if}
                                                {#if anime.user_entry?.score !== null && anime.user_entry?.score !== undefined}
                                                    <span class="meta-score">★ {anime.user_entry.score}</span>
                                                {/if}
                                            </div>
                                        </div>
                                        {#if anime.user_entry?.updated_at}
                                            <div class="anime-updated">
                                                {new Date(anime.user_entry.updated_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                                            </div>
                                        {/if}
                                    </a>
                                {/each}
                            </div>
                        </section>
                    {/if}
                {/each}
            {/if}
        {/if}
    </main>

    <aside class="sidebar-column">
        <TrendingPanel trending={data.trending} />
    </aside>
</div>

<style>
    .profile-tabs {
        display: flex;
        border-bottom: 1px solid var(--border, #334155);
        margin: 16px 0 0;
    }

    .profile-tab {
        padding: 10px 20px;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--fg-muted, #94a3b8);
        text-decoration: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: color 0.15s, border-color 0.15s;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .profile-tab:hover {
        color: var(--fg, #e2e8f0);
    }

    .profile-tab.active {
        color: var(--accent, #6366f1);
        border-bottom-color: var(--accent, #6366f1);
        font-weight: 700;
    }

    .tab-lock {
        font-size: 0.75rem;
    }

    .empty-state {
        text-align: center;
        padding: 48px 0;
        color: var(--fg-muted, #94a3b8);
    }

    .list-private {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .list-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 4px;
        font-size: 0.85rem;
        color: var(--fg-muted, #94a3b8);
    }

    .list-summary strong {
        color: var(--fg, #e2e8f0);
    }

    .list-manage-link {
        font-size: 0.8rem;
        color: var(--accent, #6366f1);
        text-decoration: none;
    }

    .list-manage-link:hover {
        text-decoration: underline;
    }

    .status-section {
        margin-bottom: 24px;
    }

    .status-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        font-weight: 700;
        padding: 8px 4px;
        margin: 0 0 4px;
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
        font-size: 0.75rem;
        color: var(--fg-muted, #94a3b8);
        font-weight: 400;
    }

    .anime-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .anime-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 6px;
        text-decoration: none;
        color: inherit;
        transition: background 0.12s;
    }

    .anime-row:hover {
        background: color-mix(in srgb, var(--fg, #e2e8f0) 6%, transparent);
    }

    .anime-cover {
        width: 36px;
        height: 50px;
        border-radius: 3px;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--surface, #1e293b);
    }

    .anime-cover img {
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
    }

    .anime-info {
        flex: 1;
        min-width: 0;
    }

    .anime-title {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--fg, #e2e8f0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 3px;
    }

    .anime-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
    }

    .meta-progress {
        color: var(--fg-muted, #94a3b8);
    }

    .meta-score {
        color: #fbbf24;
        font-weight: 600;
    }

    .anime-updated {
        font-size: 0.72rem;
        color: var(--fg-muted, #94a3b8);
        flex-shrink: 0;
        white-space: nowrap;
    }
</style>
