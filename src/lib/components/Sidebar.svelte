<script lang="ts">
    import type { SupabaseClient, Session } from '@supabase/supabase-js';
    import type { Database } from '$lib/supabase/database.types';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { browser } from '$app/environment';
    import UserAvatar from './UserAvatar.svelte';

    type Profile = Database['public']['Tables']['profiles']['Row'] | null;

    interface Props {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: SupabaseClient<any>;
        session: Session | null;
        profile: Profile;
        unreadNotificationCount?: number;
    }

    let { supabase, session, profile, unreadNotificationCount = 0 }: Props = $props();

    let theme = $state(browser ? (localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme') || 'dark') : 'dark');

    function toggleTheme() {
        theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    const displayName = $derived(
        profile?.display_name || profile?.username || session?.user?.email?.split('@')[0] || ''
    );

    async function handleLogin() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) alert(`ログインエラー: ${error.message}`);
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        goto('/');
    }

    function isActive(path: string): boolean {
        if (path === '/') return page.url.pathname === '/';
        return page.url.pathname.startsWith(path);
    }
</script>

<aside class="icon-sidebar">
    <!-- ロゴ -->
    <a href="/" class="sidebar-logo" aria-label="Anipolis ホーム" title="Anipolis">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span class="sidebar-logo-text">Anipolis</span>
    </a>

    <!-- ナビゲーションアイコン -->
    <nav class="sidebar-nav">
        <!-- ホーム -->
        <a href="/" class="sidebar-btn" class:active={isActive('/')} aria-label="ホーム" title="ホーム">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span class="sidebar-btn-label">ホーム</span>
        </a>

        {#if session}
            <!-- 通知 -->
            <a href="/notifications" class="sidebar-btn" class:active={isActive('/notifications')} aria-label="通知" title="通知">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {#if unreadNotificationCount > 0}
                    <span class="sidebar-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>
                {/if}
                <span class="sidebar-btn-label">通知</span>
            </a>

            <!-- アニメ -->
            <a href="/anime" class="sidebar-btn" class:active={isActive('/anime')} aria-label="アニメ" title="アニメ">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span class="sidebar-btn-label">アニメ</span>
            </a>

            <!-- マイリスト -->
            <a href="/mylist" class="sidebar-btn" class:active={isActive('/mylist')} aria-label="マイリスト" title="マイリスト">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="sidebar-btn-label">マイリスト</span>
            </a>

            <!-- カレンダー -->
            <a href="/calendar" class="sidebar-btn" class:active={isActive('/calendar') || isActive('/events')} aria-label="カレンダー" title="イベントカレンダー">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span class="sidebar-btn-label">カレンダー</span>
            </a>
        {/if}
    </nav>

    <!-- 下部: テーマ・プロフィール・設定・ログアウト -->
    <div class="sidebar-bottom">
        <!-- テーマ切替 -->
        <button class="sidebar-btn" onclick={toggleTheme} aria-label="テーマ切替" title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}>
            {#if theme === 'dark'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
            {:else}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            {/if}
            <span class="sidebar-btn-label">{theme === 'dark' ? 'ライト' : 'ダーク'}</span>
        </button>

        {#if session}
            <!-- プロフィール -->
            {#if profile}
                <a href="/profile/{profile.username}" class="sidebar-btn sidebar-avatar" class:active={isActive('/profile')} aria-label="プロフィール" title="プロフィール">
                    <UserAvatar src={profile?.avatar_url} username={displayName} size="sm" />
                    <span class="sidebar-btn-label">{displayName}</span>
                </a>
            {/if}

            <!-- 設定 -->
            <a href="/settings/profile" class="sidebar-btn" class:active={isActive('/settings')} aria-label="設定" title="プロフィール設定">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span class="sidebar-btn-label">設定</span>
            </a>

            <!-- ログアウト -->
            <button class="sidebar-btn danger" onclick={handleLogout} aria-label="ログアウト" title="ログアウト">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span class="sidebar-btn-label">ログアウト</span>
            </button>
        {:else}
            <!-- ログイン -->
            <button class="sidebar-btn accent" onclick={handleLogin} aria-label="ログイン" title="Googleでログイン">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                <span class="sidebar-btn-label">ログイン</span>
            </button>
        {/if}
    </div>
</aside>
