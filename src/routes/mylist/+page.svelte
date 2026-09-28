<script lang="ts">
import type { ActionResult, SubmitFunction } from "@sveltejs/kit";
import { onDestroy, untrack } from "svelte";
import { applyAction, deserialize, enhance } from "$app/forms";
import { beforeNavigate, invalidateAll } from "$app/navigation";
import AnimeEditRow from "$lib/components/AnimeEditRow.svelte";
import AnimeStatusSection from "$lib/components/AnimeStatusSection.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import {
	createSaveQueue,
	DEFAULT_SAVE_ERROR_MESSAGE,
	type RowSaveState,
	type SaveResult,
} from "$lib/mylist/save-queue";
import type { Anime, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const statusOrder: AnimeStatus[] = ["watching", "completed", "plan_to_watch", "on_hold", "dropped"];

const statusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

const mobileStatusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "予定",
	on_hold: "中断",
	dropped: "断念",
};

const statusIcon: Record<AnimeStatus, string> = {
	watching: "i-lucide-circle-play",
	completed: "i-lucide-circle-check",
	plan_to_watch: "i-lucide-clipboard-list",
	on_hold: "i-lucide-circle-pause",
	dropped: "i-lucide-circle-x",
};

let isPublic = $state(false);
let viewMode = $state<"list" | "edit">("list");

$effect(() => {
	isPublic = data.profile.list_is_public;
});

$effect(() => {
	if (form && "list_is_public" in form) {
		isPublic = (form as { list_is_public: boolean }).list_is_public;
	}
});

// 公開切替の送信状態。切替中は重複送信を防ぎ、失敗時は現在の状態と再試行を案内する
let visibilityState = $state<"idle" | "saving" | "failed">("idle");
let visibilityError = $state<string | null>(null);
let visibilityForm: HTMLFormElement | undefined = $state();
const VISIBILITY_ERROR_MESSAGE = "公開設定を切り替えられませんでした";

const enhanceVisibility: SubmitFunction = ({ cancel }) => {
	if (visibilityState === "saving") {
		cancel();
		return;
	}
	visibilityState = "saving";
	visibilityError = null;

	return async ({ result }) => {
		if (result.type === "success") {
			if (result.data && "list_is_public" in result.data) {
				isPublic = Boolean(result.data["list_is_public"]);
			}
			visibilityState = "idle";
			return;
		}
		if (result.type === "failure") {
			visibilityState = "failed";
			visibilityError = (result.data as { message?: string } | undefined)?.message ?? VISIBILITY_ERROR_MESSAGE;
			return;
		}
		if (result.type === "error") {
			visibilityState = "failed";
			visibilityError = VISIBILITY_ERROR_MESSAGE;
			return;
		}
		// redirect（未ログインなど）は SvelteKit 標準の遷移に任せる
		visibilityState = "idle";
		await applyAction(result);
	};
};

function retryVisibility() {
	visibilityForm?.requestSubmit();
}

const grouped = $derived(
	statusOrder.reduce<Record<AnimeStatus, Anime[]>>(
		(acc, status) => {
			acc[status] = data.animeList.filter((e) => e.user_entry?.status === status);
			return acc;
		},
		{ watching: [], completed: [], plan_to_watch: [], on_hold: [], dropped: [] },
	),
);

const totalCount = $derived(data.animeList.length);

let selectedStatus = $state<AnimeStatus>("watching");

// 各エントリのローカル状態（編集用）
type EntryState = { status: AnimeStatus; score: string; progress: number };
type EditRow = { entry: EntryState };
let editRows = $state<Record<string, EditRow>>({});

// 行ごとの保存状態（保存待ち・保存中・保存済み・失敗）。表示と再試行に使う
let saveStates = $state<Record<string, RowSaveState<EntryState>>>({});
const unsavedCount = $derived(
	Object.values(saveStates).filter(
		(state) => state.status === "pending" || state.status === "saving" || state.status === "failed",
	).length,
);

