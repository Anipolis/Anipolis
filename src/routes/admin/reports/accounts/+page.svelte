<script lang="ts">
import { enhance } from "$app/forms";
import { formatRelativeTime } from "$lib/utils/format";
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

const statusLabels: Record<string, string> = {
	open: "未対応",
	reviewing: "確認中",
	resolved: "対応済み",
	rejected: "却下",
};

const moderationLabels: Record<string, string> = {
	active: "制限なし",
	restricted: "制限中",
	banned: "BAN",
};

let expandedId = $state<string | null>(null);

function toggleRow(id: string) {
	expandedId = expandedId === id ? null : id;
}
</script>

<svelte:head><title>アカウント通報 - Admin</title></svelte:head>

<main class="list-page">
	<header class="page-header">
		<a href="/admin" class="back-link">← ダッシュボード</a>
		<div class="page-title">
			<p class="kicker">Admin</p>
			<h1>アカウント通報 <span class="count-badge">{data.reports.length}</span></h1>
		</div>
	</header>

	{#if data.reports.length === 0}
		<p class="empty">アカウントへの通報はありません。</p>
	{:else}
		<div class="report-list">
			{#each data.reports as report}
				<div class="report-item" class:expanded={expandedId === report.id}>
					<button class="report-summary" type="button" onclick={() => toggleRow(report.id)}>
						<span class="status-pill status-{report.status}">{statusLabels[report.status]}</span>
						<span class="reason">{reasonLabels[report.reason]}</span>
						{#if report.target_username}
							<span class="username">@{report.target_username}</span>
						{:else}
							<span class="username">ユーザー #{report.target_id.slice(0, 8)}</span>
						{/if}
						{#if report.target_moderation_status && report.target_moderation_status !== "active"}
							<span class="moderation-pill moderation-{report.target_moderation_status}">
								{moderationLabels[report.target_moderation_status]}
							</span>
						{/if}
						<time class="time" datetime={report.created_at}>{formatRelativeTime(report.created_at)}</time>
						<span class="chevron" aria-hidden="true">{expandedId === report.id ? "▲" : "▼"}</span>
					</button>

					{#if expandedId === report.id}
						<div class="report-detail">
							<div class="detail-cols">
								<div class="detail-main">
									<section class="detail-section">
										<h3>通報対象</h3>
										{#if report.target_username}
											<a href="/{report.target_username}" class="user-link"
												>@{report.target_username}</a
											>
										{/if}
										{#if report.target_moderation_status && report.target_moderation_status !== "active"}
											<span class="moderation-pill moderation-{report.target_moderation_status}">
												{moderationLabels[report.target_moderation_status]}
											</span>
											{#if report.target_moderation_until}
												<span class="mod-until">
													{new Date(report.target_moderation_until).toLocaleString("ja-JP")}まで
												</span>
											{/if}
											{#if report.target_moderation_reason}
												<p class="mod-reason">{report.target_moderation_reason}</p>
											{/if}
										{/if}
									</section>
									<section class="detail-section">
										<h3>通報者</h3>
										<a href="/{report.reporter_username}" class="user-link"
											>@{report.reporter_username}</a
										>
										{#if report.details}
											<p class="reporter-notes">{report.details}</p>
										{/if}
									</section>
								</div>

								<div class="detail-actions">
									<form method="POST" action="?/updateReportStatus" use:enhance>
										<input type="hidden" name="report_id" value={report.id}>
										<div class="action-row">
											<select name="status" class="status-select">
												{#each Object.entries(statusLabels) as [ value, label ]}
													<option {value} selected={report.status === value}>{label}</option>
												{/each}
											</select>
											<button type="submit" class="btn btn-secondary">更新</button>
										</div>
									</form>

									<hr class="divider">

									<form method="POST" action="?/updateAccountModeration" use:enhance>
										<input type="hidden" name="report_id" value={report.id}>
										<input type="hidden" name="target_user_id" value={report.target_id}>
										<div class="mod-form">
											<label class="field-label">
												対応
												<select name="moderation_status" class="status-select">
													{#each Object.entries(moderationLabels) as [ value, label ]}
														<option
															{value}
															selected={report.target_moderation_status === value ||
																(!report.target_moderation_status && value === "active")}
														>
															{label}
														</option>
													{/each}
												</select>
											</label>
											<label class="field-label">
												期限（制限中の場合）
												<input type="datetime-local" name="moderation_until" class="date-input">
											</label>
											<label class="field-label">
												理由
												<textarea
													name="moderation_reason"
													rows="2"
													maxlength="500"
													class="reason-textarea"
													placeholder="理由（任意）"
												></textarea>
											</label>
											<button type="submit" class="btn btn-primary btn-full">適用</button>
										</div>
									</form>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
.list-page {
	width: min(1040px, calc(100% - 32px));
	margin: 0 auto;
	padding: calc(var(--nav-height) + 24px) 0 48px;
}

.page-header {
	margin-bottom: 20px;
}

.back-link {
	display: inline-block;
	margin-bottom: 10px;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}

.back-link:hover {
	color: var(--color-text);
}

.kicker {
	margin: 0 0 2px;
	color: var(--color-accent);
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.page-title h1 {
	margin: 0;
	font-size: 24px;
	line-height: 1.2;
	display: flex;
	align-items: center;
	gap: 10px;
}

.count-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 26px;
	height: 26px;
	padding: 0 8px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	color: var(--color-accent);
	font-size: 14px;
	font-weight: 800;
}

.empty {
	padding: 24px 0;
	color: var(--color-text-muted);
}

.report-list {
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	overflow: hidden;
}

.report-item {
	border-bottom: 1px solid var(--color-border);
}

.report-item:last-child {
	border-bottom: none;
}

.report-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 12px 16px;
	background: none;
	border: none;
	cursor: pointer;
	text-align: left;
	color: inherit;
	font-size: 13px;
	transition: background 0.1s;
}

.report-summary:hover {
	background: color-mix(in srgb, var(--color-text) 4%, transparent);
}

.report-item.expanded .report-summary {
	background: color-mix(in srgb, var(--color-accent) 5%, transparent);
	border-bottom: 1px solid var(--color-border);
}

.reason {
	font-weight: 600;
}

.username {
	color: var(--color-accent);
	font-weight: 500;
}

.time {
	margin-left: auto;
	color: var(--color-text-muted);
	white-space: nowrap;
}

.chevron {
	color: var(--color-text-muted);
	font-size: 10px;
	flex-shrink: 0;
}

/* Detail panel */
.report-detail {
	padding: 16px;
}

.detail-cols {
	display: grid;
	grid-template-columns: 1fr 280px;
	gap: 20px;
}

.detail-section {
	margin-bottom: 16px;
}

.detail-section:last-child {
	margin-bottom: 0;
}

.detail-section h3 {
	margin: 0 0 6px;
	font-size: 11px;
	font-weight: 800;
	text-transform: uppercase;
	color: var(--color-text-muted);
	letter-spacing: 0.05em;
}

.user-link {
	color: var(--color-accent);
	font-weight: 500;
	font-size: 13px;
	text-decoration: none;
}

.user-link:hover {
	text-decoration: underline;
}

.mod-until {
	display: block;
	margin-top: 4px;
	font-size: 12px;
	color: var(--color-text-muted);
}

.mod-reason {
	margin: 4px 0 0;
	font-size: 13px;
	color: var(--color-text-muted);
}

.reporter-notes {
	margin: 6px 0 0;
	font-size: 13px;
	color: var(--color-text-muted);
	white-space: pre-wrap;
}

/* Actions */
.detail-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	align-self: start;
}

.action-row {
	display: flex;
	gap: 6px;
}

.status-select {
	flex: 1;
	min-height: 34px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: var(--color-surface);
	color: var(--color-text);
	padding: 0 8px;
	font-size: 13px;
}

.divider {
	border: none;
	border-top: 1px solid var(--color-border);
	margin: 4px 0;
}

.mod-form {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.field-label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 12px;
	font-weight: 700;
	color: var(--color-text-muted);
}

.date-input {
	min-height: 34px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: var(--color-surface);
	color: var(--color-text);
	padding: 0 8px;
	font-size: 13px;
}

.reason-textarea {
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: var(--color-surface);
	color: var(--color-text);
	padding: 6px 8px;
	font-size: 13px;
	resize: vertical;
	font-family: inherit;
}

.btn-full {
	width: 100%;
}

/* Status pills */
.status-pill {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 800;
	flex-shrink: 0;
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
	min-height: 20px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 11px;
	font-weight: 800;
	text-transform: uppercase;
	flex-shrink: 0;
}

.moderation-restricted {
	background: color-mix(in srgb, #f59e0b 18%, transparent);
	color: #f59e0b;
}

.moderation-banned {
	background: color-mix(in srgb, var(--color-danger) 14%, transparent);
	color: var(--color-danger);
}

@media (max-width: 760px) {
	.detail-cols {
		grid-template-columns: 1fr;
	}

	.list-page {
		width: min(100% - 24px, 1040px);
		padding-top: calc(var(--nav-height) + 12px);
	}
}
</style>
