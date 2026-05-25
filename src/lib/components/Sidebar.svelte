<script lang="ts">
import type { Session } from "@supabase/supabase-js";
import { browser } from "$app/environment";
import { goto, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import type { Database } from "$lib/supabase/database.types";
import type { StoredAccount } from "$lib/types";
import UserAvatar from "./UserAvatar.svelte";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] | null;

interface Props {
	supabase: { auth: { signOut: () => Promise<unknown> } };
	session: Session | null;
	profile: Profile;
	unreadNotificationCount?: number;
	pendingFollowRequestCount?: number;
	sidebarOpen?: boolean;
	extraAccounts?: StoredAccount[];
}

let {
	supabase,
	session,
	profile,
	unreadNotificationCount = 0,
	pendingFollowRequestCount = 0,
	sidebarOpen = true,
	extraAccounts = [],
}: Props = $props();

let theme = $state(
	browser ? localStorage.getItem("theme") || document.documentElement.getAttribute("data-theme") || "dark" : "dark",
);

function toggleTheme() {
	theme = theme === "dark" ? "light" : "dark";
	document.documentElement.setAttribute("data-theme", theme);
	localStorage.setItem("theme", theme);
}

const displayName = $derived(profile?.display_name || profile?.username || session?.user?.email?.split("@")[0] || "");

async function handleLogout() {
	menuOpen = false;
	await supabase.auth.signOut();
	await invalidateAll();
	await goto("/", { invalidateAll: true });
}

let isSwitching = $state(false);
let switchError = $state<string | null>(null);
let menuOpen = $state(false);

async function handleSwitch(userId: string) {
	if (isSwitching) return;
	isSwitching = true;
	switchError = null;
	menuOpen = false;
	try {
		const res = await fetch("/api/account-switch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ userId }),
		});
		if (!res.ok) {
			const text = await res.text();
			switchError = text.includes("REFRESH_EXPIRED")
				? "セッションが切れました。再度追加してください。"
				: "切り替えに失敗しました。";
			return;
		}
		await invalidateAll();
	} catch {
		switchError = "ネットワークエラーが発生しました。";
	} finally {
		isSwitching = false;
	}
}

function isActive(path: string): boolean {
	if (path === "/") return page.url.pathname === "/";
	return page.url.pathname.startsWith(path);
}
</script>

