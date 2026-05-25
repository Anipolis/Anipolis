<script lang="ts">
import { enhance } from "$app/forms";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const reasonLabels = {
	spam: "スパム",
	harassment: "嫌がらせ",
	sexual: "性的コンテンツ",
	violence: "暴力的コンテンツ",
	illegal: "違法・危険行為",
	other: "その他",
};

const statusLabels = {
	open: "未対応",
	reviewing: "確認中",
	resolved: "対応済み",
	rejected: "却下",
};

const moderationLabels = {
	active: "制限なし",
	restricted: "制限",
	banned: "BAN",
};

function toDateTimeLocal(value: string | null) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

const dashboard = $derived(data.dashboard);
const postReports = $derived(dashboard?.postReports ?? []);
const accountReports = $derived(dashboard?.accountReports ?? []);
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
		<section class="admin-stats" aria-label="運営指標">
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

	<section class="admin-section">
		<div class="admin-section-header">
			<h2>投稿通報</h2>
			{#if postReports.length > 0}
				<span class="report-count">{postReports.length}</span>
			{/if}
		</div>

		{#if postReports.length === 0}
			<p class="admin-empty">投稿への通報はありません。</p>
		{:else}
			<div class="report-list">
				{#each postReports as report}
					<article class="report-item">
						<div class="report-main">
							<div class="report-topline">
								<span class="status-pill status-{report.status}">{statusLabels[report.status]}</span>
								<span>{reasonLabels[report.reason]}</span>
								<time datetime={report.created_at}>{formatRelativeTime(report.created_at)}</time>
							</div>
							<div class="report-target">
								<a href="/posts/{report.target_id}">投稿 #{report.target_id.slice(0, 8)}</a>
								{#if report.target_username}
									<span
										>投稿者
										<a href="/profile/{report.target_username}">@{report.target_username}</a></span
									>
								{/if}
								<span>報告者 @{report.reporter_username}</span>
								{#if report.target_moderation_status && report.target_moderation_status !== 'active'}
									<span class="moderation-pill moderation-{report.target_moderation_status}">
										{moderationLabels[report.target_moderation_status]}
									</span>
								{/if}
							</div>
							{#if report.post_content}
								<p class="report-content">{report.post_content}</p>
							{/if}
							{#if report.details}
								<p class="report-details">{report.details}</p>
							{/if}
						</div>

						<form method="POST" action="?/updateReportStatus" class="report-actions" use:enhance>
							<input type="hidden" name="report_id" value={report.id}>
							<select name="status" aria-label="ステータス">
								{#each Object.entries(statusLabels) as [ value, label ]}
									<option {value} selected={value === report.status}>{label}</option>
								{/each}
							</select>
							<button type="submit" class="btn btn-primary">更新</button>
						</form>

						{#if report.target_user_id}
							<details class="moderation-disclosure">
								<summary>アカウント措置</summary>
								<form
									method="POST"
									action="?/updateAccountModeration"
									class="moderation-actions"
									use:enhance
								>
									<input type="hidden" name="report_id" value={report.id}>
									<input type="hidden" name="target_user_id" value={report.target_user_id}>
									<select name="moderation_status" aria-label="アカウント措置">
										{#each Object.entries(moderationLabels) as [ value, label ]}
											<option
												{value}
												selected={value === (report.target_moderation_status ?? 'active')}
											>
												{label}
											</option>
										{/each}
									</select>
									<input
										type="datetime-local"
										name="moderation_until"
										aria-label="制限期限"
										value={toDateTimeLocal(report.target_moderation_until)}
									>
									<input
										type="text"
										name="moderation_reason"
										maxlength="500"
										placeholder="措置理由"
										value={report.target_moderation_reason ?? ''}
									>
									<button type="submit" class="btn btn-danger">適用</button>
								</form>
							</details>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="admin-section">
		<div class="admin-section-header">
			<h2>アカウント通報</h2>
			{#if accountReports.length > 0}
				<span class="report-count">{accountReports.length}</span>
			{/if}
		</div>

		{#if accountReports.length === 0}
			<p class="admin-empty">アカウントへの通報はありません。</p>
		{:else}
			<div class="report-list">
				{#each accountReports as report}
					<article class="report-item">
						<div class="report-main">
							<div class="report-topline">
								<span class="status-pill status-{report.status}">{statusLabels[report.status]}</span>
								<span>{reasonLabels[report.reason]}</span>
								<time datetime={report.created_at}>{formatRelativeTime(report.created_at)}</time>
							</div>
							<div class="report-target">
								{#if report.target_username}
									<a href="/profile/{report.target_username}">@{report.target_username}</a>
								{:else}
									<span>ユーザー #{report.target_id.slice(0, 8)}</span>
								{/if}
								<span>報告者 @{report.reporter_username}</span>
								{#if report.target_moderation_status}
									<span class="moderation-pill moderation-{report.target_moderation_status}">
										{moderationLabels[report.target_moderation_status]}
									</span>
								{/if}
							</div>
							{#if report.details}
								<p class="report-details">{report.details}</p>
							{/if}
						</div>

						<form method="POST" action="?/updateReportStatus" class="report-actions" use:enhance>
							<input type="hidden" name="report_id" value={report.id}>
							<select name="status" aria-label="ステータス">
								{#each Object.entries(statusLabels) as [ value, label ]}
									<option {value} selected={value === report.status}>{label}</option>
								{/each}
							</select>
							<button type="submit" class="btn btn-primary">更新</button>
						</form>

						{#if report.target_user_id}
							<form
								method="POST"
								action="?/updateAccountModeration"
								class="moderation-actions"
								use:enhance
							>
								<input type="hidden" name="report_id" value={report.id}>
								<input type="hidden" name="target_user_id" value={report.target_user_id}>
								<select name="moderation_status" aria-label="アカウント措置">
									{#each Object.entries(moderationLabels) as [ value, label ]}
										<option
											{value}
											selected={value === (report.target_moderation_status ?? 'active')}
										>
											{label}
										</option>
									{/each}
								</select>
								<input
									type="datetime-local"
									name="moderation_until"
									aria-label="制限期限"
									value={toDateTimeLocal(report.target_moderation_until)}
								>
								<input
									type="text"
									name="moderation_reason"
									maxlength="500"
									placeholder="措置理由"
									value={report.target_moderation_reason ?? ''}
								>
								<button type="submit" class="btn btn-danger">適用</button>
							</form>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
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
	grid-template-columns: repeat(4, minmax(0, 1fr));
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

.report-count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 22px;
	height: 22px;
	padding: 0 6px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	color: var(--color-accent);
	font-size: 12px;
	font-weight: 800;
}

.moderation-disclosure {
	grid-column: 1 / -1;
}

.moderation-disclosure summary {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	color: var(--color-text-muted);
	font-size: 13px;
	cursor: pointer;
	user-select: none;
}

.moderation-disclosure summary:hover {
	color: var(--color-text);
}

.moderation-disclosure[open] summary {
	margin-bottom: 8px;
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

.report-list {
	display: flex;
	flex-direction: column;
}

.report-item {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 16px;
	padding: 16px;
	border-bottom: 1px solid var(--color-border);
}

.report-item:last-child {
	border-bottom: 0;
}

.report-topline,
.report-target {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	color: var(--color-text-muted);
	font-size: 13px;
}

.report-target {
	margin-top: 8px;
}

.status-pill {
	display: inline-flex;
	align-items: center;
	min-height: 24px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 800;
}

.status-open {
	background: color-mix(in srgb, var(--color-danger) 14%, transparent);
	color: var(--color-danger);
}

.status-reviewing {
	background: color-mix(in srgb, #f59e0b 18%, transparent);
	color: #f59e0b;
}

.status-resolved {
	background: color-mix(in srgb, #34d399 16%, transparent);
	color: #34d399;
}

.status-rejected {
	background: var(--color-border);
	color: var(--color-text-muted);
}

.moderation-pill {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 11px;
	font-weight: 800;
	text-transform: uppercase;
}

.moderation-active {
	background: var(--color-border);
	color: var(--color-text-muted);
}

.moderation-restricted {
	background: color-mix(in srgb, #f59e0b 18%, transparent);
	color: #f59e0b;
}

.moderation-banned {
	background: color-mix(in srgb, var(--color-danger) 14%, transparent);
	color: var(--color-danger);
}

.report-content,
.report-details {
	margin: 10px 0 0;
	word-break: break-word;
}

.report-content {
	color: var(--color-text);
}

.report-details {
	color: var(--color-text-secondary);
	font-size: 14px;
}

.report-actions {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.moderation-actions {
	grid-column: 1 / -1;
	display: grid;
	grid-template-columns: minmax(120px, 160px) minmax(160px, 220px) minmax(180px, 1fr) auto;
	gap: 8px;
	align-items: start;
}

.report-actions select,
.moderation-actions select,
.moderation-actions input {
	min-height: 36px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	padding: 0 10px;
}

@media (max-width: 900px) {
	.admin-stats,
	.reason-list {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.report-item {
		grid-template-columns: 1fr;
	}

	.moderation-actions {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 640px) {
	.admin-page {
		width: min(100% - 24px, 1040px);
		padding-top: calc(var(--nav-height) + 12px);
	}

	.admin-stats,
	.reason-list {
		grid-template-columns: 1fr;
	}
}
</style>
