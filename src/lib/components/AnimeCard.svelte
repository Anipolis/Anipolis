<script module lang="ts">
import type { AnimeListItem, AnimeStatus } from "$lib/types";

/**
 * アニメ一覧・マイリスト・プロフィールのマイリストで使う作品カード。
 * 画像の下に「左: スコア｜右: 自分のマイリスト」の2マスを置き、その下に題名と「TV・2026年春」を並べる
 */
type CardAnime = Pick<
	AnimeListItem,
	"id" | "title" | "title_en" | "cover_url" | "season" | "type" | "broadcast_day" | "computed_broadcast_status"
>;

/**
 * 左のマスのスコア。average はみんなの平均（count が null なら読み込めなかったので何も出さない）、
 * personal はリストの持ち主が付けたスコア（自分のマイリストなら自分、他の人のプロフィールならその人）
 */
export type AnimeCardScore =
	| { kind: "average"; value: number | null; count: number | null | undefined }
	| {
			kind: "personal";
			value: number | null;
			label: string;
			/** 自分のスコアなら青で示し、onclick を渡すとその場で変えられるボタンにする */
			mine?: boolean;
			expanded?: boolean;
			onclick?: ((e: MouseEvent) => void) | undefined;
	  };

export type AnimeCardProps = {
	anime: CardAnime;
	href: string;
	score: AnimeCardScore;
	/** 人気順などの順位（1始まり）。渡すと画像の左上に出す */
	rank?: number | null;
	/** 放送中タブではどれも放送中なので「放送中」のリボンは出さない（「本日放送」は出す） */
	hideAiringRibbon?: boolean;
	/** 見た話数。渡すと画像の右下に「3/13話」、下端にバーを出す */
	progress?: { watched: number; total: number | null } | null;
	/** 右のマスの自分のマイリスト。渡さなければ（未ログイン）スコアだけの1マスにする */
	listButton?: {
		status: AnimeStatus | null | undefined;
		label: string;
		expanded: boolean;
		onclick: (e: MouseEvent) => void;
	} | null;
};
</script>

<script lang="ts">
import { animeCardMeta } from "$lib/anime-labels";
import { dateKeyWeekday, jstBroadcastDateKey } from "$lib/utils/jst";

let {
	anime,
	href,
	score,
	rank = null,
	hideAiringRibbon = false,
	progress = null,
	listButton = null,
}: AnimeCardProps = $props();

const meta = $derived(animeCardMeta(anime));
const progressRatio = $derived(progress?.total ? Math.min(1, Math.max(0, progress.watched / progress.total)) : null);

function isAiringToday(): boolean {
	if (anime.broadcast_day == null || anime.computed_broadcast_status !== "airing") return false;
	// 放送日は午前4時境界（26時制）。放送中タブで先頭に寄せる基準（anime/+page.server.ts）と同じ
	return anime.broadcast_day === dateKeyWeekday(jstBroadcastDateKey(Date.now()));
}
</script>

