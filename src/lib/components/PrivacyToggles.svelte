<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import InfoTip from "$lib/components/InfoTip.svelte";
import ToggleSwitch from "$lib/components/ToggleSwitch.svelte";

/**
 * 鍵アカウントとマイリストの公開のスイッチ。設定の一覧（公開範囲）と /settings/privacy の両方で使う。
 * 切り替えたらすぐ /settings/privacy のアクションへ送り、読み直した値にそろえる
 */
type Props = {
	isPrivate: boolean;
	listIsPublic: boolean;
	/** 保存中・保存しましたの表示を、置く側が見出しの横などに出すときに受け取る */
	onstatus?: (status: "idle" | "saving" | "saved") => void;
};

let { isPrivate: serverIsPrivate, listIsPublic: serverListIsPublic, onstatus }: Props = $props();

let isPrivate = $state(untrack(() => serverIsPrivate));
let isListPrivate = $state(untrack(() => !serverListIsPublic));
let saving = $state(false);
let errorMessage = $state("");
let savedTimer: ReturnType<typeof setTimeout> | undefined;

// サーバーから読み直した値が変わったら（保存後・別タブでの変更など）スイッチをそろえる
$effect(() => {
	isPrivate = serverIsPrivate;
	isListPrivate = !serverListIsPublic;
});

function autoSave(event: Event) {
	(event.currentTarget as HTMLInputElement).form?.requestSubmit();
}

const submit: SubmitFunction = () => {
	saving = true;
	errorMessage = "";
	onstatus?.("saving");
	return async ({ result, update }) => {
		saving = false;
		await update({ reset: false });
		// 失敗したらサーバーの値へ巻き戻す（成功時も読み直した値にそろえる）
		isPrivate = serverIsPrivate;
		isListPrivate = !serverListIsPublic;
		if (result.type === "failure" || result.type === "error") {
			const message =
				result.type === "failure" ? (result.data as { message?: string } | undefined)?.message : null;
			errorMessage = message ?? "設定を保存できませんでした";
			onstatus?.("idle");
			return;
		}
		onstatus?.("saved");
		if (savedTimer) clearTimeout(savedTimer);
		savedTimer = setTimeout(() => onstatus?.("idle"), 2000);
	};
};
</script>

{#if errorMessage}
	<div class="flash-error" role="alert">{errorMessage}</div>
{/if}

<form method="POST" action="/settings/privacy?/updatePrivacy" use:enhance={submit}>
	<div class="toggle-row">
		<span class="toggle-row-text">
			<span class="with-info-tip">
				<strong>鍵アカウントにする</strong>
				<InfoTip label="鍵アカウント">
					<p>フォローは承認制になります。</p>
					<p>マイリストを非公開にしているときは、フォロワーにも表示されません。</p>
					<p>鍵アカウントの投稿は、トレンドに数えません。</p>
				</InfoTip>
			</span>
			<small>承認したフォロワーだけが、あなたの投稿やマイリストを見られます。</small>
		</span>
		<ToggleSwitch
			name="is_private"
			bind:checked={isPrivate}
			disabled={saving}
			label="鍵アカウントにする"
			onchange={autoSave}
		/>
	</div>
</form>

<form method="POST" action="/settings/privacy?/updateListVisibility" use:enhance={submit}>
	<div class="toggle-row">
		<span class="toggle-row-text">
			<span class="with-info-tip">
				<strong>マイリストを非公開にする</strong>
				<InfoTip label="マイリストの公開設定">
					<p>公開: プロフィールの「マイリスト」タブで誰でも見られます（鍵アカウントならフォロワーだけ）。</p>
					<p>
						作品を視聴予定・視聴中・完了にすると、プロフィールやフォロワーのタイムラインの「アクティビティ」にも出ます。
					</p>
					<p>非公開: 自分だけが見られます。アクティビティも自分にしか見えません。</p>
					<p>非公開のマイリストは、作品のスコアやランキングに数えません。</p>
				</InfoTip>
			</span>
			<small>マイリストとアクティビティを自分だけに見せます。</small>
		</span>
		<ToggleSwitch
			name="list_private"
			bind:checked={isListPrivate}
			disabled={saving}
			label="マイリストを非公開にする"
			onchange={autoSave}
		/>
	</div>
</form>

<style>
.toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 0;
}
.toggle-row-text strong,
.toggle-row-text small {
	display: block;
}
.toggle-row-text small {
	margin-top: 2px;
	color: var(--color-text-muted);
	font-size: 0.82rem;
}
</style>
