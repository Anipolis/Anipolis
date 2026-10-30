<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { trapFocus } from "$lib/actions/trapFocus";
import { MYLIST_NOTE_MAX_LENGTH } from "$lib/mylist/entry-details";
import { savedEntryFromResult } from "$lib/mylist/entry-from-form";
import type { AnimeStatus, UserAnimeEntry } from "$lib/types";
import { jstDateKey } from "$lib/utils/jst";

type Props = {
	open: boolean;
	animeId: string | number;
	animeTitle: string;
	episodeCount?: string | null;
	entry?: UserAnimeEntry | null | undefined;
	action?: string;
	variant?: "full" | "status-only";
	/** 渡すと、登録済みの作品に「マイリストから外す」を出す */
	removeAction?: string;
	/** 渡すと保存後にページを読み込み直さず、保存した内容を知らせる（外したときは null） */
	onsaved?: (entry: UserAnimeEntry | null, animeId: string) => void;
	onclose: () => void;
};

let {
	open,
	animeId,
	animeTitle,
	episodeCount = null,
	entry = null,
	action = "?/upsertWatchlist",
	variant = "full",
	removeAction,
	onsaved,
	onclose,
}: Props = $props();

const statusOptions: { value: AnimeStatus; label: string }[] = [
	{ value: "plan_to_watch", label: "視聴予定" },
	{ value: "watching", label: "視聴中" },
	{ value: "completed", label: "完了" },
	{ value: "on_hold", label: "中断" },
	{ value: "dropped", label: "断念" },
];

// 未登録の作品は、どの視聴ステータスも選んでいない状態で開く（「視聴予定」が選ばれていると、
// 視聴予定に分類した作品なのか、まだ分類していないのかが分からないため）
let selectedStatus = $state<AnimeStatus | null>(null);
let score = $state<number | null>(null);
let progress = $state(0);
// 見始めた日・見終えた日・メモ（180）。日付は input[type=date] の値（YYYY-MM-DD、空なら未入力）
let startedOn = $state("");
let finishedOn = $state("");
let note = $state("");
// 視聴ステータスを選んだときに今日で埋めた日付。別のステータスに選び直したら消す（手で直したら残す）
let autoStarted = false;
let autoFinished = false;
// 開くかどうかはモーダルを開いたときにだけ決める（自動入力で開くと、保存ボタンが下へ押し出される）
let recordOpen = $state(false);
let submitting = $state(false);
let errorMessage = $state("");
let initializedFor: string | null = null;
let totalEpisodes = $derived(parseEpisodeCount(episodeCount));
let statusOnly = $derived(variant === "status-only");
// 登録済みなのに日付・メモを読み込んでいない画面では、欄を出さない（送らなければ保存でも触らない）
let showRecord = $derived(!statusOnly && (entry == null || entry.note !== undefined));
// 作品ページではモーダルが閉じていても残るので、開くたびに今日を取り直す（日付をまたいでも前日を入れない）
let today = $state(jstDateKey(new Date()));
$effect(() => {
	if (open) today = jstDateKey(new Date());
});
// 閉じているときも中身が分かるよう、見出しの横に短く出す（今年の日付は月/日だけ）
let recordSummary = $derived(
	[
		startedOn && `見始めた日 ${shortDate(startedOn)}`,
		finishedOn && `見終えた日 ${shortDate(finishedOn)}`,
		note.trim() && "メモあり",
	]
		.filter(Boolean)
		.join(" · "),
);

function shortDate(value: string): string {
	const [year, month, day] = value.split("-").map(Number);
	return value.slice(0, 4) === today.slice(0, 4) ? `${month}/${day}` : `${year}/${month}/${day}`;
}

