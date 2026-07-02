<script lang="ts">
import { trapFocus } from "$lib/actions/trapFocus";
import type { RoomExitSurveyComparisonWithX, RoomExitSurveyNextParticipation } from "$lib/types";

type SurveyAnswers = {
	overallRating: number;
	sharedExperienceRating: number;
	readabilityRating: number;
	nextParticipation: RoomExitSurveyNextParticipation;
	comparisonWithX: RoomExitSurveyComparisonWithX;
	goodPoints: string | null;
	improvementPoints: string | null;
};

type RatingField = "overallRating" | "sharedExperienceRating" | "readabilityRating";

type Props = {
	submitting?: boolean;
	errorMessage?: string | null;
	onSubmit: (answers: SurveyAnswers) => void;
	onSkip: () => void;
};

let { submitting = false, errorMessage = null, onSubmit, onSkip }: Props = $props();

let overallRating: number | null = $state(null);
let sharedExperienceRating: number | null = $state(null);
let readabilityRating: number | null = $state(null);
let nextParticipation: RoomExitSurveyNextParticipation | "" = $state("");
let comparisonWithX: RoomExitSurveyComparisonWithX | "" = $state("");
let goodPoints = $state("");
let improvementPoints = $state("");

const ratingLabels: Record<RatingField, string> = {
	overallRating: "今回の実況ルームは楽しかったですか？",
	sharedExperienceRating: "他の人と一緒に見ている感覚はありましたか？",
	readabilityRating: "投稿の流れは見やすかったですか？",
};

const ratingCaptions: Record<RatingField, [string, string, string]> = {
	overallRating: ["楽しくなかった", "どちらともいえない", "とても楽しかった"],
	sharedExperienceRating: ["なかった", "どちらともいえない", "強くあった"],
	readabilityRating: ["見づらかった", "どちらともいえない", "とても見やすかった"],
};

const nextParticipationOptions: Array<{ value: RoomExitSurveyNextParticipation; label: string }> = [
	{ value: "must_join", label: "必ず参加したい" },
	{ value: "want_join", label: "できれば参加したい" },
	{ value: "not_sure", label: "わからない" },
	{ value: "not_really", label: "あまり参加したくない" },
	{ value: "not_join", label: "参加したくない" },
];

const comparisonOptions: Array<{ value: RoomExitSurveyComparisonWithX; label: string }> = [
	{ value: "anipolis_better", label: "Anipolisの方がよい" },
	{ value: "anipolis_slightly_better", label: "どちらかといえばAnipolis" },
	{ value: "same", label: "どちらともいえない" },
	{ value: "x_slightly_better", label: "どちらかといえばX / Twitter" },
	{ value: "x_better", label: "X / Twitterの方がよい" },
	{ value: "cannot_compare", label: "普段X / Twitterで実況しないので比較できない" },
];

const canSubmit = $derived(
	overallRating != null &&
		sharedExperienceRating != null &&
		readabilityRating != null &&
		nextParticipation !== "" &&
		comparisonWithX !== "",
);

function ratingValue(field: RatingField) {
	if (field === "overallRating") return overallRating;
	if (field === "sharedExperienceRating") return sharedExperienceRating;
	return readabilityRating;
}

function setRating(field: RatingField, value: number) {
	if (field === "overallRating") overallRating = value;
	else if (field === "sharedExperienceRating") sharedExperienceRating = value;
	else readabilityRating = value;
}

function moveRating(field: RatingField, direction: -1 | 1) {
	const current = ratingValue(field) ?? 3;
	setRating(field, Math.min(5, Math.max(1, current + direction)));
}

function handleRatingKeydown(event: KeyboardEvent, field: RatingField, value: number) {
	if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
		event.preventDefault();
		moveRating(field, -1);
	} else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
		event.preventDefault();
		moveRating(field, 1);
	} else if (event.key === "Home") {
		event.preventDefault();
		setRating(field, 1);
	} else if (event.key === "End") {
		event.preventDefault();
		setRating(field, 5);
	} else if (event.key === " " || event.key === "Enter") {
		event.preventDefault();
		setRating(field, value);
	}
}

function trimOptionalText(value: string) {
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, 1000) : null;
}

function submit() {
	if (!canSubmit || submitting) return;
	onSubmit({
		overallRating: overallRating ?? 3,
		sharedExperienceRating: sharedExperienceRating ?? 3,
		readabilityRating: readabilityRating ?? 3,
		nextParticipation: nextParticipation as RoomExitSurveyNextParticipation,
		comparisonWithX: comparisonWithX as RoomExitSurveyComparisonWithX,
		goodPoints: trimOptionalText(goodPoints),
		improvementPoints: trimOptionalText(improvementPoints),
	});
}
</script>

