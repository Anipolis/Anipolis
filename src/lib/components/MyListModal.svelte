<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { trapFocus } from "$lib/actions/trapFocus";
import type { AnimeStatus, UserAnimeEntry } from "$lib/types";

type Props = {
	open: boolean;
	animeId: string | number;
	animeTitle: string;
	episodeCount?: string | null;
	entry?: UserAnimeEntry | null | undefined;
	action?: string;
	variant?: "full" | "status-only";
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
	onclose,
}: Props = $props();

const statusOptions: { value: AnimeStatus; label: string }[] = [
	{ value: "plan_to_watch", label: "視聴予定" },
	{ value: "watching", label: "視聴中" },
	{ value: "completed", label: "完了" },
	{ value: "on_hold", label: "中断" },
	{ value: "dropped", label: "断念" },
];

let selectedStatus = $state<AnimeStatus>("plan_to_watch");
let score = $state<number | null>(null);
let progress = $state(0);
let submitting = $state(false);
let errorMessage = $state("");
let initializedFor = $state<string | null>(null);
let totalEpisodes = $derived(parseEpisodeCount(episodeCount));
let statusOnly = $derived(variant === "status-only");

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
	if (totalEpisodes != null && progress === totalEpisodes) selectedStatus = "completed";
}

function handleProgressInput(event: Event) {
	setProgress(Number((event.currentTarget as HTMLInputElement).value));
}

const handleSubmit: SubmitFunction = () => {
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
		await invalidateAll();
		onclose();
	};
};

$effect(() => {
	if (!open) {
		initializedFor = null;
		return;
	}
	const key = `${animeId}:${entry?.updated_at ?? "new"}`;
	if (initializedFor === key) return;
	initializedFor = key;
	selectedStatus = entry?.status ?? "plan_to_watch";
	score = entry?.score != null && entry.score > 0 ? Math.round(entry.score) : null;
	progress = clampProgress(entry?.progress ?? 0);
	errorMessage = "";
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
				<input type="hidden" name="status" value={selectedStatus}>
				<input type="hidden" name="score" value={score ?? ""}>
				<input type="hidden" name="progress" value={progress}>

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
								onclick={() => (selectedStatus = option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</section>

				{#if errorMessage}
					<p class="form-error" role="alert">{errorMessage}</p>
				{/if}

				<footer class="modal-footer">
					<button type="button" class="cancel-button" disabled={submitting} onclick={onclose}>
						キャンセル
					</button>
					<button type="submit" class="save-button" disabled={submitting}>
						{submitting ? "保存中…" : "✓ 保存する"}
					</button>
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
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
	width: min(100%, 520px);
	max-height: min(760px, calc(100dvh - 32px));
	overflow-y: auto;
	border: 1px solid var(--color-border);
	border-radius: 18px;
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
	padding: 4px 24px 22px;
}
.modal-card--compact form {
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
	border-radius: 10px;
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
.score-grid button.active {
	border-color: var(--color-accent);
	background: var(--color-accent);
	color: var(--color-bg);
	font-weight: 800;
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
}
.status-grid button.active {
	color: var(--color-bg);
	font-weight: 800;
}
.status-grid button[data-status="plan_to_watch"].active {
	border-color: var(--status-plan);
	background: var(--status-plan);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-plan) 20%, transparent);
}
.status-grid button[data-status="watching"].active {
	border-color: var(--status-watching);
	background: var(--status-watching);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-watching) 20%, transparent);
}
.status-grid button[data-status="completed"].active {
	border-color: var(--color-accent);
	background: var(--color-accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
}
.status-grid button[data-status="on_hold"].active {
	border-color: var(--status-on-hold);
	background: var(--status-on-hold);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-on-hold) 20%, transparent);
}
.status-grid button[data-status="dropped"].active {
	border-color: var(--status-dropped);
	background: var(--status-dropped);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-dropped) 20%, transparent);
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
	border-radius: 12px;
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
	border-radius: 12px;
	outline: none;
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 1rem;
	font-weight: 750;
	text-align: center;
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
	border-radius: 11px;
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
.modal-footer {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	padding-top: 20px;
}
.modal-footer button {
	min-height: 44px;
	border-radius: 11px;
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
		border-radius: 20px 20px 0 0;
	}
	.modal-header {
		padding: 20px 18px 16px;
	}
	form {
		padding: 2px 18px 18px;
	}
	.score-grid {
		justify-content: space-between;
	}
	.score-grid button {
		width: calc(20% - 5px);
	}
	.modal-footer {
		position: sticky;
		bottom: -18px;
		margin: 0 -18px -18px;
		padding: 14px 18px calc(14px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
	}
}
</style>
