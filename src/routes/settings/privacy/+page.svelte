<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import InfoTip from "$lib/components/InfoTip.svelte";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import ToggleSwitch from "$lib/components/ToggleSwitch.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let isPrivate = $state(untrack(() => data.profile?.is_private ?? false));
let saving = $state(false);
let justSaved = $state(false);
let isListPrivate = $state(untrack(() => !(data.profile?.list_is_public ?? true)));
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function syncFromServer() {
	isPrivate = data.profile?.is_private ?? false;
	isListPrivate = !(data.profile?.list_is_public ?? true);
}

function autoSave(event: Event) {
	(event.currentTarget as HTMLInputElement).form?.requestSubmit();
}

const privacySubmit: SubmitFunction = () => {
	saving = true;
	justSaved = false;
	return async ({ result, update }) => {
		saving = false;
		await update({ reset: false });
		// 失敗したらサーバー状態へ巻き戻す。成功時も読み直した値にそろえる
		syncFromServer();
		// 成功判定は result.type のみで行う(data.profile の再取得有無に依存させない)
		if (result.type === "failure" || result.type === "error") return;
		justSaved = true;
		if (savedTimer) clearTimeout(savedTimer);
		savedTimer = setTimeout(() => {
			justSaved = false;
		}, 2000);
	};
};
</script>

<svelte:head><title>プライバシー - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">プライバシー</h1>
				<span class="autosave-status" class:visible={saving || justSaved} aria-live="polite">
					{#if saving}
						保存中…
					{:else if justSaved}
						✓ 保存しました
					{/if}
				</span>
			</div>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<form method="POST" action="?/updatePrivacy" use:enhance={privacySubmit}>
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

			<form method="POST" action="?/updateListVisibility" use:enhance={privacySubmit}>
				<div class="toggle-row">
					<span class="toggle-row-text">
						<span class="with-info-tip">
							<strong>マイリストを非公開にする</strong>
							<InfoTip label="マイリストの公開設定">
								<p>
									公開:
									プロフィールの「マイリスト」タブで誰でも見られます（鍵アカウントならフォロワーだけ）。
								</p>
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
		</div>
	</main>
</div>

<style>
.settings-header-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.autosave-status {
	color: var(--color-text-muted);
	font-size: 0.78rem;
	opacity: 0;
	transition: opacity 0.2s ease;
}
.autosave-status.visible {
	opacity: 1;
}
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