<div class="survey-backdrop" role="presentation">
	<div
		class="survey-modal"
		use:trapFocus
		role="dialog"
		aria-modal="true"
		aria-labelledby="exit-survey-title"
		tabindex="-1"
	>
		<div class="survey-header">
			<h2 id="exit-survey-title">ご参加ありがとうございました！</h2>
			<p>
				今回の実況ルームについて、1分だけ感想を教えてください。<br>
				今後の改善に使わせていただきます。
			</p>
		</div>

		<div class="survey-body">
			{#each Object.keys(ratingLabels) as field (field)}
				{@const ratingField = field as RatingField}
				<section class="survey-question">
					<h3>{ratingLabels[ratingField]}</h3>
					<div class="rating-row" role="radiogroup" aria-label={ratingLabels[ratingField]}>
						{#each [1, 2, 3, 4, 5] as value}
							{@const selected = ratingValue(ratingField) === value}
							<button
								type="button"
								role="radio"
								class:active={selected}
								aria-checked={selected}
								tabindex={selected || (ratingValue(ratingField) == null && value === 1) ? 0 : -1}
								disabled={submitting}
								onclick={() => setRating(ratingField, value)}
								onkeydown={(event) => handleRatingKeydown(event, ratingField, value)}
							>
								{value}
							</button>
						{/each}
					</div>
					<div class="rating-caption">
						<span>{ratingCaptions[ratingField][0]}</span>
						<span>{ratingCaptions[ratingField][1]}</span>
						<span>{ratingCaptions[ratingField][2]}</span>
					</div>
				</section>
			{/each}

			<section class="survey-question">
				<h3>次回も同じ作品の実況ルームがあれば参加したいですか？</h3>
				<div class="option-stack">
					{#each nextParticipationOptions as option}
						<label class="option-row">
							<input
								type="radio"
								name="next-participation"
								value={option.value}
								bind:group={nextParticipation}
								disabled={submitting}
							>
							<span>{option.label}</span>
						</label>
					{/each}
				</div>
			</section>

			<section class="survey-question">
				<h3>X / Twitterで実況する場合と比べてどうでしたか？</h3>
				<div class="option-stack">
					{#each comparisonOptions as option}
						<label class="option-row">
							<input
								type="radio"
								name="comparison-with-x"
								value={option.value}
								bind:group={comparisonWithX}
								disabled={submitting}
							>
							<span>{option.label}</span>
						</label>
					{/each}
				</div>
			</section>

			<label class="text-question">
				<span>よかった点があれば教えてください</span>
				<textarea bind:value={goodPoints} maxlength="1000" rows="3" disabled={submitting}></textarea>
			</label>

			<label class="text-question">
				<span>使いにくかった点・改善してほしい点があれば教えてください</span>
				<textarea bind:value={improvementPoints} maxlength="1000" rows="3" disabled={submitting}></textarea>
			</label>
		</div>

		{#if errorMessage}
			<p class="survey-error">{errorMessage}</p>
		{/if}

		<div class="survey-actions">
			<button class="skip-button" type="button" disabled={submitting} onclick={onSkip}>スキップして退出</button>
			<button class="submit-button" type="button" disabled={!canSubmit || submitting} onclick={submit}>
				{submitting ? "送信中..." : "送信して退出"}
			</button>
		</div>
	</div>
</div>

<style>
.survey-backdrop {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: grid;
	place-items: center;
	background: rgb(0 0 0 / 0.54);
	padding: 16px;
}

.survey-modal {
	display: flex;
	width: min(640px, 100%);
	max-height: min(88dvh, 760px);
	flex-direction: column;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.34);
	color: var(--color-text);
	overflow: hidden;
}

.survey-header {
	padding: 20px 22px 14px;
	border-bottom: 1px solid var(--color-border);
}

.survey-header h2 {
	margin: 0 0 8px;
	font-size: 20px;
	line-height: 1.3;
}

.survey-header p {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 14px;
	line-height: 1.7;
}

.survey-body {
	display: grid;
	gap: 18px;
	padding: 18px 22px;
	overflow-y: auto;
}

.survey-question h3,
.text-question span {
	display: block;
	margin: 0 0 10px;
	font-size: 14px;
	font-weight: 800;
	line-height: 1.5;
}

.rating-row {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 6px;
}

.rating-row button {
	min-width: 0;
	min-height: 38px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	font-weight: 800;
}

.rating-row button.active {
	border-color: var(--color-accent);
	background: var(--color-accent);
	color: white;
}

.rating-caption {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	margin-top: 7px;
	color: var(--color-text-muted);
	font-size: 11px;
	line-height: 1.3;
}

.rating-caption span:nth-child(2) {
	text-align: center;
}

.rating-caption span:last-child {
	text-align: right;
}

.option-stack {
	display: grid;
	gap: 8px;
}

.option-row {
	display: flex;
	align-items: center;
	gap: 9px;
	min-height: 36px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	padding: 8px 10px;
	font-size: 14px;
	line-height: 1.35;
}

.option-row input {
	flex: 0 0 auto;
	accent-color: var(--color-accent);
}

.text-question textarea {
	width: 100%;
	min-height: 78px;
	resize: vertical;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	padding: 10px 12px;
	font: inherit;
	line-height: 1.5;
}

.survey-error {
	margin: 0 22px 14px;
	border: 1px solid var(--color-danger);
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
	color: var(--color-text);
	padding: 10px 12px;
	font-size: 13px;
	font-weight: 700;
}

.survey-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	padding: 14px 22px 20px;
	border-top: 1px solid var(--color-border);
}

.skip-button,
.submit-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 40px;
	border-radius: 8px;
	padding: 0 14px;
	font-weight: 800;
}

.skip-button {
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	color: var(--color-text);
}

.submit-button {
	border: 1px solid var(--color-accent);
	background: var(--color-accent);
	color: white;
}

.skip-button:disabled,
.submit-button:disabled,
.rating-row button:disabled,
.option-row input:disabled,
.text-question textarea:disabled {
	cursor: not-allowed;
	opacity: 0.58;
}

@media (max-width: 560px) {
	.survey-backdrop {
		align-items: end;
		padding: 10px;
	}

	.survey-modal {
		max-height: calc(100dvh - 20px);
	}

	.survey-header,
	.survey-body,
	.survey-actions {
		padding-right: 14px;
		padding-left: 14px;
	}

	.survey-actions {
		flex-direction: column-reverse;
	}

	.skip-button,
	.submit-button {
		width: 100%;
	}
}
</style>
