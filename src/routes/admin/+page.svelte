<script lang="ts">
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const reasonLabels: Record<string, string> = {
	spam: "スパム",
	harassment: "嫌がらせ",
	sexual: "性的コンテンツ",
	violence: "暴力的コンテンツ",
	illegal: "違法・法令違反行為",
	other: "その他",
};

const dashboard = $derived(data.dashboard);
</script>

<svelte:head> <title>Admin - Anipolis</title> </svelte:head>

<main class="admin-page">
	<header class="admin-header">
		<div>
			<p class="admin-kicker">Operation</p>
			<h1>管理ダッシュボード</h1>
		</div>
	</header>

	{#if dashboard}
		<section class="admin-stats" aria-label="統計情報">
			<div class="admin-stat admin-stat-alert">
				<span>未対応</span>
				<strong>{dashboard.stats.openReports}</strong>
			</div>
			<div class="admin-stat">
				<span>確認中</span>
				<strong>{dashboard.stats.reviewingReports}</strong>
			</div>
			<div class="admin-stat">
				<span>今日の通報</span>
				<strong>{dashboard.stats.reportsToday}</strong>
			</div>
			<div class="admin-stat">
				<span>7日間の通報</span>
				<strong>{dashboard.stats.reportsThisWeek}</strong>
			</div>
			<div class="admin-stat">
				<span>今日の投稿</span>
				<strong>{dashboard.stats.postsToday}</strong>
			</div>
			<div class="admin-stat">
				<span>今日の新規ユーザー</span>
				<strong>{dashboard.stats.usersToday}</strong>
			</div>
			<div class="admin-stat">
				<span>総投稿数</span>
				<strong>{dashboard.stats.totalPosts}</strong>
			</div>
			<div class="admin-stat">
				<span>総ユーザー数</span>
				<strong>{dashboard.stats.totalUsers}</strong>
			</div>
			<div class="admin-stat">
				<span>制限中</span>
				<strong>{dashboard.stats.restrictedUsers}</strong>
			</div>
			<div class="admin-stat admin-stat-alert">
				<span>BAN中</span>
				<strong>{dashboard.stats.bannedUsers}</strong>
			</div>
		</section>

		<section class="admin-section">
			<div class="admin-section-header">
				<h2>通報理由 7日間</h2>
			</div>
			{#if dashboard.reasonCounts.length === 0}
				<p class="admin-empty">直近7日間の通報はありません。</p>
			{:else}
				<div class="reason-list">
					{#each dashboard.reasonCounts as item}
						<div class="reason-row">
							<span>{reasonLabels[item.reason]}</span>
							<strong>{item.count}</strong>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<div class="nav-links">
		<a href="/admin/reports/posts" class="nav-link">
			<div class="nav-link-body">
				<span class="nav-link-label">投稿通報</span>
				<span class="nav-link-sub">通報された投稿の一覧・対応</span>
			</div>
			<span class="nav-link-arrow">→</span>
		</a>
		<a href="/admin/reports/accounts" class="nav-link">
			<div class="nav-link-body">
				<span class="nav-link-label">アカウント通報</span>
				<span class="nav-link-sub">通報されたアカウントの一覧・対応</span>
			</div>
			<span class="nav-link-arrow">→</span>
		</a>
		<a href="/admin/room-experiments" class="nav-link">
			<div class="nav-link-body">
				<span class="nav-link-label">放送回ルーム検証</span>
				<span class="nav-link-sub">対象作品の入室・滞在・投稿KPIを確認</span>
			</div>
			<span class="nav-link-arrow">→</span>
		</a>
	</div>
</main>

<style>
.admin-page {
	width: min(1040px, calc(100% - 32px));
	margin: 0 auto;
	padding: calc(var(--nav-height) + 24px) 0 48px;
}

.admin-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 20px;
}

.admin-kicker {
	margin: 0 0 2px;
	color: var(--color-accent);
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.admin-header h1 {
	margin: 0;
	font-size: 24px;
	line-height: 1.2;
}

.admin-stats {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 10px;
	margin-bottom: 18px;
}

.admin-stat {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-height: 84px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
}

.admin-stat span {
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
}

.admin-stat strong {
	font-size: 28px;
	line-height: 1;
}

.admin-stat-alert strong {
	color: var(--color-danger);
}

.admin-section {
	margin-top: 16px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	overflow: hidden;
}

.admin-section-header {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 16px;
	border-bottom: 1px solid var(--color-border);
}

.admin-section-header h2 {
	margin: 0;
	font-size: 16px;
}

.admin-empty {
	padding: 24px 16px;
	color: var(--color-text-muted);
}

.reason-list {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1px;
	background: var(--color-border);
}

.reason-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 16px;
	background: var(--color-surface);
}

/* Nav links */
.nav-links {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
	margin-top: 16px;
}

.nav-link {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 20px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	text-decoration: none;
	color: inherit;
	transition:
		background 0.1s,
		border-color 0.1s;
}

.nav-link:hover {
	background: color-mix(in srgb, var(--color-accent) 5%, var(--color-surface));
	border-color: var(--color-accent);
}

.nav-link-body {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.nav-link-label {
	font-size: 16px;
	font-weight: 700;
}

.nav-link-sub {
	font-size: 12px;
	color: var(--color-text-muted);
}

.nav-link-arrow {
	font-size: 20px;
	color: var(--color-accent);
	flex-shrink: 0;
}

@media (max-width: 900px) {
	.admin-stats {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.reason-list {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 640px) {
	.admin-page {
		width: min(100% - 24px, 1040px);
		padding-top: calc(var(--nav-height) + 12px);
	}

	.admin-stats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.reason-list,
	.nav-links {
		grid-template-columns: 1fr;
	}
}
</style>
