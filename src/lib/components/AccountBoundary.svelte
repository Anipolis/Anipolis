<script lang="ts">
import type { Snippet } from "svelte";

/**
 * ログイン中のユーザーが変わったら中身を作り直す境界（#298）。
 *
 * アカウント切替は invalidateAll で読み込み直すだけなので、表示中のページは残る。
 * ページが `$state(untrack(() => data.…))` のように最初の 1 回だけデータから初期化した
 * 状態（設定のチェックや入力欄）を持っていると、前のアカウントの値が残り、自動保存で
 * 新しいアカウントに書き込まれる。ユーザー ID をキーにしてページを作り直し、どの画面でも
 * 新しいアカウントのデータで初期化し直す。
 * 同じユーザーのままの再読み込み（セッション更新・投稿後の再取得など）では作り直さない。
 */
interface Props {
	userId: string | null | undefined;
	children: Snippet;
}

let { userId, children }: Props = $props();
</script>

{#key userId ?? ""}
	{@render children()}
{/key}
