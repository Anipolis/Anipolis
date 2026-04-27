<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import type { SubmitFunction } from '@sveltejs/kit';
    import type { Post } from '$lib/types';
    import UserAvatar from './UserAvatar.svelte';
    import { parseContentParts } from '$lib/utils/hashtag';
    import { formatRelativeTime } from '$lib/utils/format';

    interface Props {
        post: Post;
        currentUserId?: string | null;
        /** 投稿詳細ページで使う場合 true にするとカードクリックナビをスキップ */
        isDetailView?: boolean;
    }

    let { post, currentUserId = null, isDetailView = false }: Props = $props();

    const parts = $derived(parseContentParts(post.content));
    const relativeTime = $derived(formatRelativeTime(post.created_at));
    const displayName = $derived(post.display_name || post.username);
    const isOwn = $derived(!!currentUserId && currentUserId === post.user_id);
    const isLoggedIn = $derived(!!currentUserId);

    let deleting = $state(false);
    let lightboxUrl = $state<string | null>(null);

    function openLightbox(event: MouseEvent, url: string) {
        event.preventDefault();
        event.stopPropagation();
        lightboxUrl = url;
    }

    function closeLightbox() {
        lightboxUrl = null;
    }

    function handleLightboxKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') closeLightbox();
    }

    // ── オプティミスティック UI 用ローカル上書き（null = サーバー値を使用）──
    let likeCountLocal = $state<number | null>(null);
    let likedByMeLocal = $state<boolean | null>(null);
    let repostCountLocal = $state<number | null>(null);
    let repostedByMeLocal = $state<boolean | null>(null);

    const likeCount = $derived(likeCountLocal ?? post.like_count);
    const likedByMe = $derived(likedByMeLocal ?? post.liked_by_me);
    const repostCount = $derived(repostCountLocal ?? post.repost_count);
    const repostedByMe = $derived(repostedByMeLocal ?? post.reposted_by_me);

    // カード本体クリック → 投稿詳細へ
    function handleCardClick(event: MouseEvent) {
        if (isDetailView) return;
        if ((event.target as HTMLElement).closest('a, button, form')) return;
        goto(`/posts/${post.id}`);
    }

    const handleDelete: SubmitFunction = ({ cancel }) => {
        if (!confirm('この投稿を削除しますか？')) return cancel();
        deleting = true;
        return async ({ update }) => {
            await update();
            deleting = false;
        };
    };

    const handleLike: SubmitFunction = () => {
        // オプティミスティック更新（代入前に現在値を保存して派生値の即時更新による誤算を防ぐ）
        const wasLiked = likedByMe;
        likedByMeLocal = !wasLiked;
        likeCountLocal = wasLiked ? likeCount - 1 : likeCount + 1;
        return async ({ result, update }) => {
            if (result.type === 'failure') {
                // ロールバック
                likedByMeLocal = null;
                likeCountLocal = null;
            }
            await update({ reset: false });
        };
    };

    const handleRepost: SubmitFunction = () => {
        const wasReposted = repostedByMe;
        repostedByMeLocal = !wasReposted;
        repostCountLocal = wasReposted ? repostCount - 1 : repostCount + 1;
        return async ({ result, update }) => {
            if (result.type === 'failure') {
                repostedByMeLocal = null;
                repostCountLocal = null;
            }
            await update({ reset: false });
        };
    };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<article
    class="post-card"
    class:deleting
    class:post-card-clickable={!isDetailView}
    onclick={handleCardClick}
>
    <a href="/profile/{post.username}" class="post-avatar-link" aria-label={displayName}>
        <UserAvatar src={post.avatar_url} username={post.username} size="md" />
    </a>
    <div class="post-body">
    <div class="post-header">
        <div class="post-meta">
            <a href="/profile/{post.username}" class="post-username">{displayName}</a>
            <div class="post-display-name">@{post.username}</div>
        </div>
        <div class="post-header-right">
            <a href="/posts/{post.id}" class="post-time" title={post.created_at}>
                <time datetime={post.created_at}>{relativeTime}</time>
            </a>
            {#if isOwn}
                <form method="POST" action="?/deletePost" use:enhance={handleDelete}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <button
                        type="submit"
                        class="post-delete-btn"
                        disabled={deleting}
                        aria-label="投稿を削除"
                        title="削除"
                    >
                        ✕
                    </button>
                </form>
            {/if}
        </div>
    </div>

    <p class="post-content">
        {#each parts as part}
            {#if part.type === 'hashtag'}
                <a href="/hashtag/{part.value}" class="hashtag">#{part.value}</a>
            {:else}
                {part.value}
            {/if}
        {/each}
    </p>

    {#if post.image_urls && post.image_urls.length > 0}
        <div class="post-images" class:post-images-single={post.image_urls.length === 1}>
            {#each post.image_urls as url, i}
                <button type="button" class="post-image-link" aria-label="画像 {i + 1} を拡大" onclick={(e) => openLightbox(e, url)}>
                    <img src={url} alt="投稿画像 {i + 1}" class="post-image" loading="lazy" />
                </button>
            {/each}
        </div>
    {/if}

    {#if lightboxUrl}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="lightbox-overlay" onclick={closeLightbox} role="dialog" aria-modal="true" aria-label="画像拡大表示" tabindex="-1">
            <button type="button" class="lightbox-content" onkeydown={handleLightboxKeydown} onclick={(e) => e.stopPropagation()} aria-label="拡大画像">
                <img src={lightboxUrl} alt="拡大画像" class="lightbox-image" />
            </button>
            <button type="button" class="lightbox-close" onclick={closeLightbox} aria-label="閉じる">✕</button>
        </div>
    {/if}

    <div class="post-footer">
        <!-- リプライ -->
        <a href="/posts/{post.id}" class="post-action-btn post-reply-btn" aria-label="返信">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {#if post.reply_count > 0}
                <span>{post.reply_count}</span>
            {/if}
        </a>

        <!-- リポスト -->
        <form method="POST" action="?/repost" use:enhance={handleRepost}>
            <input type="hidden" name="post_id" value={post.id} />
            <button
                type="submit"
                class="post-action-btn post-repost-btn"
                class:active={repostedByMe}
                disabled={!isLoggedIn}
                aria-label={repostedByMe ? 'リポスト取り消し' : 'リポスト'}
                title={repostedByMe ? 'リポスト取り消し' : 'リポスト'}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17 1l4 4-4 4"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <path d="M7 23l-4-4 4-4"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                {#if repostCount > 0}
                    <span>{repostCount}</span>
                {/if}
            </button>
        </form>

        <!-- いいね -->
        <form method="POST" action="?/like" use:enhance={handleLike}>
            <input type="hidden" name="post_id" value={post.id} />
            <button
                type="submit"
                class="post-action-btn post-like-btn"
                class:active={likedByMe}
                disabled={!isLoggedIn}
                aria-label={likedByMe ? 'いいね取り消し' : 'いいね'}
                title={likedByMe ? 'いいね取り消し' : 'いいね'}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill={likedByMe ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                {#if likeCount > 0}
                    <span>{likeCount}</span>
                {/if}
            </button>
        </form>
    </div>
    </div>
</article>
