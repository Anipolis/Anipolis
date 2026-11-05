<script lang="ts">
import type { ActionResult } from "@sveltejs/kit";
import { onDestroy, untrack } from "svelte";
import { deserialize } from "$app/forms";
import { beforeNavigate, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import AnimeProgressRow from "$lib/components/AnimeProgressRow.svelte";
import AnimeStatusSection from "$lib/components/AnimeStatusSection.svelte";
import MyListModal from "$lib/components/MyListModal.svelte";
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

let { data }: PageProps = $props();

const statusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

let viewMode = $state<"list" | "progress">("list");

// 開いているタブと並び順（URL の ?status= と ?sort=。切り替えは MylistStatusTabs と MylistSortSelect が URL に残す）
let selectedStatus = $state<MylistTab>(parseMylistTab(page.url.searchParams.get("status")));
let sort = $state<MylistSort>(parseMylistSort(page.url.searchParams.get("sort")));

const grouped = $derived(groupMylistByStatus(sortMylist(data.animeList, sort)));

// 話数を記録している間は、行の顔ぶれと並びを止める。保存のたびに行が先頭へ動いたり、完了にした行が消えたりすると、
// 続けて押せず、押し間違いも戻せない。タブ・並び順・表示を切り替えたら、その時の内容で並べ直す
const progressRowIds = $derived.by(() => {
	void viewMode;
	void sort;
	const tab = selectedStatus;
	return untrack(() => grouped[tab].map((anime) => anime.id));
});
const visibleAnimes = $derived.by(() => {
	if (viewMode === "list") return grouped[selectedStatus];
	const byId = new Map(data.animeList.map((anime) => [anime.id, anime]));
	return progressRowIds.flatMap((id) => byId.get(id) ?? []);
});

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
const failedSaveCount = $derived(Object.values(saveStates).filter((state) => state.status === "failed").length);

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

// 行の鉛筆から開く詳細のモーダル
let detailAnimeId = $state<string | null>(null);
const detailAnime = $derived(data.animeList.find((anime) => anime.id === detailAnimeId) ?? null);
// モーダルは渡した内容を全項目送るので、まだ保存し終えていない行の値を渡して古い値で上書きしない
const detailEntry = $derived.by(() => {
	const saved = detailAnime?.user_entry;
	const local = detailAnime ? editRows[detailAnime.id]?.entry : undefined;
	if (!saved || !local) return saved;
	return {
		...saved,
		status: local.status,
		score: local.score ? Number(local.score) : null,
		progress: local.progress,
	};
});

// 行の保存を送っている間にモーダルで保存や削除をすると、後から届いた行の保存に上書きされたり、外した作品が
// 登録し直されたりする。行の保存を送り切ってから開く
let detailRequest = 0;

async function openDetail(animeId: string) {
	saveQueue.flush();
	const request = ++detailRequest;
	await saveQueue.settled(animeId);
	if (request === detailRequest) detailAnimeId = animeId;
}

async function handleDetailSaved(animeId: string) {
	// 行に残っていた保存待ち・失敗は、モーダルの内容に置き換わった
	cancelAutoSave(animeId);
	await invalidateAll();
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

<div class="page-container">
	<main class="feed-column mylist-page">
		<div class="mylist-container">
			<header class="mylist-header">
				<div class="mylist-title-row">
					<div class="mylist-title-group">
						<h1 class="mylist-title">マイリスト</h1>
						{#if !data.profile.list_is_public}
							<a
								href="/settings/privacy"
								class="private-badge"
								title="非公開（設定を開く）"
								aria-label="非公開（設定を開く）"
							>
								<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>
								<span class="private-badge-label">非公開</span>
							</a>
						{/if}
					</div>
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
									class:active={viewMode === 'progress'}
									onclick={() => (viewMode = 'progress')}
									aria-label="話数を記録"
									aria-pressed={viewMode === 'progress'}
									title="話数を記録"
								>
									<span class="i-lucide-list" aria-hidden="true"></span>
								</button>
							</div>
						{/if}

						{#if totalCount > 0}
							<MylistSortSelect bind:sort />
						{/if}
					</div>
				</div>

				<!-- 失敗したときだけ出す。保存待ちや保存中で出すと、話数を押すたびに一覧がずれて次のボタンを押し損ねる -->
				{#if failedSaveCount > 0}
					<p class="unsaved-note" role="status" aria-live="polite">
						保存できなかった変更が{failedSaveCount}件あります。再試行するまで保存されません。
					</p>
				{/if}
			</header>

			{#if totalCount === 0}
				<div class="mylist-empty">
					<p>まだアニメがありません。<a href="/anime">アニメを探す</a></p>
					{#if data.profile.list_is_public}
						<p class="mylist-empty-note">
							マイリストは他の人もプロフィールで見られます。<a href="/settings/privacy"
								>設定</a
							>で非公開にできます
						</p>
					{/if}
				</div>
			{:else}
				<!-- ステータスのタブ。一覧も編集も、選んだタブの作品だけを並べる -->
				<MylistStatusTabs counts={countMylistByStatus(grouped)} bind:status={selectedStatus} />

				<div role="tabpanel" aria-label={MYLIST_TAB_LABELS[selectedStatus]}>
					{#if visibleAnimes.length === 0}
						<div class="status-empty">
							<p>{MYLIST_TAB_LABELS[selectedStatus]}にはまだ登録がありません</p>
						</div>
					{:else if viewMode === 'list'}
						<AnimeStatusSection
							animes={visibleAnimes}
							scoreLabel="自分のスコア"
							{scoreButtonFor}
							{listButtonFor}
						/>
					{:else}
						<div class="anime-list anime-list--progress">
							{#each visibleAnimes as anime (anime.id)}
								{@const editRow = editRows[anime.id]}
								{#if editRow}
									<AnimeProgressRow
										{anime}
										entry={editRow.entry}
										{statusLabel}
										saveState={saveStates[anime.id]}
										onAutoSave={(updatedFields) => handleAutoSave(anime.id, updatedFields)}
										onRetry={() => retryAutoSave(anime.id)}
										onOpenDetail={() => openDetail(anime.id)}
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

	{#if detailAnime}
		<MyListModal
			open
			animeId={detailAnime.id}
			animeTitle={detailAnime.title}
			episodeCount={detailAnime.episode_count}
			entry={detailEntry}
			removeAction="?/removeWatchlist"
			onsaved={(_entry, animeId) => handleDetailSaved(animeId)}
			onclose={() => {
				detailAnimeId = null;
			}}
		/>
	{/if}

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
	gap: 10px;
	margin-bottom: 12px;
}

.mylist-title-group {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
}

/* 非公開のときだけ出す印。公開が既定なので、公開中は何も出さない */
.private-badge {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	color: var(--color-text-muted);
	font-size: 0.75rem;
	font-weight: 600;
	text-decoration: none;
}

.private-badge:hover {
	color: var(--color-text);
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
	min-width: 0;
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

.unsaved-note {
	margin: 0;
	padding-bottom: 8px;
	color: var(--color-text-muted);
	font-size: 0.78rem;
	line-height: 1.5;
}

.mylist-empty {
	text-align: center;
	padding: 60px 0;
	color: var(--color-text-muted);
}

.mylist-empty a {
	color: var(--color-accent);
}

.mylist-empty-note {
	margin: 8px 0 0;
	font-size: 0.8rem;
}

.anime-list--progress {
	display: flex;
	flex-direction: column;
}

.status-empty {
	text-align: center;
	padding: 48px 16px;
	color: var(--color-text-muted);
	font-size: 0.9rem;
}

/* 見出しの行に入るよう、スマホでは非公開の印をアイコンだけにする（読み上げは aria-label） */
@media (max-width: 600px) {
	.private-badge-label {
		display: none;
	}
}

/* 並び替えの文字が切れないよう、狭い幅では詰める */
@media (max-width: 389px) {
	.mylist-title-row {
		gap: 6px;
	}

	.mylist-title-group {
		gap: 4px;
	}

	.header-actions {
		gap: 6px;
	}

	.view-btn {
		width: 26px;
	}
}
</style>
