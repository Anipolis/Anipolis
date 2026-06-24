<script lang="ts">
import type { Session } from "@supabase/supabase-js";
import { page } from "$app/state";

interface Props {
	session: Session | null;
	unreadNotificationCount?: number;
}

let { session, unreadNotificationCount = 0 }: Props = $props();

function isActive(path: string): boolean {
	if (path === "/") return page.url.pathname === "/";
	return page.url.pathname.startsWith(path);
}
</script>

<nav class="mobile-bottom-nav" aria-label="モバイルナビゲーション">
	{#if session}
		<a
			href="/"
			class="mobile-tab"
			class:active={isActive('/')}
			aria-label="ホーム"
			aria-current={isActive('/') ? 'page' : undefined}
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
				<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			<span class="mobile-tab-label">ホーム</span>
		</a>

		<a
			href="/search"
			class="mobile-tab"
			class:active={isActive('/search')}
			aria-label="検索"
			aria-current={isActive('/search') ? 'page' : undefined}
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
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<span class="mobile-tab-label">検索</span>
		</a>

		<a
			href="/schedule"
			class="mobile-tab"
			class:active={isActive('/schedule') || isActive('/events')}
			aria-label="カレンダー"
			aria-current={isActive('/schedule') || isActive('/events') ? 'page' : undefined}
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
			<span class="mobile-tab-label">カレンダー</span>
		</a>

		<a
			href="/notifications"
			class="mobile-tab"
			class:active={isActive('/notifications')}
			aria-label="通知"
			aria-current={isActive('/notifications') ? 'page' : undefined}
		>
			<span class="mobile-tab-icon-wrap">
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
					<span class="mobile-tab-badge"
						>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span
					>
				{/if}
			</span>
			<span class="mobile-tab-label">通知</span>
		</a>

		<a
			href="/mylist"
			class="mobile-tab"
			class:active={isActive('/mylist')}
			aria-label="マイリスト"
			aria-current={isActive('/mylist') ? 'page' : undefined}
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
			<span class="mobile-tab-label">マイリスト</span>
		</a>
	{:else}
		<a
			href="/"
			class="mobile-tab"
			class:active={isActive('/')}
			aria-label="ホーム"
			aria-current={isActive('/') ? 'page' : undefined}
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
				<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			<span class="mobile-tab-label">ホーム</span>
		</a>

		<a
			href="/search"
			class="mobile-tab"
			class:active={isActive('/search')}
			aria-label="検索"
			aria-current={isActive('/search') ? 'page' : undefined}
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
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<span class="mobile-tab-label">検索</span>
		</a>

		<a
			href="/schedule"
			class="mobile-tab"
			class:active={isActive('/schedule') || isActive('/events')}
			aria-label="カレンダー"
			aria-current={isActive('/schedule') || isActive('/events') ? 'page' : undefined}
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
			<span class="mobile-tab-label">カレンダー</span>
		</a>

		<a
			href="/anime"
			class="mobile-tab"
			class:active={isActive('/anime')}
			aria-label="アニメ"
			aria-current={isActive('/anime') ? 'page' : undefined}
		>
			<span class="anipolis-logo-icon" aria-hidden="true"></span>
			<span class="mobile-tab-label">アニメ</span>
		</a>

		<a
			href="/auth"
			class="mobile-tab"
			class:active={isActive('/auth')}
			aria-label="ログイン"
			aria-current={isActive('/auth') ? 'page' : undefined}
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
				<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
				<polyline points="10 17 15 12 10 7" />
				<line x1="15" y1="12" x2="3" y2="12" />
			</svg>
			<span class="mobile-tab-label">ログイン</span>
		</a>
	{/if}
</nav>

<style>
.mobile-bottom-nav {
	display: none;
	position: fixed;
	bottom: 0;
	left: 0;
	width: 100vw;
	max-width: 100vw;
	height: 56px;
	padding-bottom: env(safe-area-inset-bottom);
	background: var(--color-bg);
	border-top: 1px solid var(--color-border);
	z-index: 150;
	overflow-x: clip;
}

.mobile-tab {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 3px;
	color: var(--color-text-muted);
	text-decoration: none;
	min-height: 44px;
}

.mobile-tab.active {
	color: var(--color-accent);
}

.mobile-tab-label {
	font-size: 10px;
	line-height: 1;
}

.mobile-tab.active .mobile-tab-label {
	font-weight: 700;
}

.mobile-tab-icon-wrap {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
}

.anipolis-logo-icon {
	display: block;
	width: 22px;
	height: 22px;
	background: center / contain no-repeat var(--anipolis-logo-image);
}

@media (max-width: 960px) {
	.mobile-bottom-nav {
		display: flex;
	}
}

.mobile-tab-badge {
	position: absolute;
	top: -6px;
	right: -10px;
	background: var(--color-danger, #ef4444);
	color: white;
	font-size: 9px;
	font-weight: 700;
	padding: 1px 4px;
	border-radius: 10px;
	line-height: 1.4;
	min-width: 16px;
	text-align: center;
	pointer-events: none;
}
</style>
