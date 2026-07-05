<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onMount } from "svelte";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { trapFocus } from "$lib/actions/trapFocus";
import type { RoomExitSurveyComparisonWithX, RoomExitSurveyNextParticipation } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let stopTarget: { id: string; title: string } | null = $state(null);

onMount(() => {
	const refreshId = setInterval(() => void invalidateAll(), 30_000);
	return () => clearInterval(refreshId);
});

function formatDate(iso: string | null) {
	if (!iso) return "-";
	return new Intl.DateTimeFormat("ja-JP", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

function formatElapsed(iso: string) {
	const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
	if (minutes < 60) return `${minutes}分`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function formatPercent(value: number | null) {
	if (value == null) return "-";
	return `${Math.round(value * 1000) / 10}%`;
}

function formatDecimal(value: number) {
	return value.toFixed(value >= 10 ? 1 : 2);
}

function formatDuration(seconds: number | null) {
	if (seconds == null) return "-";
	const rounded = Math.round(seconds);
	const minutes = Math.floor(rounded / 60);
	const rest = rounded % 60;
	if (minutes <= 0) return `${rest}秒`;
	return rest ? `${minutes}分${rest}秒` : `${minutes}分`;
}

function formatAverage(value: number | null) {
	return value == null ? "-" : value.toFixed(1);
}

const nextParticipationLabels: Record<RoomExitSurveyNextParticipation, string> = {
	must_join: "必ず参加したい",
	want_join: "できれば参加したい",
	not_sure: "わからない",
	not_really: "あまり参加したくない",
	not_join: "参加したくない",
};

const comparisonWithXLabels: Record<RoomExitSurveyComparisonWithX, string> = {
	anipolis_better: "Anipolisの方がよい",
	anipolis_slightly_better: "どちらかといえばAnipolis",
	same: "どちらともいえない",
	x_slightly_better: "どちらかといえばX / Twitter",
	x_better: "X / Twitterの方がよい",
	cannot_compare: "比較できない",
};

function optionCounts<T extends string>(counts: Record<T, number>, labels: Record<T, string>) {
	return (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({
		value,
		label,
		count: counts[value] ?? 0,
	}));
}

const closeStopModalAfterSubmit: SubmitFunction = () => {
	return async ({ result, update }) => {
		await update();
		if (result.type === "success") stopTarget = null;
	};
};
</script>

<svelte:head> <title>Room Experiments - Anipolis</title> </svelte:head>

<main class="room-experiments-page">
	<header class="admin-header">
		<div>
			<a class="back-link" href="/admin">← Admin</a>
			<p class="admin-kicker">KPI Experiment</p>
			<h1>放送回ルーム検証</h1>
		</div>
	</header>

	{#if form?.message}
		<p class="form-message" class:form-message--error={!form.success}>{form.message}</p>
	{/if}

	<section class="admin-section">
		<div class="admin-section-header">
			<h2>対象検索</h2>
		</div>
		<div class="target-toggle" role="group" aria-label="対象種別">
			<a
				class="btn-toggle"
				class:btn-toggle--active={data.target !== "event"}
				href={`?target=anime${data.query ? `&q=${encodeURIComponent(data.query)}` : ""}`}
			>
				アニメ
			</a>
			<a
				class="btn-toggle"
				class:btn-toggle--active={data.target === "event"}
				href={`?target=event${data.query ? `&q=${encodeURIComponent(data.query)}` : ""}`}
			>
				イベント
			</a>
		</div>
		<form method="GET" class="search-form">
			<input type="hidden" name="target" value={data.target}>
			<input
				class="input"
				name="q"
				value={data.query}
				aria-label={data.target === "event" ? "イベント検索" : "作品検索"}
				placeholder={data.target === "event" ? "イベント名で検索" : "作品名で検索"}
			>
			<button class="btn" type="submit">検索</button>
		</form>

		{#if data.target === "event"}
			{#if data.eventSearchResults.length > 0}
				<div class="search-results">
					{#each data.eventSearchResults as ev}
						<div class="search-row">
							<div class="anime-summary">
								<div class="anime-cover anime-cover--empty"></div>
								<div>
									<strong>{ev.title}</strong>
									<span>
										{formatDate(ev.scheduled_at)}
										{#if ev.anime_title}
											· {ev.anime_title}
										{/if}
										{#if ev.is_cancelled}
											· <span class="badge-cancelled">キャンセル済み</span>
										{/if}
									</span>
								</div>
							</div>
							{#if ev.active_run_id}
								<button
									class="btn btn-danger"
									type="button"
									onclick={() => (stopTarget = { id: ev.active_run_id ?? "", title: ev.title })}
								>
									停止
								</button>
							{:else}
								<form method="POST" action="?/startRun" use:enhance class="inline-form">
									<input type="hidden" name="event_id" value={ev.id}>
									<button class="btn" type="submit" disabled={ev.is_cancelled}>対象化</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{:else if data.query}
				<p class="empty-state">該当するイベントがありません。</p>
			{/if}
		{:else if data.dashboard.searchResults.length > 0}
			<div class="search-results">
				{#each data.dashboard.searchResults as anime}
					<div class="search-row">
						<div class="anime-summary">
							{#if anime.cover_url}
								<img src={anime.cover_url} alt="" class="anime-cover">
							{:else}
								<div class="anime-cover anime-cover--empty"></div>
							{/if}
							<div>
								<strong>{anime.title}</strong>
								<span
									>{anime.room_type === "global" ? "グローバルロビー作品" : "放送回ルーム作品"}</span
								>
							</div>
						</div>
						{#if anime.active_run_id}
							<button
								class="btn btn-danger"
								type="button"
								onclick={() => (stopTarget = { id: anime.active_run_id ?? "", title: anime.title })}
							>
								停止
							</button>
						{:else}
							<form method="POST" action="?/startRun" use:enhance class="inline-form">
								<input type="hidden" name="anime_id" value={anime.id}>
								<button class="btn" type="submit">対象化</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{:else if data.query}
			<p class="empty-state">該当する作品がありません。</p>
		{/if}
	</section>

	<section class="admin-section">
		<div class="admin-section-header">
			<h2>active run</h2>
			<span>{data.dashboard.runs.length}件</span>
		</div>
		{#if data.dashboard.runs.length === 0}
			<p class="empty-state">現在進行中の検証runはありません。</p>
		{:else}
			<div class="run-grid">
				{#each data.dashboard.runs as run}
					<article class="run-panel">
						<div class="run-panel-header">
							<div class="anime-summary">
								{#if run.room_kind === "event"}
									<div class="anime-cover anime-cover--empty"></div>
									<div>
										<strong>{run.event_title}</strong>
										<span class="kind-badge">イベント</span>
										<span>{formatDate(run.started_at)}開始 · {formatElapsed(run.started_at)}</span>
									</div>
								{:else}
									{#if run.anime_cover_url}
										<img src={run.anime_cover_url} alt="" class="anime-cover">
									{:else}
										<div class="anime-cover anime-cover--empty"></div>
									{/if}
									<div>
										<strong>{run.anime_title}</strong>
										<span>{formatDate(run.started_at)}開始 · {formatElapsed(run.started_at)}</span>
									</div>
								{/if}
							</div>
							<button
								class="btn btn-danger"
								type="button"
								onclick={() =>
									(stopTarget = {
										id: run.id,
										title: run.room_kind === "event" ? (run.event_title ?? "") : (run.anime_title ?? ""),
									})}
							>
								停止
							</button>
						</div>

						<div class="metric-strip">
							<div><span>入室</span><strong>{run.summary.visit_count}</strong></div>
							<div><span>UU</span><strong>{run.summary.unique_visitor_count}</strong></div>
							<div><span>active</span><strong>{run.summary.active_visit_count}</strong></div>
							<div><span>投稿者</span><strong>{run.summary.poster_count}</strong></div>
							<div><span>投稿数</span><strong>{run.summary.post_count}</strong></div>
							<div><span>投稿率</span><strong>{formatPercent(run.summary.posting_rate)}</strong></div>
							<div>
								<span>平均滞在</span><strong>{formatDuration(run.summary.average_stay_seconds)}</strong>
							</div>
						</div>

						<div class="survey-panel">
							<div class="survey-panel-header">
								<h3>退出時アンケート</h3>
								<span>{run.survey.response_count}件 / スキップ {run.survey.skipped_count}件</span>
							</div>
							{#if run.survey.response_count === 0}
								<p class="survey-empty">まだアンケート回答はありません。</p>
							{:else}
								<div class="survey-metrics">
									<div>
										<span>楽しさ</span
										><strong>{formatAverage(run.survey.average_overall_rating)}</strong>
									</div>
									<div>
										<span>一緒に見ている感</span
										><strong>{formatAverage(run.survey.average_shared_experience_rating)}</strong>
									</div>
									<div>
										<span>見やすさ</span
										><strong>{formatAverage(run.survey.average_readability_rating)}</strong>
									</div>
									<div><span>回答</span><strong>{run.survey.submitted_count}</strong></div>
								</div>
								<div class="survey-distributions">
									<div>
										<h4>次回参加</h4>
										{#each optionCounts(run.survey.next_participation_counts, nextParticipationLabels) as option}
											<div class="survey-option-row">
												<span>{option.label}</span>
												<strong>{option.count}</strong>
											</div>
										{/each}
									</div>
									<div>
										<h4>X / Twitter比較</h4>
										{#each optionCounts(run.survey.comparison_with_x_counts, comparisonWithXLabels) as option}
											<div class="survey-option-row">
												<span>{option.label}</span>
												<strong>{option.count}</strong>
											</div>
										{/each}
									</div>
								</div>
								{#if run.survey.comments.length > 0}
									<div class="survey-comments">
										<h4>自由記述</h4>
										{#each run.survey.comments as comment}
											<article class="survey-comment">
												<div>
													<span>{comment.room_title ?? "-"}</span>
													<time>{formatDate(comment.submitted_at)}</time>
												</div>
												{#if comment.good_points}
													<p><strong>よかった点</strong>{comment.good_points}</p>
												{/if}
												{#if comment.improvement_points}
													<p><strong>改善点</strong>{comment.improvement_points}</p>
												{/if}
											</article>
										{/each}
									</div>
								{/if}
							{/if}
						</div>

						<div class="room-table-wrap">
							<table>
								<thead>
									<tr>
										<th>ルーム</th>
										<th>開始</th>
										<th>入室</th>
										<th>UU</th>
										<th>active</th>
										<th>投稿者</th>
										<th>投稿率</th>
										<th>投稿数</th>
										<th>投稿/UU</th>
										<th>平均滞在</th>
										<th>即離脱</th>
										<th>終了前離脱</th>
										<th>アンケート</th>
										<th>平均</th>
										<th>スキップ</th>
									</tr>
								</thead>
								<tbody>
									{#if run.rooms.length === 0}
										<tr>
											<td colspan="15" class="empty-cell">
												まだ放送回ルーム内の計測データはありません。
											</td>
										</tr>
									{:else}
										{#each run.rooms as room}
											<tr>
												<td>{room.room_title ?? "-"}</td>
												<td>{formatDate(room.scheduled_at)}</td>
												<td>{room.visit_count}</td>
												<td>{room.unique_visitor_count}</td>
												<td>{room.active_visit_count}</td>
												<td>{room.poster_count}</td>
												<td>{formatPercent(room.posting_rate)}</td>
												<td>{room.post_count}</td>
												<td>{formatDecimal(room.posts_per_unique_visitor)}</td>
												<td>{formatDuration(room.average_stay_seconds)}</td>
												<td>{formatPercent(room.bounce_rate_under_60s)}</td>
												<td>{formatPercent(room.early_exit_rate)}</td>
												<td>{room.survey.response_count}</td>
												<td>{formatAverage(room.survey.average_overall_rating)}</td>
												<td>{room.survey.skipped_count}</td>
											</tr>
										{/each}
									{/if}
								</tbody>
							</table>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="note-box">
		<p>※この画面では、検証対象化後のログインユーザーによる放送回ルーム内の行動のみ集計しています。</p>
		<p>※グローバルロビー、未ログイン閲覧、対象化前の入室・投稿は含まれません。</p>
		<p>※滞在時間は exit が送信されなかった場合、最後の heartbeat 時刻で補完されます。</p>
	</section>
</main>

{#if stopTarget}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(event) => { if (event.target === event.currentTarget) stopTarget = null; }}
	>
		<div
			class="modal"
			use:trapFocus
			role="dialog"
			aria-modal="true"
			aria-labelledby="stop-run-title"
			tabindex="-1"
			onkeydown={(event) => {
				if (event.key === "Escape") stopTarget = null;
			}}
		>
			<h2 id="stop-run-title">検証runを停止</h2>
			<p>「{stopTarget.title}」の検証runを停止します。以後、このrunには新規入室・投稿が集計されません。</p>
			<div class="modal-actions">
				<button class="btn btn-ghost" type="button" onclick={() => (stopTarget = null)}>キャンセル</button>
				<form method="POST" action="?/stopRun" use:enhance={closeStopModalAfterSubmit}>
					<input type="hidden" name="run_id" value={stopTarget.id}>
					<button class="btn btn-danger" type="submit">停止する</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<style>
.room-experiments-page {
	width: min(1180px, calc(100% - 32px));
	margin: 0 auto;
	padding: calc(var(--nav-height) + 24px) 0 56px;
}

.admin-header {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 18px;
}

.back-link {
	display: inline-flex;
	margin-bottom: 8px;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
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

.admin-section,
.note-box {
	margin-top: 16px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	overflow: hidden;
}

.admin-section-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px;
	border-bottom: 1px solid var(--color-border);
}

.admin-section-header h2 {
	margin: 0;
	font-size: 16px;
}

.target-toggle {
	display: flex;
	gap: 8px;
	padding: 16px 16px 0;
}

.btn-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 36px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text-muted);
	padding: 0 14px;
	font-weight: 700;
	font-size: 13px;
	text-decoration: none;
}

.btn-toggle--active {
	border-color: var(--color-accent);
	background: var(--color-accent);
	color: white;
}

.anime-summary .kind-badge {
	display: inline-block;
	margin-left: 6px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-accent) 18%, var(--color-surface));
	color: var(--color-accent);
	padding: 1px 8px;
	font-size: 11px;
	font-weight: 800;
}

.badge-cancelled {
	color: var(--color-danger);
	font-weight: 700;
}

.search-form {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 10px;
	padding: 16px;
}

.input {
	width: 100%;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	padding: 10px 12px;
	font: inherit;
}

.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 40px;
	border: 1px solid var(--color-accent);
	border-radius: 8px;
	background: var(--color-accent);
	color: white;
	padding: 0 14px;
	font-weight: 800;
	cursor: pointer;
	text-decoration: none;
}

.btn-danger {
	border-color: var(--color-danger);
	background: var(--color-danger);
}

.btn-ghost {
	border-color: var(--color-border);
	background: var(--color-surface);
	color: var(--color-text);
}

.inline-form {
	margin: 0;
}

.search-results {
	border-top: 1px solid var(--color-border);
}

.search-row,
.run-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 12px 16px;
	border-top: 1px solid var(--color-border);
}

.search-row:first-child {
	border-top: 0;
}

.anime-summary {
	display: flex;
	align-items: center;
	min-width: 0;
	gap: 10px;
}

.anime-summary strong,
.anime-summary span {
	display: block;
}

.anime-summary strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.anime-summary span {
	color: var(--color-text-muted);
	font-size: 12px;
}

.anime-cover {
	width: 36px;
	height: 50px;
	flex: 0 0 auto;
	border-radius: 6px;
	object-fit: cover;
	background: var(--color-border);
}

.anime-cover--empty {
	border: 1px solid var(--color-border);
}

.empty-state,
.empty-cell {
	padding: 18px 16px;
	color: var(--color-text-muted);
	text-align: center;
}

.run-grid {
	display: grid;
	gap: 14px;
	padding: 16px;
}

.run-panel {
	border: 1px solid var(--color-border);
	border-radius: 8px;
	overflow: hidden;
}

.metric-strip {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	gap: 1px;
	background: var(--color-border);
	border-top: 1px solid var(--color-border);
}

.metric-strip div {
	min-width: 0;
	background: var(--color-surface);
	padding: 12px;
}

.metric-strip span {
	display: block;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
}

.metric-strip strong {
	display: block;
	margin-top: 4px;
	font-size: 22px;
	line-height: 1;
}

.survey-panel {
	border-top: 1px solid var(--color-border);
	padding: 14px 16px 16px;
}

.survey-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
}

.survey-panel-header h3,
.survey-distributions h4,
.survey-comments h4 {
	margin: 0;
	font-size: 14px;
}

.survey-panel-header span,
.survey-empty {
	color: var(--color-text-muted);
	font-size: 13px;
}

.survey-empty {
	margin: 0;
}

.survey-metrics {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 1px;
	margin-bottom: 12px;
	background: var(--color-border);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	overflow: hidden;
}

.survey-metrics div {
	min-width: 0;
	background: var(--color-surface);
	padding: 10px 12px;
}

.survey-metrics span {
	display: block;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
}

.survey-metrics strong {
	display: block;
	margin-top: 4px;
	font-size: 20px;
	line-height: 1;
}

.survey-distributions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.survey-distributions > div,
.survey-comments {
	border: 1px solid var(--color-border);
	border-radius: 8px;
	padding: 12px;
}

.survey-option-row {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	margin-top: 8px;
	color: var(--color-text-muted);
	font-size: 13px;
}

.survey-option-row strong {
	color: var(--color-text);
}

.survey-comments {
	margin-top: 12px;
}

.survey-comment {
	margin-top: 10px;
	border-top: 1px solid var(--color-border);
	padding-top: 10px;
}

.survey-comment:first-of-type {
	border-top: 0;
	padding-top: 0;
}

.survey-comment div {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	color: var(--color-text-muted);
	font-size: 12px;
}

.survey-comment p {
	margin: 8px 0 0;
	white-space: pre-wrap;
	line-height: 1.6;
}

.survey-comment p strong {
	margin-right: 8px;
	color: var(--color-text-muted);
}

.room-table-wrap {
	overflow-x: auto;
	border-top: 1px solid var(--color-border);
}

table {
	width: 100%;
	border-collapse: collapse;
	min-width: 1120px;
}

th,
td {
	padding: 10px 12px;
	border-bottom: 1px solid var(--color-border);
	text-align: right;
	white-space: nowrap;
}

th:first-child,
td:first-child {
	text-align: left;
}

th {
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 800;
}

.note-box {
	padding: 14px 16px;
	color: var(--color-text-muted);
	font-size: 13px;
}

.note-box p {
	margin: 4px 0;
}

.form-message {
	border: 1px solid var(--color-accent);
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
	padding: 12px 14px;
	font-weight: 700;
}

.form-message--error {
	border-color: var(--color-danger);
	background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
}

.modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 80;
	display: grid;
	place-items: center;
	background: rgb(0 0 0 / 0.5);
	padding: 18px;
}

.modal {
	width: min(420px, 100%);
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	padding: 20px;
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.35);
}

.modal h2 {
	margin: 0 0 8px;
	font-size: 18px;
}

.modal p {
	margin: 0;
	color: var(--color-text-muted);
	line-height: 1.7;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 18px;
}

@media (max-width: 800px) {
	.room-experiments-page {
		width: min(100% - 24px, 1180px);
		padding-top: calc(var(--nav-height) + 12px);
	}

	.search-form,
	.metric-strip,
	.survey-metrics,
	.survey-distributions {
		grid-template-columns: 1fr;
	}

	.search-row,
	.run-panel-header {
		align-items: stretch;
		flex-direction: column;
	}

	.search-row .btn,
	.search-row form,
	.run-panel-header .btn {
		width: 100%;
	}
}
</style>
