<script lang="ts">
    import type { PageProps } from './$types';
    import UserAvatar from '$lib/components/UserAvatar.svelte';
    import { formatRelativeTime } from '$lib/utils/format';

    let { data }: PageProps = $props();

    function notificationLabel(type: string): string {
        if (type === 'like') return 'があなたの投稿にいいねしました';
        if (type === 'repost') return 'があなたの投稿をリポストしました';
        if (type === 'reply') return 'があなたの投稿に返信しました';
        return '';
    }
</script>

<svelte:head>
    <title>通知 — Anipolis</title>
</svelte:head>

<div class="page-container">
    <main class="notifications-column">
        <h1 class="notifications-title">通知</h1>

        {#if data.notifications.length === 0}
            <div class="empty-state">
                <p>通知はありません</p>
            </div>
        {:else}
            <ul class="notification-list">
                {#each data.notifications as notif (notif.id)}
                    <li class="notification-item">
                        <a href="/profile/{notif.actor_username}" class="notification-avatar">
                            <UserAvatar
                                src={notif.actor_avatar_url}
                                username={notif.actor_username}
                                size="md"
                            />
                        </a>
                        <div class="notification-body">
                            <p class="notification-text">
                                <a href="/profile/{notif.actor_username}" class="notification-actor">
                                    {notif.actor_display_name ?? notif.actor_username}
                                </a>
                                {notificationLabel(notif.type)}
                            </p>
                            {#if notif.post_content}
                                <a href="/posts/{notif.post_id}" class="notification-post-preview">
                                    {notif.post_content.length > 80
                                        ? notif.post_content.slice(0, 80) + '…'
                                        : notif.post_content}
                                </a>
                            {/if}
                            <span class="notification-time">{formatRelativeTime(notif.created_at)}</span>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </main>
</div>

<style>
    .notifications-column {
        max-width: 600px;
        margin: 0 auto;
        padding: 0 16px;
    }

    .notifications-title {
        font-size: 20px;
        font-weight: 700;
        padding: 16px 0;
        border-bottom: 1px solid var(--color-border);
        margin: 0 0 8px;
    }

    .notification-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .notification-item {
        display: flex;
        gap: 12px;
        padding: 14px 0;
        border-bottom: 1px solid var(--color-border);
    }

    .notification-avatar {
        flex-shrink: 0;
    }

    .notification-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }

    .notification-text {
        margin: 0;
        font-size: 14px;
        color: var(--color-text);
        line-height: 1.4;
    }

    .notification-actor {
        font-weight: 700;
        color: var(--color-text);
        text-decoration: none;
    }

    .notification-actor:hover {
        text-decoration: underline;
    }

    .notification-post-preview {
        display: block;
        font-size: 13px;
        color: var(--color-text-muted);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .notification-post-preview:hover {
        text-decoration: underline;
    }

    .notification-time {
        font-size: 12px;
        color: var(--color-text-muted);
    }
</style>