<aside class="icon-sidebar" class:collapsed={!sidebarOpen}>
	<a href="/" class="sidebar-logo" aria-label="Anipolis ホーム" title="Anipolis">
		<svg
			width="28"
			height="28"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<polygon
				points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
			/>
		</svg>
		<span class="sidebar-logo-text">Anipolis</span>
	</a>

	<nav class="sidebar-nav" aria-label="メインナビゲーション">
		<a href="/" class="sidebar-btn" class:active={isActive('/')} aria-label="ホーム" title="ホーム">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			<span class="sidebar-btn-label">ホーム</span>
		</a>

		<a href="/search" class="sidebar-btn" class:active={isActive('/search')} aria-label="検索" title="検索">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<span class="sidebar-btn-label">検索</span>
		</a>

		<a href="/anime" class="sidebar-btn" class:active={isActive('/anime')} aria-label="アニメ" title="アニメ">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polygon
					points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
				/>
			</svg>
			<span class="sidebar-btn-label">アニメ</span>
		</a>

		<a
			href="/schedule"
			class="sidebar-btn"
			class:active={isActive('/schedule') || isActive('/events')}
			aria-label="放送スケジュール"
			title="放送スケジュール"
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
				<path d="M16 2l-4 5-4-5" />
			</svg>
			<span class="sidebar-btn-label">カレンダー</span>
		</a>

		{#if session}
			{#if profile?.is_admin}
				<a href="/admin" class="sidebar-btn" class:active={isActive('/admin')} aria-label="Admin" title="Admin">
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
					</svg>
					<span class="sidebar-btn-label">Admin</span>
				</a>
			{/if}

			<a
				href="/bookmarks"
				class="sidebar-btn"
				class:active={isActive('/bookmarks')}
				aria-label="ブックマーク"
				title="ブックマーク"
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
				</svg>
				<span class="sidebar-btn-label">ブックマーク</span>
			</a>

			<a
				href="/notifications"
				class="sidebar-btn"
				class:active={isActive('/notifications')}
				aria-label="通知"
				title="通知"
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
					<path d="M13.73 21a2 2 0 0 1-3.46 0" />
				</svg>
				{#if unreadNotificationCount > 0}
					<span class="sidebar-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>
				{/if}
				<span class="sidebar-btn-label">通知</span>
			</a>

			<a
				href="/mylist"
				class="sidebar-btn"
				class:active={isActive('/mylist')}
				aria-label="マイリスト"
				title="マイリスト"
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
				</svg>
				<span class="sidebar-btn-label">マイリスト</span>
			</a>

			<a
				href="/exchange"
				class="sidebar-btn"
				class:active={isActive('/exchange')}
				aria-label="トレード"
				title="トレード"
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M7 7h10v10" />
					<path d="M17 7L7 17" />
					<path d="M7 7v4" />
					<path d="M17 17h-4" />
				</svg>
				<span class="sidebar-btn-label">トレード</span>
			</a>

			<a href="/settings" class="sidebar-btn" class:active={isActive('/settings')} aria-label="設定" title="設定">
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="3" />
					<path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
					/>
				</svg>
				<span class="sidebar-btn-label">設定</span>
			</a>
		{/if}
	</nav>

	<div class="sidebar-bottom">
		<button
			type="button"
			class="sidebar-btn"
			onclick={toggleTheme}
			aria-label="テーマ切替"
			title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
		>
			{#if theme === 'dark'}
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="5" />
					<line x1="12" y1="1" x2="12" y2="3" />
					<line x1="12" y1="21" x2="12" y2="23" />
					<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
					<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
					<line x1="1" y1="12" x2="3" y2="12" />
					<line x1="21" y1="12" x2="23" y2="12" />
					<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
					<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
				</svg>
			{:else}
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			{/if}
			<span class="sidebar-btn-label">{theme === 'dark' ? 'ライト' : 'ダーク'}</span>
		</button>

		{#if session}
			{#if switchError}
				<p class="sidebar-switch-error">{switchError}</p>
			{/if}

			<div class="account-menu-wrapper">
				{#if menuOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="account-menu-backdrop" onclick={() => (menuOpen = false)}></div>
					<div class="account-menu" role="menu">
						<!-- 現在ログイン中のアカウント（ハイライト表示） -->
						{#if profile}
							<div class="account-menu-section">
								<div class="account-menu-item account-menu-current" role="menuitem" aria-current="true">
									<UserAvatar src={profile.avatar_url} username={displayName} size="sm" />
									<div class="account-menu-identity">
										<span class="account-menu-display">{displayName}</span>
										<span class="account-menu-username">@{profile.username}</span>
									</div>
									<svg
										class="account-menu-check"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</div>
							</div>
						{/if}

						<!-- 連携アカウント -->
						{#if extraAccounts.length > 0}
							<div class="account-menu-divider"></div>
							<div class="account-menu-section">
								{#each extraAccounts as acct (acct.userId)}
									<button
										type="button"
										class="account-menu-item account-menu-account"
										role="menuitem"
										onclick={() => handleSwitch(acct.userId)}
										disabled={isSwitching}
									>
										<UserAvatar
											src={acct.profile.avatar_url}
											username={acct.profile.display_name ?? acct.profile.username}
											size="sm"
										/>
										<span>{acct.profile.display_name ?? acct.profile.username}</span>
									</button>
								{/each}
							</div>
						{/if}

						<!-- アカウント追加 -->
						{#if extraAccounts.length < 2}
							<div class="account-menu-divider"></div>
							<div class="account-menu-section">
								<a
									href="/auth?mode=add_account"
									class="account-menu-item"
									role="menuitem"
									onclick={() => (menuOpen = false)}
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
										<circle cx="12" cy="7" r="4" />
										<line x1="12" y1="14" x2="12" y2="20" />
										<line x1="9" y1="17" x2="15" y2="17" />
									</svg>
									アカウントを追加
								</a>
							</div>
						{/if}

						<div class="account-menu-divider"></div>

						<!-- プロフィール -->
						<div class="account-menu-section">
							{#if profile}
								<a
									href="/profile/{profile.username}"
									class="account-menu-item"
									role="menuitem"
									onclick={() => (menuOpen = false)}
								>
									プロフィール
								</a>
							{/if}
						</div>

						<div class="account-menu-divider"></div>

						<!-- ログアウト -->
						<div class="account-menu-section">
							<button
								type="button"
								class="account-menu-item account-menu-danger"
								role="menuitem"
								onclick={handleLogout}
							>
								ログアウト
							</button>
						</div>
					</div>
				{/if}

				<button
					type="button"
					class="sidebar-btn sidebar-avatar"
					class:active={menuOpen}
					aria-label="アカウントメニュー"
					aria-haspopup="true"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					<UserAvatar src={profile?.avatar_url} username={displayName} size="sm" />
					<span class="sidebar-btn-label">{displayName}</span>
				</button>
			</div>
		{:else}
			<a href="/auth" class="sidebar-btn accent" aria-label="ログイン" title="ログイン / アカウント作成">
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
					<polyline points="10 17 15 12 10 7" />
					<line x1="15" y1="12" x2="3" y2="12" />
				</svg>
				<span class="sidebar-btn-label">ログイン</span>
			</a>
		{/if}
	</div>
</aside>

<style>
.sidebar-switch-error {
	font-size: 0.78rem;
	color: var(--fg-danger, #e05353);
	padding: 4px 8px;
	margin: 0;
}

.account-menu-wrapper {
	position: relative;
}

.account-menu-backdrop {
	position: fixed;
	inset: 0;
	z-index: 99;
}

.account-menu {
	position: absolute;
	bottom: calc(100% + 8px);
	left: 0;
	z-index: 100;
	min-width: 220px;
	background: var(--surface, #1e293b);
	border: 1px solid var(--border, #334155);
	border-radius: 12px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	overflow: hidden;
}

.account-menu-divider {
	height: 1px;
	background: var(--border, #334155);
	margin: 2px 0;
}

.account-menu-section {
	padding: 4px 0;
}

.account-menu-item {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 10px 16px;
	font-size: 0.9rem;
	color: var(--fg, #f1f5f9);
	background: none;
	border: none;
	cursor: pointer;
	text-decoration: none;
	text-align: left;
	transition: background 0.12s;
}

.account-menu-item:hover {
	background: var(--surface-hover, #263348);
}

.account-menu-current {
	background: var(--surface-active, rgba(99, 102, 241, 0.12));
	cursor: default;
}

.account-menu-current:hover {
	background: var(--surface-active, rgba(99, 102, 241, 0.12));
}

.account-menu-identity {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
}

.account-menu-display {
	font-size: 0.9rem;
	font-weight: 700;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.account-menu-username {
	font-size: 0.8rem;
	color: var(--fg-muted, #64748b);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.account-menu-check {
	flex-shrink: 0;
	color: var(--accent, #6366f1);
}

.account-menu-account {
	gap: 10px;
}

.account-menu-danger {
	color: var(--fg-danger, #e05353);
}
</style>