function parseEpisodeCount(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clampProgress(value: number): number {
	const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
	return totalEpisodes == null ? normalized : Math.min(normalized, totalEpisodes);
}

function setProgress(value: number) {
	progress = clampProgress(value);
	if (totalEpisodes != null && progress === totalEpisodes) selectStatus("completed");
}

// 「視聴中」で見始めた日、「完了」で見終えた日が空なら今日を入れる（保存時に DB のトリガーも同じことをする）
function selectStatus(value: AnimeStatus) {
	selectedStatus = value;
	if (autoStarted && value !== "watching") {
		startedOn = "";
		autoStarted = false;
	}
	if (autoFinished && value !== "completed") {
		finishedOn = "";
		autoFinished = false;
	}
	if (value === entry?.status) return;
	if (value === "watching" && !startedOn && (!finishedOn || finishedOn >= today)) {
		startedOn = today;
		autoStarted = true;
	}
	if (value === "completed" && !finishedOn && (!startedOn || startedOn <= today)) {
		finishedOn = today;
		autoFinished = true;
	}
}

function handleProgressInput(event: Event) {
	setProgress(Number((event.currentTarget as HTMLInputElement).value));
}

const handleSubmit: SubmitFunction = ({ formData, submitter }) => {
	const removing = submitter?.hasAttribute("data-remove") === true;
	submitting = true;
	errorMessage = "";
	return async ({ result }) => {
		submitting = false;
		if (result.type === "failure") {
			errorMessage = (result.data as { message?: string })?.message ?? "マイリストの保存に失敗しました";
			return;
		}
		if (result.type === "error") {
			errorMessage = "マイリストの保存に失敗しました";
			return;
		}
		// 保存した作品の ID も渡す（応答が来るまでに親が別の作品へ移っていることがある）
		if (onsaved)
			onsaved(
				removing
					? null
					: savedEntryFromResult(result.type === "success" ? result.data : undefined, formData, entry),
				String(formData.get("anime_id")),
			);
		else await invalidateAll();
		onclose();
	};
};

function resetFromEntry(key: string) {
	initializedFor = key;
	selectedStatus = entry?.status ?? null;
	score = entry?.score != null && entry.score > 0 ? Math.round(entry.score) : null;
	progress = clampProgress(entry?.progress ?? 0);
	startedOn = entry?.started_on ?? "";
	finishedOn = entry?.finished_on ?? "";
	note = entry?.note ?? "";
	autoStarted = false;
	autoFinished = false;
	recordOpen = Boolean(startedOn || finishedOn || note);
	errorMessage = "";
}

function entryKey(): string {
	return `${animeId}:${entry?.updated_at ?? "new"}`;
}

// 最初のフレームから登録済みの値で描画する。effect で入れると初回描画が「視聴予定」になり、
// ボタンの background トランジションで一瞬見えてしまう。
resetFromEntry(entryKey());

// 開いている間は登録内容が更新されたときだけ同期し、編集中の値を上書きしない。
// 閉じたら登録内容に戻しておき、次に開いた最初のフレームも正しい値で出す。
// initializedFor は $state にしない(effect 内で読み書きすると自己無効化になる)。
$effect(() => {
	const key = entryKey();
	if (open && initializedFor === key) return;
	resetFromEntry(key);
});

$effect(() => {
	if (!open) return;
	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape" && !submitting) onclose();
	};
	window.addEventListener("keydown", handleKeydown);
	return () => window.removeEventListener("keydown", handleKeydown);
});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" role="presentation" onclick={() => !submitting && onclose()}>
		<div
			class="modal-card"
			class:modal-card--compact={statusOnly}
			role="dialog"
			aria-modal="true"
			aria-labelledby="mylist-modal-title"
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
		>
			<header class="modal-header">
				<h2 id="mylist-modal-title">{statusOnly ? "マイリストに追加" : "マイリスト登録・編集"}</h2>
				<p>{animeTitle}</p>
			</header>

			<form method="POST" {action} use:enhance={handleSubmit}>
				<input type="hidden" name="anime_id" value={animeId}>
				<input type="hidden" name="status" value={selectedStatus ?? ""}>
				<input type="hidden" name="score" value={score ?? ""}>
				<input type="hidden" name="progress" value={progress}>
				<!-- 中身だけをスクロールさせ、見出しと保存・キャンセルはいつも見えるようにする -->
				<div class="modal-body">
					{#if !statusOnly}
						<section class="field-section" aria-labelledby="score-label">
							<div class="section-heading">
								<h3 id="score-label">スコア</h3>
								<span>{score ?? "未評価"}</span>
							</div>
							<div class="score-grid">
								{#each Array.from({ length: 10 }, (_, i) => i + 1) as value}
									<button
										type="button"
										class:active={score === value}
										aria-pressed={score === value}
										onclick={() => (score = score === value ? null : value)}
									>
										{value}
									</button>
								{/each}
							</div>
						</section>

						<section class="field-section" aria-labelledby="progress-label">
							<div class="section-heading"><h3 id="progress-label">視聴進捗</h3></div>
							<div class="stepper">
								<button
									type="button"
									aria-label="進捗を1話戻す"
									disabled={progress <= 0}
									onclick={() => setProgress(progress - 1)}
								>
									−
								</button>
								<label>
									<span class="sr-only">現在の話数</span>
									<input
										type="number"
										min="0"
										max={totalEpisodes ?? undefined}
										value={progress}
										oninput={handleProgressInput}
									>
								</label>
								<button
									type="button"
									aria-label="進捗を1話進める"
									disabled={totalEpisodes != null && progress >= totalEpisodes}
									onclick={() => setProgress(progress + 1)}
								>
									＋
								</button>
								<span class="episode-total"
									>/ {totalEpisodes != null ? `${totalEpisodes}話` : "全話数未定"}</span
								>
							</div>
						</section>
					{/if}

					<section class="field-section" aria-labelledby="status-label">
						<div class="section-heading"><h3 id="status-label">視聴ステータス</h3></div>
						<div class="status-grid">
							{#each statusOptions as option}
								<button
									type="button"
									data-status={option.value}
									class:active={selectedStatus === option.value}
									aria-pressed={selectedStatus === option.value}
									onclick={() => selectStatus(option.value)}
								>
									{option.label}
								</button>
							{/each}
						</div>
					</section>

					{#if showRecord}
						<!-- ふだんは閉じておく。日付かメモが入っていれば開いた状態で出す -->
						<details class="record-details" bind:open={recordOpen}>
							<summary>
								日付・メモ
								{#if !recordOpen && recordSummary}
									<span class="record-summary">{recordSummary}</span>
								{/if}
							</summary>
							<div class="date-row">
								<label class="date-field">
									<span>見始めた日</span>
									<input
										type="date"
										name="started_on"
										max={finishedOn || today}
										bind:value={startedOn}
										oninput={() => (autoStarted = false)}
									>
								</label>
								<label class="date-field">
									<span>見終えた日</span>
									<input
										type="date"
										name="finished_on"
										min={startedOn || undefined}
										max={today}
										bind:value={finishedOn}
										oninput={() => (autoFinished = false)}
									>
								</label>
							</div>
							<label class="note-field">
								<span class="note-label">
									メモ
									<small>自分だけに見えます</small>
								</span>
								<textarea
									name="note"
									rows="3"
									maxlength={MYLIST_NOTE_MAX_LENGTH}
									placeholder="見たきっかけ、止めた理由など"
									bind:value={note}
								></textarea>
								<span class="note-count">{[...note].length} / {MYLIST_NOTE_MAX_LENGTH}</span>
							</label>
						</details>
					{/if}

					{#if entry && removeAction}
						<!-- 保存・キャンセルと並べるとスマホで入りきらないので、別の行にする -->
						<div class="remove-row">
							<button
								type="submit"
								formaction={removeAction}
								class="remove-button"
								data-remove
								disabled={submitting}
							>
								マイリストから外す
							</button>
						</div>
					{/if}

					{#if errorMessage}
						<p class="form-error" role="alert">{errorMessage}</p>
					{:else if selectedStatus === null}
						<p class="status-hint">視聴ステータスを選んでください</p>
					{/if}
				</div>
				<footer class="modal-footer">
					<button type="button" class="cancel-button" disabled={submitting} onclick={onclose}>
						キャンセル
					</button>
					<button type="submit" class="save-button" disabled={submitting || selectedStatus === null}>
						{submitting ? "保存中…" : "✓ 保存する"}
					</button>
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
.status-hint {
	margin: 14px 0 0;
	color: var(--color-text-muted);
	font-size: 0.82rem;
}
.modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: grid;
	place-items: center;
	padding: 16px;
	background: rgb(0 0 0 / 72%);
	backdrop-filter: blur(6px);
}
.modal-card {
	display: flex;
	flex-direction: column;
	width: min(100%, 520px);
	max-height: min(760px, calc(100dvh - 32px));
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 24px;
	background: var(--color-bg);
	color: var(--color-text);
	box-shadow: 0 24px 80px rgb(0 0 0 / 48%);
}
.modal-card--compact {
	width: min(100%, 420px);
}
.modal-header {
	padding: 22px 24px 18px;
	border-bottom: 1px solid var(--color-border);
}
.modal-header h2 {
	margin: 0;
	font-size: 1.15rem;
	letter-spacing: 0.01em;
}
.modal-header p {
	margin: 5px 0 0;
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 0.82rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}
form {
	display: flex;
	flex-direction: column;
	min-height: 0;
}
.modal-body {
	min-height: 0;
	overflow-y: auto;
	padding: 4px 24px 0;
}
.modal-card--compact .modal-body {
	padding-top: 2px;
}
.field-section {
	padding: 18px 0;
	border-bottom: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
}
.modal-card--compact .field-section {
	padding-bottom: 8px;
	border-bottom: 0;
}
.section-heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 11px;
}
.section-heading h3 {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-muted);
	font-weight: 650;
	letter-spacing: 0.04em;
}
.section-heading span {
	color: var(--color-accent);
	font-size: 0.76rem;
	font-weight: 700;
}
.score-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.score-grid button {
	width: 38px;
	height: 38px;
	border: 1px solid var(--color-border);
	border-radius: 14px;
	background: var(--color-surface);
	color: var(--color-text-muted);
	cursor: pointer;
	font-weight: 650;
	transition:
		transform 0.12s,
		background 0.12s,
		border-color 0.12s;
}
.score-grid button:hover,
.status-grid button:hover {
	border-color: var(--color-border-hover);
	color: var(--color-text);
}
.score-grid button:active,
.status-grid button:active,
.stepper button:active {
	transform: scale(0.96);
}
/* 視聴ステータスも状態ごとの色にせず、スコアと同じ色で示す */
.score-grid button.active,
.status-grid button.active {
	border-color: var(--color-accent);
	background: var(--color-accent);
	color: var(--color-bg);
	font-weight: 800;
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
}
.stepper {
	display: flex;
	align-items: center;
	gap: 9px;
}
.stepper button {
	width: 44px;
	height: 44px;
	border: 1px solid var(--color-border);
	border-radius: 18px;
	background: var(--color-surface);
	color: var(--color-text);
	cursor: pointer;
	font-size: 1.25rem;
	font-weight: 700;
	transition:
		transform 0.12s,
		background 0.12s;
}
.stepper button:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.stepper button:disabled {
	cursor: not-allowed;
	opacity: 0.35;
}
.stepper input {
	width: 66px;
	height: 44px;
	border: 1px solid var(--color-border);
	border-radius: 18px;
	outline: none;
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 1rem;
	font-weight: 750;
	text-align: center;
	/* ブラウザ標準の上下矢印は出さない（−/＋ボタンがあり、矢印の分だけ数字が左に寄るため） */
	appearance: textfield;
	-moz-appearance: textfield;
}
.stepper input::-webkit-inner-spin-button,
.stepper input::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}
.stepper input:focus {
	border-color: var(--color-accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}
.stepper input:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.episode-total {
	color: var(--color-text-muted);
	font-size: 0.82rem;
	white-space: nowrap;
}
.status-grid {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 8px;
}
.status-grid button {
	grid-column: span 2;
	min-height: 44px;
	border: 1px solid var(--color-border);
	border-radius: 16px;
	background: var(--color-surface);
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 0.84rem;
	font-weight: 650;
	transition:
		transform 0.12s,
		background 0.12s,
		border-color 0.12s;
}
.status-grid button:nth-child(4) {
	grid-column: 2 / span 2;
}
.status-grid button:nth-child(5) {
	grid-column: 4 / span 2;
}
.form-error {
	margin: 14px 0 0;
	color: var(--color-error-text);
	font-size: 0.82rem;
}
/* 中身が長くても保存・キャンセルはいつも見えるよう、スクロールの外（モーダルの下）に置く */
.modal-footer {
	flex-shrink: 0;
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 16px;
	padding: 14px 24px 20px;
	border-top: 1px solid var(--color-border);
	background: var(--color-bg);
}
.modal-footer button {
	min-height: 44px;
	border-radius: 16px;
	padding: 0 18px;
	cursor: pointer;
	font-weight: 750;
}
.cancel-button {
	border: 1px solid var(--color-border-hover);
	background: transparent;
	color: var(--color-text-muted);
}
.cancel-button:hover:not(:disabled) {
	background: var(--color-hover);
	color: var(--color-text);
}
.remove-row {
	display: flex;
	justify-content: center;
	padding-top: 12px;
}
.remove-button {
	min-height: 36px;
	padding: 0 12px;
	border: 0;
	border-radius: 12px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 0.82rem;
	font-weight: 600;
}
.remove-button:hover:not(:disabled) {
	background: var(--color-hover);
	color: var(--color-error-text);
}
.remove-button:disabled {
	cursor: wait;
	opacity: 0.6;
}
.save-button {
	border: 1px solid var(--color-accent);
	background: var(--color-accent);
	color: var(--color-bg);
	box-shadow: 0 8px 24px color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.save-button:hover:not(:disabled) {
	border-color: var(--color-accent-hover);
	background: var(--color-accent-hover);
}
.modal-footer button:disabled {
	cursor: wait;
	opacity: 0.6;
}
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
@media (max-width: 520px) {
	.modal-backdrop {
		align-items: end;
		padding: 0;
	}
	.modal-card {
		width: 100%;
		max-height: calc(100dvh - 24px);
		border-radius: 28px 28px 0 0;
	}
	.modal-header {
		padding: 20px 18px 16px;
	}
	.modal-body {
		padding: 2px 18px 0;
	}
	.score-grid {
		justify-content: space-between;
	}
	.score-grid button {
		width: calc(20% - 5px);
	}
	.modal-footer {
		padding: 14px 18px calc(14px + env(safe-area-inset-bottom));
	}
}
/* 下は保存・キャンセルの段の線で区切られるので、線を重ねない */
.record-details {
	padding: 14px 0 0;
}
.record-details summary {
	width: fit-content;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 0.82rem;
	font-weight: 650;
	letter-spacing: 0.04em;
}
.record-details summary:hover {
	color: var(--color-text);
}
.record-summary {
	margin-left: 8px;
	color: var(--color-text-muted);
	font-size: 0.76rem;
	font-weight: 500;
	letter-spacing: 0;
}
.date-row {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	margin-top: 12px;
}
.date-field,
.note-field {
	display: grid;
	gap: 6px;
	color: var(--color-text-muted);
	font-size: 0.76rem;
	font-weight: 650;
}
.date-field input,
.note-field textarea {
	width: 100%;
	min-width: 0;
	box-sizing: border-box;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	color: var(--color-text);
	font: inherit;
	font-size: 0.9rem;
	font-weight: 500;
	color-scheme: inherit;
}
.date-field input {
	height: 40px;
	padding: 0 10px;
}
.note-field {
	margin-top: 12px;
}
.note-label {
	display: flex;
	align-items: baseline;
	gap: 8px;
}
.note-label small {
	font-size: 0.72rem;
	font-weight: 500;
}
.note-field textarea {
	padding: 9px 11px;
	line-height: 1.5;
	resize: vertical;
}
.date-field input:focus-visible,
.note-field textarea:focus-visible {
	border-color: var(--color-accent);
	outline: none;
}
.note-count {
	justify-self: end;
	font-size: 0.7rem;
	font-weight: 500;
}
</style>