async function saveEditRow(animeId: string, entry: EntryState): Promise<SaveResult> {
	const formData = new FormData();
	formData.set("anime_id", animeId);
	formData.set("status", entry.status);
	formData.set("score", entry.score);
	formData.set("progress", entry.progress.toString());

	// keepalive: 画面移動やタブを閉じた直後でも送信を完了させる
	const response = await fetch("?/upsertWatchlist", {
		method: "POST",
		body: formData,
		headers: { accept: "application/json", "x-sveltekit-action": "true" },
		keepalive: true,
	});

	// HTTP エラーだけでなく、アクションが返す failure / error も失敗として扱う
	let result: ActionResult;
	try {
		result = deserialize(await response.text());
	} catch {
		return { ok: false, message: `${DEFAULT_SAVE_ERROR_MESSAGE}（HTTP ${response.status}）` };
	}

	if (result.type === "success") {
		await invalidateAll().catch(() => undefined);
		return { ok: true };
	}
	if (result.type === "failure") {
		const message = (result.data as { message?: string } | undefined)?.message;
		return { ok: false, message: message ?? DEFAULT_SAVE_ERROR_MESSAGE };
	}
	if (result.type === "error") {
		return { ok: false, message: DEFAULT_SAVE_ERROR_MESSAGE };
	}
	return { ok: false, message: "ログインが必要です。ページを再読み込みしてください" };
}

// 同じ作品の保存は直列に送り、送信中に入った編集は完了後に最新値で送り直す
const saveQueue = createSaveQueue<EntryState>({
	save: saveEditRow,
	onChange: (animeId, state) => {
		saveStates[animeId] = state;
	},
});

function handleAutoSave(animeId: string, updatedFields: Partial<EntryState>) {
	const editRow = editRows[animeId];
	if (!editRow) return;

	const latestEntry = { ...editRow.entry, ...updatedFields };
	editRow.entry = latestEntry;
	saveQueue.schedule(animeId, latestEntry);
}

function retryAutoSave(animeId: string) {
	saveQueue.retry(animeId);
}

function cancelAutoSave(animeId: string) {
	saveQueue.cancel(animeId);
	delete saveStates[animeId];
}

// 未保存のまま画面移動する場合の扱い:
// - 保存待ち（デバウンス中）の行は即時送信する。keepalive 付きなので移動後も送信は完了する。
// - 保存に失敗したままの行がある場合は、移動前に確認して意図しない消失を防ぐ。
// - タブを閉じる・リロードの場合は、失敗行があればブラウザ標準の離脱確認を出す。
beforeNavigate(({ cancel, willUnload }) => {
	const unsaved = saveQueue.unsavedKeys();
	if (unsaved.length === 0) return;

	saveQueue.flush();

	const failedCount = unsaved.filter((animeId) => saveStates[animeId]?.status === "failed").length;
	if (failedCount === 0) return;

	if (willUnload) {
		cancel();
		return;
	}
	const proceed = window.confirm(
		`保存に失敗した変更が${failedCount}件あります。このまま移動すると失われますが、よろしいですか？`,
	);
	if (!proceed) cancel();
});

onDestroy(() => saveQueue.dispose());

$effect(() => {
	const currentRows = untrack(() => editRows);
	editRows = Object.fromEntries(
		data.animeList.map((anime) => [
			anime.id,
			currentRows[anime.id] ?? {
				entry: {
					status: anime.user_entry?.status ?? "plan_to_watch",
					score:
						anime.user_entry?.score != null && anime.user_entry.score > 0
							? anime.user_entry.score.toString()
							: "",
					progress: anime.user_entry?.progress ?? 0,
				},
			},
		]),
	);
});
</script>

