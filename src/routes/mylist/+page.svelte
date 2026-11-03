<script lang="ts">
import type { ActionResult, SubmitFunction } from "@sveltejs/kit";
import { onDestroy, untrack } from "svelte";
import { applyAction, deserialize, enhance } from "$app/forms";
import { beforeNavigate, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import AnimeEditRow from "$lib/components/AnimeEditRow.svelte";
import AnimeStatusSection from "$lib/components/AnimeStatusSection.svelte";
import InfoTip from "$lib/components/InfoTip.svelte";
import MyListQuickEdit from "$lib/components/MyListQuickEdit.svelte";
import MylistSortSelect from "$lib/components/MylistSortSelect.svelte";
import MylistStatusTabs from "$lib/components/MylistStatusTabs.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import {
	createSaveQueue,
	DEFAULT_SAVE_ERROR_MESSAGE,
	type RowSaveState,
	type SaveResult,
} from "$lib/mylist/save-queue";
import {
	countMylistByStatus,
	groupMylistByStatus,
	MYLIST_TAB_LABELS,
	type MylistSort,
	type MylistTab,
	parseMylistSort,
	parseMylistTab,
	sortMylist,
} from "$lib/mylist/sort";
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

// 開いているタブと並び順（URL の ?status= と ?sort=。切り替えは MylistStatusTabs と MylistSortSelect が URL に残す）
let selectedStatus = $state<MylistTab>(parseMylistTab(page.url.searchParams.get("status")));
let sort = $state<MylistSort>(parseMylistSort(page.url.searchParams.get("sort")));

const grouped = $derived(groupMylistByStatus(sortMylist(data.animeList, sort)));

const totalCount = $derived(data.animeList.length);

// カードのマイリストボタン・スコアから開く欄。保存したら読み込み直して、状態の変わった作品を別の段へ移す
let quickEdit = $state<MyListQuickEdit>();

function scoreButtonFor(anime: Anime) {
	return {
		expanded: quickEdit?.isOpenFor(anime.id, "score") ?? false,
		onclick: (e: MouseEvent) => quickEdit?.open(e, anime, "score"),
	};
}

function listButtonFor(anime: Anime) {
	const status = anime.user_entry?.status;
	return {
		status,
		label: status ? `マイリスト: ${statusLabel[status]}` : "マイリストに追加",
		expanded: quickEdit?.isOpenFor(anime.id) ?? false,
		onclick: (e: MouseEvent) => quickEdit?.open(e, anime),
	};
}

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

// 保存キューは画面を離れたあとも送信中の行の後続編集を送り切る（save-queue の dispose）。
// そのため送信先は送る時点の URL に依存させず固定し、編集したユーザーにも紐付ける。
// 相対 URL のままだと移動先（/settings など）へ送られて編集が消え、アカウント切り替え後は
// 切り替え先のセッションで送られて別のユーザーのマイリストに保存される
const UPSERT_WATCHLIST_ACTION = "/mylist?/upsertWatchlist";
const saveOwnerId = untrack(() => data.user?.id ?? null);