<a {href} class="anime-card">
	<div class="anime-cover">
		{#if anime.cover_url}
			<img src={anime.cover_url} alt={anime.title} loading="lazy">
		{:else}
			<div class="anime-cover-placeholder">
				<svg
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<rect x="2" y="2" width="20" height="20" rx="2" />
					<path d="M10 8l6 4-6 4V8z" />
				</svg>
			</div>
		{/if}
		{#if rank != null}
			<span class="rank-badge">#{rank}</span>
		{/if}
		<!-- 放送中の作品は右上のリボンで示す。今日放送があれば「本日放送」を優先する -->
		{#if isAiringToday()}
			<span class="cover-ribbon cover-ribbon--today">本日放送</span>
		{:else if anime.computed_broadcast_status === 'airing' && !hideAiringRibbon}
			<span class="cover-ribbon cover-ribbon--airing">放送中</span>
		{/if}
		{#if progress}
			<span class="cover-progress-count">
				<span class="sr-only">見た話数</span>{progress.watched}{progress.total ? `/${progress.total}` : ''}話
			</span>
			{#if progressRatio != null}
				<span class="cover-progress" aria-hidden="true">
					<span class="cover-progress-bar" style:width="{progressRatio * 100}%"></span>
				</span>
			{/if}
		{/if}
	</div>
	<!-- 画像の下: 左にスコア、右に自分のマイリスト（2マスに仕切る） -->
	<div class="anime-card-actions" class:anime-card-actions--split={listButton}>
		{#if score.kind === 'average' && score.count == null}
			<!-- スコアを読み込めなかった（評価なしとは区別して何も出さない） -->
			<span class="anime-score"><span class="sr-only">スコアを読み込めませんでした</span></span>
		{:else if score.kind === 'personal' && score.onclick}
			<!-- 自分のスコア。押すとその場で変える欄を開く -->
			<button
				type="button"
				class="anime-score anime-score--mine anime-score-btn"
				class:anime-score--none={score.value == null}
				onclick={score.onclick}
				aria-label={score.value != null ? `${score.label}: ${score.value}（変更）` : `${score.label}を付ける`}
				aria-haspopup="dialog"
				aria-expanded={score.expanded ?? false}
				title={score.value != null ? `${score.label}（押して変更）` : `${score.label}を付ける`}
			>
				<span class="anime-score-star" aria-hidden="true">★</span>
				<span aria-hidden="true">{score.value ?? '—'}</span>
			</button>
		{:else}
			<span
				class="anime-score"
				class:anime-score--mine={score.kind === 'personal' && score.mine}
				class:anime-score--none={score.value == null}
			>
				<span class="anime-score-star" aria-hidden="true">★</span>
				{#if score.value != null}
					{#if score.kind === 'average'}
						<span class="sr-only">平均スコア</span>
						<span title="{score.count}人の評価の平均">{score.value.toFixed(2)}</span>
					{:else}
						<span class="sr-only">{score.label}</span>
						<span title={score.label}>{score.value}</span>
					{/if}
				{:else}
					<span class="sr-only">{score.kind === 'average' ? '評価なし' : `${score.label}なし`}</span>
					<span aria-hidden="true">—</span>
				{/if}
			</span>
		{/if}
		{#if listButton}
			<!-- 登録したかどうかだけを示す（状態の名前はマウスを乗せたときと読み上げで伝える） -->
			<button
				type="button"
				class="quick-add-btn"
				class:quick-add-btn--listed={listButton.status}
				onclick={listButton.onclick}
				aria-label={listButton.label}
				aria-haspopup="dialog"
				aria-expanded={listButton.expanded}
				title={listButton.label}
			>
				{#if listButton.status}
					<span class="i-lucide-list-check" aria-hidden="true"></span>
				{:else}
					<span class="i-lucide-list-plus" aria-hidden="true"></span>
				{/if}
			</button>
		{/if}
	</div>
	<div class="anime-info">
		<p class="anime-title">{anime.title}</p>
		<p
			class="anime-title-en"
			class:anime-title-en--placeholder={!anime.title_en}
			aria-hidden={anime.title_en ? undefined : "true"}
		>
			{anime.title_en ?? ' '}
		</p>
		<!-- 種別と時期（「TV・2026年春」、映画は年だけ）を1行で -->
		<p class="anime-meta" class:anime-meta--placeholder={!meta} aria-hidden={meta ? undefined : "true"}>
			{meta || ' '}
		</p>
	</div>
</a>

<style>
.anime-card {
	display: flex;
	flex-direction: column;
	text-decoration: none;
	color: var(--color-text);
	border-radius: 12px;
	overflow: hidden;
	border: 1px solid var(--color-border);
	transition:
		border-color 0.15s,
		transform 0.15s;
}
.anime-card:hover,
/* 状態の欄はカードの外に出すので、開いている間も持ち上げたままにする（ずれて隙間が出ないように） */
.anime-card:has([aria-expanded="true"]) {
	border-color: var(--color-accent);
	transform: translateY(-2px);
}

.anime-cover {
	position: relative;
	aspect-ratio: 1 / 1.414;
	background: var(--color-surface);
	overflow: hidden;
}
.anime-cover img {
	width: 100%;
	display: block;
	image-rendering: auto;
}
.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--color-text-muted);
	background: var(--color-surface-hover);
}
.rank-badge {
	position: absolute;
	top: 6px;
	left: 6px;
	background: rgba(0, 0, 0, 0.7);
	color: #fff;
	font-size: 0.75rem;
	font-weight: 700;
	padding: 2px 6px;
	border-radius: 4px;
}

/* 画像の右下に重ねる見た話数と、下端のバー */
.cover-progress-count {
	position: absolute;
	right: 5px;
	bottom: 9px;
	border-radius: 4px;
	background: rgb(0 0 0 / 0.72);
	color: #fff;
	font-size: 0.7rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	padding: 2px 6px;
}
.cover-progress {
	position: absolute;
	right: 0;
	bottom: 0;
	left: 0;
	height: 4px;
	background: rgb(0 0 0 / 0.55);
}
.cover-progress-bar {
	display: block;
	height: 100%;
	background: var(--color-accent);
}

.anime-info {
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
}
.anime-title {
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1.3;
	height: calc(0.85rem * 1.3 * 2);
	margin: 0;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.anime-title-en {
	font-size: 0.72rem;
	line-height: 1.2;
	height: calc(0.72rem * 1.2);
	color: var(--text-muted);
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.anime-title-en--placeholder {
	visibility: hidden;
}
/* 種別と時期の1行 */
.anime-meta {
	margin: 0;
	font-size: 0.72rem;
	line-height: 1.6;
	color: var(--color-text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.anime-meta--placeholder {
	visibility: hidden;
}

/* 画像の右上に重ねるリボン（本日放送・放送中） */
.cover-ribbon {
	position: absolute;
	top: 6px;
	right: 6px;
	font-size: 0.7rem;
	font-weight: 700;
	padding: 3px 6px;
	border-radius: 4px;
	color: var(--ribbon-text);
	letter-spacing: 0.02em;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
.cover-ribbon--today {
	background: var(--ribbon-today);
}
.cover-ribbon--airing {
	/* 枠の分だけ内側を詰め、本日放送のリボンと大きさをそろえる */
	padding: 1px 4px;
	border: 2px solid var(--ribbon-airing);
	background: var(--ribbon-airing-bg);
	color: var(--ribbon-airing);
}

/* ─── 画像の下の行: 左にスコア、右にマイリストの状態 ─── */
.anime-card-actions {
	display: grid;
	grid-template-columns: 1fr;
	height: 34px;
	border-bottom: 1px solid var(--color-border);
}
.anime-card-actions--split {
	grid-template-columns: 1fr 1fr;
}
.anime-score {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 3px;
	min-width: 0;
	font-size: 0.82rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.anime-score-star {
	color: var(--status-score);
}
/* 自分のスコアは青（右のマスの登録済みと同じ「自分のもの」の色）。みんなの平均や他の人のスコアは黄色 */
.anime-score--mine .anime-score-star {
	color: var(--color-accent);
}
.anime-score-btn {
	border: 0;
	background: transparent;
	color: inherit;
	cursor: pointer;
	font-family: inherit;
	transition: background 0.15s;
}
.anime-score-btn:hover,
.anime-score-btn[aria-expanded="true"] {
	background: var(--color-surface-hover);
}
.anime-score--none {
	color: var(--color-text-muted);
	font-weight: 500;
}
.anime-score--none .anime-score-star {
	color: inherit;
	opacity: 0.6;
}
.quick-add-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 0;
	padding: 0 4px;
	overflow: hidden;
	border: 0;
	border-left: 1px solid var(--color-border);
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: 0.75rem;
	font-weight: 700;
	white-space: nowrap;
	transition:
		background 0.15s,
		color 0.15s;
}
.quick-add-btn:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.quick-add-btn .i-lucide-list-plus,
.quick-add-btn .i-lucide-list-check {
	width: 18px;
	height: 18px;
}
/* 登録済みは状態によらず同じ色にする（登録したかどうかが分かればよい） */
.quick-add-btn--listed {
	background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	color: var(--color-accent);
}
.quick-add-btn--listed:hover {
	background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	color: var(--color-accent);
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
</style>