<svelte:head> <title>マイリスト — Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column mylist-page">
		<div class="mylist-container">
			<header class="mylist-header">
				<div class="mylist-title-row">
					<div class="header-actions">
						<!-- 表示切り替え -->
						<div class="view-toggle">
							<button
								type="button"
								class="view-btn"
								class:active={viewMode === 'list'}
								onclick={() => (viewMode = 'list')}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<line x1="8" y1="6" x2="21" y2="6" />
									<line x1="8" y1="12" x2="21" y2="12" />
									<line x1="8" y1="18" x2="21" y2="18" />
									<line x1="3" y1="6" x2="3.01" y2="6" />
									<line x1="3" y1="12" x2="3.01" y2="12" />
									<line x1="3" y1="18" x2="3.01" y2="18" />
								</svg>
								一覧
							</button>
							<button
								type="button"
								class="view-btn"
								class:active={viewMode === 'edit'}
								onclick={() => (viewMode = 'edit')}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
								編集
							</button>
						</div>

						<!-- 公開/非公開切り替え -->
						<form
							bind:this={visibilityForm}
							method="POST"
							action="?/toggleVisibility"
							use:enhance={enhanceVisibility}
						>
							<button
								type="submit"
								class="visibility-btn"
								class:public={isPublic}
								class:private={!isPublic}
								class:saving={visibilityState === 'saving'}
								disabled={visibilityState === 'saving'}
								aria-busy={visibilityState === 'saving'}
								aria-describedby="visibility-help"
								title={isPublic ? '非公開にする' : '公開する'}
							>
								{#if visibilityState === 'saving'}
									<span class="visibility-spinner" aria-hidden="true"></span>
									切替中…
								{:else if isPublic}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
									公開中
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
										/>
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
									非公開
								{/if}
							</button>
						</form>
					</div>
				</div>

				<div class="mobile-header-row">
					<div class="mobile-header-controls">
						<form
							class="mobile-visibility-form"
							class:saving={visibilityState === 'saving'}
							method="POST"
							action="?/toggleVisibility"
							use:enhance={enhanceVisibility}
							aria-busy={visibilityState === 'saving'}
						>
							<button
								type="submit"
								class="mobile-visibility-btn"
								class:active={isPublic}
								disabled={isPublic || visibilityState === 'saving'}
								aria-label="マイリストを公開する"
								aria-pressed={isPublic}
								aria-describedby="visibility-help"
							>
								公開
							</button>
							<button
								type="submit"
								class="mobile-visibility-btn"
								class:active={!isPublic}
								disabled={!isPublic || visibilityState === 'saving'}
								aria-label="マイリストを非公開にする"
								aria-pressed={!isPublic}
								aria-describedby="visibility-help"
							>
								非公開
							</button>
						</form>

						<div class="mobile-view-toggle" aria-label="表示モード">
							<button
								type="button"
								class="mobile-view-btn"
								class:active={viewMode === 'list'}
								onclick={() => (viewMode = 'list')}
								aria-label="一覧表示"
								aria-pressed={viewMode === 'list'}
								title="一覧"
							>
								<span class="i-lucide-list" aria-hidden="true"></span>
							</button>
							<button
								type="button"
								class="mobile-view-btn"
								class:active={viewMode === 'edit'}
								onclick={() => (viewMode = 'edit')}
								aria-label="編集表示"
								aria-pressed={viewMode === 'edit'}
								title="編集"
							>
								<span class="i-lucide-pencil" aria-hidden="true"></span>
							</button>
						</div>
					</div>
				</div>

				<!-- 公開範囲の説明・切替の結果・未保存の案内 -->
				<div class="mylist-notices">
					<p id="visibility-help" class="visibility-help">
						{#if visibilityState === 'saving'}
							公開設定を切り替えています…
						{:else if isPublic}
							<strong>公開中:</strong>
							プロフィールの「マイリスト」タブで他のユーザーも閲覧できます（非公開アカウントの場合はフォロワーのみ）。
						{:else}
							<strong>非公開:</strong>
							マイリストは自分だけが閲覧できます。プロフィールのタブにはロック表示が付きます。
						{/if}
					</p>
					{#if visibilityState === 'failed'}
						<p class="visibility-error" role="alert">
							<span class="i-lucide-triangle-alert" aria-hidden="true"></span>
							<span>
								{visibilityError ?? VISIBILITY_ERROR_MESSAGE}。現在は「{isPublic ? '公開中' : '非公開'}」のままです。
							</span>
							<button type="button" class="retry-btn" onclick={retryVisibility}>再試行</button>
						</p>
					{/if}
					{#if unsavedCount > 0}
						<p class="unsaved-note" role="status" aria-live="polite">
							未保存の変更が{unsavedCount}件あります。画面を移動すると保存待ちの変更は自動で送信されますが、失敗した変更は再試行するまで保存されません。
						</p>
					{/if}
				</div>
			</header>

			<!-- モバイル用ステータスタブバー -->
			<div class="status-tab-bar">
				{#each statusOrder as status}
					<button
						type="button"
						class="status-tab status-tab--{status}"
						class:active={selectedStatus === status}
						onclick={() => (selectedStatus = status)}
					>
						<span class="tab-icon {statusIcon[status]}" aria-hidden="true"></span>
						<span class="tab-label desktop-tab-label">{statusLabel[status]}</span>
						<span class="tab-label mobile-tab-label">{mobileStatusLabel[status]}</span>
						<span class="tab-count">{grouped[status].length}</span>
					</button>
				{/each}
			</div>

			{#if totalCount === 0}
				<div class="mylist-empty">
					<p>まだアニメがありません。<a href="/anime">アニメを探す</a></p>
				</div>
			{:else}
				{#if grouped[selectedStatus].length === 0}
					<div class="mobile-status-empty">
						<p>{statusLabel[selectedStatus]}にはまだ登録がありません</p>
					</div>
				{/if}
				{#each statusOrder as status}
					{#if grouped[status].length > 0}
						<div class:mobile-hidden={selectedStatus !== status}>
							{#if viewMode === 'list'}
								<AnimeStatusSection {status} animes={grouped[status]} {statusLabel} {statusIcon} />
							{:else}
								<section class="status-section status-section--{status}">
									<h2 class="status-heading">
										<span class="status-icon {statusIcon[status]}" aria-hidden="true"></span>
										{statusLabel[status]}
										<span class="status-count">{grouped[status].length}</span>
									</h2>
									<div class="anime-list anime-list--edit">
										{#each grouped[status] as anime (anime.id)}
											{@const editRow = editRows[anime.id]}
											{#if editRow}
												<AnimeEditRow
													{anime}
													bind:entry={editRow.entry}
													{statusOrder}
													{statusLabel}
													saveState={saveStates[anime.id]}
													onAutoSave={(updatedFields) => handleAutoSave(anime.id, updatedFields)}
													onRetry={() => retryAutoSave(anime.id)}
													onRemove={() => cancelAutoSave(anime.id)}
												/>
											{/if}
										{/each}
									</div>
								</section>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.mylist-page {
	padding: 0;
}

.mylist-container {
	width: 100%;
}

.mylist-header {
	margin-bottom: 28px;
}

.mylist-title-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-bottom: 14px;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-left: auto;
}

.mobile-header-row,
.mobile-tab-label {
	display: none;
}

/* 表示切り替え */
.view-toggle {
	display: flex;
	background: color-mix(in srgb, var(--color-text) 8%, transparent);
	border-radius: 8px;
	padding: 3px;
	gap: 2px;
}

.view-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 5px 12px;
	border-radius: 6px;
	font-size: 0.8rem;
	font-weight: 500;
	cursor: pointer;
	border: none;
	background: transparent;
	color: var(--color-text-muted);
	transition:
		background 0.12s,
		color 0.12s;
}

.view-btn.active {
	background: var(--color-surface);
	color: var(--color-text);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.view-btn:hover:not(.active) {
	color: var(--color-text);
}

.visibility-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 14px;
	border-radius: 20px;
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
	border: none;
	transition:
		background 0.15s,
		color 0.15s;
}

.visibility-btn.public {
	background: color-mix(in srgb, var(--color-accent) 15%, transparent);
	color: var(--color-accent);
}

.visibility-btn.private {
	background: color-mix(in srgb, var(--color-text) 10%, transparent);
	color: var(--color-text-muted);
}

.visibility-btn:hover:not(:disabled) {
	filter: brightness(1.1);
}

.visibility-btn:disabled {
	cursor: progress;
	opacity: 0.75;
}

.visibility-spinner {
	width: 12px;
	height: 12px;
	border: 2px solid currentColor;
	border-right-color: transparent;
	border-radius: 50%;
	animation: visibility-spin 0.8s linear infinite;
}

@keyframes visibility-spin {
	to {
		transform: rotate(360deg);
	}
}

/* 公開範囲の説明・切替結果・未保存の案内 */
.mylist-notices {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.visibility-help,
.visibility-error,
.unsaved-note {
	margin: 0;
	font-size: 0.78rem;
	line-height: 1.5;
}

.visibility-help {
	color: var(--color-text-muted);
}

.visibility-help strong {
	color: var(--color-text);
	font-weight: 600;
}

.visibility-error {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 8px;
	padding: 8px 10px;
	border: 1px solid color-mix(in srgb, var(--color-danger, #f87171) 40%, transparent);
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-danger, #f87171) 12%, transparent);
	color: var(--color-danger, #f87171);
}

.unsaved-note {
	color: var(--color-text-muted);
}

.retry-btn {
	padding: 3px 10px;
	border: 1px solid currentColor;
	border-radius: 6px;
	background: transparent;
	color: inherit;
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
}

.retry-btn:hover {
	background: color-mix(in srgb, currentColor 12%, transparent);
}

.mylist-empty {
	text-align: center;
	padding: 60px 0;
	color: var(--color-text-muted);
}

.mobile-status-empty {
	display: none;
}

.mylist-empty a {
	color: var(--color-accent);
}

.status-section {
	margin-bottom: 32px;
}

.status-heading {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.95rem;
	font-weight: 700;
	padding: 8px 0;
	margin: 0 0 8px;
	border-bottom: 1px solid var(--color-border);
	color: var(--color-text);
}

.status-icon,
.tab-icon {
	width: 1em;
	height: 1em;
	flex: 0 0 auto;
}

.status-section--watching .status-icon {
	color: var(--status-watching);
}
.status-section--completed .status-icon {
	color: var(--status-completed);
}
.status-section--plan_to_watch .status-icon {
	color: var(--watch-status-plan);
}
.status-section--on_hold .status-icon {
	color: var(--status-on-hold);
}
.status-section--dropped .status-icon {
	color: var(--status-dropped);
}

.status-count {
	margin-left: auto;
	font-size: 0.8rem;
	color: var(--color-text-muted);
	font-weight: 400;
}

.anime-list--edit {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

/* ---- モバイル用ステータスタブバー ---- */
.status-tab-bar {
	display: none;
	overflow-x: auto;
	gap: 8px;
	padding: 0 0 16px;
	scrollbar-width: none;
	margin-bottom: 4px;
}

.status-tab-bar::-webkit-scrollbar {
	display: none;
}

.status-tab {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 8px 14px;
	border-radius: 20px;
	border: none;
	cursor: pointer;
	font-size: 0.82rem;
	font-weight: 600;
	background: color-mix(in srgb, var(--fg, #e2e8f0) 8%, transparent);
	color: var(--fg-muted, #94a3b8);
	transition:
		background 0.15s,
		color 0.15s;
	white-space: nowrap;
	flex-shrink: 0;
}

.status-tab.active {
	background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	color: var(--color-accent);
}

.status-tab--watching.active {
	background: color-mix(in srgb, var(--status-watching) 20%, transparent);
	color: var(--status-watching);
}

.status-tab--on_hold.active {
	background: color-mix(in srgb, var(--status-on-hold) 20%, transparent);
	color: var(--status-on-hold);
}

.status-tab--dropped.active {
	background: color-mix(in srgb, var(--status-dropped) 20%, transparent);
	color: var(--status-dropped);
}

.status-tab--completed.active {
	background: color-mix(in srgb, var(--status-completed) 20%, transparent);
	color: var(--status-completed);
}

.status-tab--plan_to_watch.active {
	background: color-mix(in srgb, var(--watch-status-plan) 20%, transparent);
	color: var(--watch-status-plan);
}

.tab-icon {
	font-size: 0.75rem;
}

.tab-count {
	font-size: 0.72rem;
	opacity: 0.8;
}

@media (max-width: 600px) {
	.mylist-header {
		margin-bottom: 2px;
	}

	.mylist-title-row {
		display: none;
	}

	.mobile-header-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		min-height: 34px;
		padding: 2px 0 5px;
	}

	.mobile-header-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.mobile-visibility-btn,
	.mobile-view-btn {
		display: inline-grid;
		place-items: center;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--fg-muted, #94a3b8);
		cursor: pointer;
		font-size: 0.82rem;
		line-height: 1;
	}

	.mobile-visibility-form {
		display: flex;
		overflow: hidden;
		border: 1px solid var(--border, #334155);
		border-radius: 7px;
	}

	.mobile-visibility-btn {
		width: 44px;
		font-size: 11px;
		font-weight: 600;
	}

	.mobile-visibility-btn + .mobile-visibility-btn {
		border-left: 1px solid var(--border, #334155);
	}

	.mobile-visibility-btn.active {
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
		color: var(--color-accent);
		cursor: default;
		opacity: 1;
	}

	.mobile-visibility-form.saving {
		opacity: 0.6;
		cursor: progress;
	}

	.mylist-notices {
		padding-bottom: 8px;
	}

	.mobile-view-toggle {
		display: flex;
		flex: 0 0 auto;
		overflow: hidden;
		border: 1px solid var(--border, #334155);
		border-radius: 7px;
	}

	.mobile-view-btn {
		width: 34px;
		font-size: 0.9rem;
	}

	.mobile-view-btn + .mobile-view-btn {
		border-left: 1px solid var(--border, #334155);
	}

	.mobile-view-btn.active {
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
		color: var(--color-accent);
	}

	.status-tab-bar {
		display: flex;
		width: 100%;
		overflow: hidden;
		gap: 0;
		padding: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border, #334155);
	}

	.status-tab {
		position: relative;
		display: flex;
		flex: 1 1 20%;
		justify-content: center;
		min-width: 0;
		gap: 3px;
		padding: 8px 0;
		border-radius: 0;
		background: transparent;
		font-size: 11px;
		line-height: 1;
		text-align: center;
	}

	.status-tab.active,
	.status-tab--watching.active,
	.status-tab--completed.active,
	.status-tab--plan_to_watch.active,
	.status-tab--on_hold.active,
	.status-tab--dropped.active {
		background: transparent;
	}

	.status-tab.active::after {
		position: absolute;
		right: 5px;
		bottom: -1px;
		left: 5px;
		height: 2px;
		border-radius: 2px 2px 0 0;
		background: currentColor;
		content: "";
	}

	.tab-icon,
	.desktop-tab-label {
		display: none;
	}

	.mobile-tab-label {
		display: inline;
	}

	.tab-count {
		font-size: 10px;
		opacity: 0.75;
	}

	.mobile-hidden {
		display: none;
	}

	.mobile-status-empty {
		display: block;
		text-align: center;
		padding: 40px 16px;
		color: var(--fg-muted, #94a3b8);
		font-size: 0.9rem;
	}
}
</style>