async function saveEditRow(animeId: string, entry: EntryState): Promise<SaveResult> {
	if (!saveOwnerId || page.data.user?.id !== saveOwnerId) {
		return { ok: false, message: "アカウントが切り替わったため保存しませんでした" };
	}

	const formData = new FormData();
	formData.set("anime_id", animeId);
	formData.set("status", entry.status);
	formData.set("score", entry.score);
	formData.set("progress", entry.progress.toString());
	formData.set("expected_user_id", saveOwnerId);

	// keepalive: 画面移動やタブを閉じた直後でも送信を完了させる
	const response = await fetch(UPSERT_WATCHLIST_ACTION, {
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
	const currentSaves = untrack(() => saveStates);
	// 保存し終えた行は読み込み直した内容に合わせる（一覧のボタンで変えた分を編集の画面にも出す）。
	// 保存待ち・保存中・失敗の行は、手元の編集を残す
	const keepsLocal = (animeId: string) => {
		const state = currentSaves[animeId]?.status;
		return state === "pending" || state === "saving" || state === "failed";
	};
	editRows = Object.fromEntries(
		data.animeList.map((anime) => [
			anime.id,
			(keepsLocal(anime.id) ? currentRows[anime.id] : undefined) ?? {
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

<svelte:head> <title>マイリスト - Anipolis</title> </svelte:head>

{#snippet visibilityHelp()}
	<p>公開: プロフィールの「マイリスト」タブで誰でも見られます（鍵アカウントならフォロワーだけ）。</p>
	<p>作品を視聴予定・視聴中・完了にすると、プロフィールやフォロワーのタイムラインの「アクティビティ」にも出ます。</p>
	<p>非公開: 自分だけが見られます。アクティビティも自分にしか見えません。</p>
	<p>非公開のマイリストは、作品のスコアやランキングに数えません。</p>
{/snippet}

<div class="page-container">
	<main class="feed-column mylist-page">
		<div class="mylist-container">
			<header class="mylist-header">
				<div class="mylist-title-row">
					<h1 class="mylist-title">マイリスト</h1>
					<div class="header-actions">
						{#if totalCount > 0}
							<div class="view-toggle" role="group" aria-label="表示の切り替え">
								<button
									type="button"
									class="view-btn"
									class:active={viewMode === 'list'}
									onclick={() => (viewMode = 'list')}
									aria-label="カードで表示"
									aria-pressed={viewMode === 'list'}
									title="カードで表示"
								>
									<span class="i-lucide-layout-grid" aria-hidden="true"></span>
								</button>
								<button
									type="button"
									class="view-btn"
									class:active={viewMode === 'edit'}
									onclick={() => (viewMode = 'edit')}
									aria-label="まとめて編集"
									aria-pressed={viewMode === 'edit'}
									title="まとめて編集"
								>
									<span class="i-lucide-pencil" aria-hidden="true"></span>
								</button>
							</div>
						{/if}

						<!-- 公開/非公開切り替え -->
						<form
							bind:this={visibilityForm}
							method="POST"
							action="?/toggleVisibility"
							use:enhance={enhanceVisibility}
						>
							<button
								type="submit"
								class="btn-secondary visibility-btn"
								disabled={visibilityState === 'saving'}
								aria-busy={visibilityState === 'saving'}
								aria-label={isPublic ? 'マイリストは公開中。非公開にする' : 'マイリストは非公開。公開する'}
								title={isPublic ? '公開中（押すと非公開にする）' : '非公開（押すと公開する）'}
							>
								{#if visibilityState === 'saving'}
									<span class="visibility-spinner" aria-hidden="true"></span>
								{:else}
									<span
										class={isPublic ? 'i-lucide-lock-open' : 'i-lucide-lock'}
										aria-hidden="true"
									></span>
								{/if}
								<span class="visibility-label">{isPublic ? '公開' : '非公開'}</span>
							</button>
						</form>
						<InfoTip label="マイリストの公開設定">{@render visibilityHelp()}</InfoTip>

						{#if totalCount > 0}
							<MylistSortSelect bind:sort compactOnMobile />
						{/if}
					</div>
				</div>

				<!-- 公開設定の切替結果・未保存の案内 -->
				{#if visibilityState === 'failed' || unsavedCount > 0}
					<div class="mylist-notices">
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
				{/if}
			</header>

			{#if totalCount === 0}
				<div class="mylist-empty">
					<p>まだアニメがありません。<a href="/anime">アニメを探す</a></p>
				</div>
			{:else}
				<!-- ステータスのタブ。一覧も編集も、選んだタブの作品だけを並べる -->
				<MylistStatusTabs counts={countMylistByStatus(grouped)} bind:status={selectedStatus} />

				<div role="tabpanel" aria-label={MYLIST_TAB_LABELS[selectedStatus]}>
					{#if grouped[selectedStatus].length === 0}
						<div class="status-empty">
							<p>{MYLIST_TAB_LABELS[selectedStatus]}にはまだ登録がありません</p>
						</div>
					{:else if viewMode === 'list'}
						<AnimeStatusSection
							animes={grouped[selectedStatus]}
							scoreLabel="自分のスコア"
							{scoreButtonFor}
							{listButtonFor}
						/>
					{:else}
						<div class="anime-list anime-list--edit">
							{#each grouped[selectedStatus] as anime (anime.id)}
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
					{/if}
				</div>
			{/if}
		</div>
	</main>

	<MyListQuickEdit
		bind:this={quickEdit}
		entryOf={(anime) => (anime as Anime).user_entry}
		removeAction="?/removeWatchlist"
	/>

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
	margin-bottom: 4px;
}

.mylist-title-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 10px;
	margin-bottom: 12px;
}

/* ほかの画面（通知など）と同じく、ページの見出しを出す（#438） */
.mylist-title {
	font-size: 1.25rem;
	font-weight: 700;
	margin: 0;
	white-space: nowrap;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

/* 表示切り替え */
.view-toggle {
	display: flex;
	flex-shrink: 0;
	height: 32px;
	background: color-mix(in srgb, var(--color-text) 8%, transparent);
	border-radius: 8px;
	padding: 3px;
	gap: 2px;
}

.view-btn {
	display: inline-grid;
	place-items: center;
	width: 30px;
	border-radius: 6px;
	font-size: 0.9rem;
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
	gap: 5px;
	height: 32px;
	padding: 0 10px;
	border-radius: 8px;
	font-size: 0.8rem;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
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
	corner-shape: round;
	animation: visibility-spin 0.8s linear infinite;
}

@keyframes visibility-spin {
	to {
		transform: rotate(360deg);
	}
}

/* 公開設定の切替結果・未保存の案内 */
.mylist-notices {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-bottom: 8px;
}

.visibility-error,
.unsaved-note {
	margin: 0;
	font-size: 0.78rem;
	line-height: 1.5;
}

.visibility-error {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 8px;
	padding: 8px 10px;
	border: 1px solid color-mix(in srgb, var(--color-danger, #f87171) 40%, transparent);
	border-radius: 12px;
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

.mylist-empty a {
	color: var(--color-accent);
}

.anime-list--edit {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.status-empty {
	text-align: center;
	padding: 48px 16px;
	color: var(--color-text-muted);
	font-size: 0.9rem;
}

/* 見出しの行に入るよう、狭い幅では詰める。さらに狭いと公開設定をアイコンだけにする（読み上げは aria-label） */
@media (max-width: 389px) {
	.header-actions {
		gap: 6px;
	}

	.view-btn {
		width: 28px;
	}

	.visibility-btn {
		padding: 0 8px;
	}
}

@media (max-width: 359px) {
	.mylist-title {
		font-size: 1.125rem;
	}

	.visibility-label {
		display: none;
	}
}
</style>
