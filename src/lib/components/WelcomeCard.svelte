<script lang="ts">
import { onMount } from "svelte";
import FollowSuggestions from "#lib/components/FollowSuggestions.svelte";
import type { FollowSuggestion } from "#lib/types.ts";

/**
 * はじめての人への案内（ホーム）。まだ誰もフォローしていないか、マイリストが空の人や、
 * プロフィール（表示名・アイコン）が未設定の人に、最初にやることを示す。
 * 出すのは済ませれば消える初期設定だけ（放送・実況ルームはサイドバーから行けるので案内しない）。
 * 出す項目が 1 つも無ければ、カードごと出さない。
 * 誰もフォローしていない人には、フォローのおすすめ（共通の作品）をその場でフォローできる形で出す。
 * × で閉じたら、この端末では出さない（localStorage。読めない環境では毎回出る）
 */
interface Props {
	userId: string;
	/** プロフィールが未設定のときだけ渡す。案内の先頭にプロフィールの編集を出す */
	profileEditHref?: string | null;
	/** マイリストが空なら、作品を探す案内を出す */
	listEmpty: boolean;
	/** まだ誰もフォローしていなければ、フォローの案内（おすすめ、無ければ検索）を出す */
	followsNobody: boolean;
	/** フォローのおすすめ。誰もフォローしていない人にだけ渡る */
	suggestions: FollowSuggestion[];
	/** おすすめを同じ画面の別の場所（フォロー中タブの空の表示）に出しているときは、ここでは出さない */
	suggestionsElsewhere?: boolean;
}

let {
	userId,
	profileEditHref = null,
	listEmpty,
	followsNobody,
	suggestions,
	suggestionsElsewhere = false,
}: Props = $props();

// おすすめの一覧は、フォロー中タブの空の表示に出しているときはここでは出さない
const showSuggestions = $derived(followsNobody && suggestions.length > 0 && !suggestionsElsewhere);
// おすすめが 1 人も出せないときだけ、検索へ送る（どのタブでも。空の表示の側には検索の導線が無いため）
const showSearch = $derived(followsNobody && suggestions.length === 0);
const hasActions = $derived(Boolean(profileEditHref) || listEmpty || showSearch);
const hasItems = $derived(hasActions || showSuggestions);

const storageKey = $derived(`anipolis:welcome-dismissed:${userId}`);
// 閉じたかどうかを読むまでは出さない（閉じた人に一瞬出てから消えるのを防ぐ）
let visible = $state(false);

onMount(() => {
	try {
		visible = localStorage.getItem(storageKey) !== "1";
	} catch {
		visible = true;
	}
});

function dismiss(): void {
	visible = false;
	try {
		localStorage.setItem(storageKey, "1");
	} catch {
		// 保存できなくても、この画面では閉じたままにする
	}
}
</script>

{#if visible && hasItems}
	<section class="welcome-card" aria-labelledby="welcome-card-title">
		<div class="welcome-card-header">
			<h2 id="welcome-card-title">Anipolisへようこそ</h2>
			<button type="button" class="welcome-card-close" onclick={dismiss} aria-label="案内を閉じる">
				<span class="i-lucide-x" aria-hidden="true"></span>
			</button>
		</div>
		{#if hasActions}
			<div class="welcome-card-actions">
				{#if profileEditHref}
					<a href={profileEditHref} class="btn btn-secondary welcome-card-action">
						<span class="i-lucide-user-pen" aria-hidden="true"></span>
						アイコンと表示名を設定する
					</a>
				{/if}
				{#if listEmpty}
					<a href="/anime" class="btn btn-secondary welcome-card-action">
						<span class="i-lucide-list-plus" aria-hidden="true"></span>
						アニメを探してマイリストに追加
					</a>
				{/if}
				{#if showSearch}
					<a href="/search" class="btn btn-secondary welcome-card-action">
						<span class="i-lucide-user-search" aria-hidden="true"></span>
						ユーザーを探してフォロー
					</a>
				{/if}
			</div>
		{/if}
		{#if showSuggestions}
			<section class="welcome-card-suggestions" aria-labelledby="welcome-card-suggestions-title">
				<h3 id="welcome-card-suggestions-title">フォローしてみませんか</h3>
				{#if listEmpty}
					<p class="welcome-card-hint">マイリストに作品を追加すると、同じ作品を見ている人が出てきます。</p>
				{/if}
				<FollowSuggestions {suggestions} />
			</section>
		{/if}
	</section>
{/if}

<style>
.welcome-card {
	margin: 0 0 12px;
	padding: 14px 16px 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	background: var(--color-surface);
}

.welcome-card-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 12px;
}

.welcome-card-header h2 {
	flex: 1;
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.welcome-card-close {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 8px;
	background: none;
	color: var(--color-text-muted);
	cursor: pointer;
}

.welcome-card-close:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.welcome-card-close [class^="i-lucide"] {
	width: 18px;
	height: 18px;
}

.welcome-card-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

/* 案内の中のボタンは補助の操作なので灰色の枠（.btn-secondary） */
.welcome-card-action {
	justify-content: flex-start;
	text-decoration: none;
}

.welcome-card-action:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
	text-decoration: none;
}

/* 上に案内のボタンがあるときだけ、区切り線を入れる */
.welcome-card-actions + .welcome-card-suggestions {
	margin-top: 16px;
	padding-top: 12px;
	border-top: 1px solid var(--color-border);
}

.welcome-card-suggestions h3 {
	margin: 0 0 4px;
	font-size: 14px;
	font-weight: 700;
}

.welcome-card-hint {
	margin: 0 0 4px;
	font-size: 12px;
	color: var(--color-text-muted);
}

.welcome-card-action [class^="i-lucide"] {
	flex: none;
	width: 18px;
	height: 18px;
	color: var(--color-text-muted);
}
</style>
