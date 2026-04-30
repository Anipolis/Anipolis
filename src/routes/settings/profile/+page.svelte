<script lang="ts">
    import { untrack } from 'svelte';
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import type { PageProps } from './$types';
    import UserAvatar from '$lib/components/UserAvatar.svelte';

    let { data, form }: PageProps = $props();

    // untrack: フォーム初期値はサーバーから渡された時点の値のみ使用する（意図的）
    let username = $state(untrack(() => data.profile?.username ?? ''));
    let displayName = $state(untrack(() => data.profile?.display_name ?? ''));
    let bio = $state(untrack(() => data.profile?.bio ?? ''));
    let submitting = $state(false);

    let avatarUrl = $state(untrack(() => data.profile?.avatar_url ?? null));
    let avatarUploading = $state(false);
    let avatarError = $state<string | null>(null);
    let fileInput: HTMLInputElement;

    const bioRemaining = $derived(160 - bio.length);

    const handleSubmit: SubmitFunction = () => {
        submitting = true;
        return async ({ result, update }) => {
            submitting = false;
            await update({ reset: false }); // load を再実行してレイアウトのプロフィールを更新
            // untrack で初期化した $state を最新の data.profile で同期
            if (result.type === 'success' && data.profile) {
                username = data.profile.username;
                displayName = data.profile.display_name ?? '';
                bio = data.profile.bio ?? '';
            }
        };
    };

    async function handleAvatarChange(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        avatarError = null;
        avatarUploading = true;

        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd });
            if (!res.ok) {
                const text = await res.text();
                avatarError = text || 'アップロードに失敗しました';
                return;
            }
            const { url } = await res.json();
            avatarUrl = url;
            // layout の profile も再読み込みで最新化
            if (data.profile) data.profile.avatar_url = url;
        } catch {
            avatarError = 'アップロードに失敗しました';
        } finally {
            avatarUploading = false;
            fileInput.value = '';
        }
    }
</script>

<svelte:head>
    <title>プロフィール設定 — Anipolis</title>
</svelte:head>

<div class="page-container" style="justify-content: center;">
    <main style="flex: 0 1 560px; min-width: 0;">
        <div class="settings-card">
            <h1 class="settings-title">プロフィール設定</h1>

            <!-- アバター -->
            <div class="settings-avatar-row">
                <button
                    type="button"
                    class="avatar-upload-btn"
                    onclick={() => fileInput.click()}
                    disabled={avatarUploading}
                    aria-label="アイコン画像を変更"
                >
                    <UserAvatar
                        src={avatarUrl}
                        username={displayName || username || '?'}
                        size="lg"
                    />
                    <div class="avatar-overlay">
                        {#if avatarUploading}
                            <span class="avatar-overlay-text">アップロード中…</span>
                        {:else}
                            <span class="avatar-overlay-text">変更</span>
                        {/if}
                    </div>
                </button>
                <input
                    bind:this={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style="display:none"
                    onchange={handleAvatarChange}
                />
                <div class="settings-avatar-hint">
                    アイコンをクリックして画像を変更できます（JPEG / PNG / WebP、最大 2MB）
                    {#if avatarError}
                        <span class="avatar-error">{avatarError}</span>
                    {/if}
                </div>
            </div>

            <!-- 成功メッセージ -->
            {#if form?.success}
                <div class="flash-success">
                    ✓ プロフィールを更新しました —
                    <a href="/profile/{data.profile?.username}">プロフィールを見る</a>
                </div>
            {/if}

            <!-- エラーメッセージ（フィールド非依存） -->
            {#if form && 'message' in form && !('field' in form)}
                <div class="flash-error">{form.message}</div>
            {/if}

            <form method="POST" action="?/update" use:enhance={handleSubmit}>
                <!-- 表示名 -->
                <div class="field">
                    <label for="display_name" class="field-label">表示名</label>
                    <input
                        id="display_name"
                        name="display_name"
                        type="text"
                        class="field-input"
                        placeholder="アニメ太郎"
                        maxlength="50"
                        bind:value={displayName}
                    />
                    <p class="field-hint">タイムラインに表示される名前です（任意）</p>
                </div>

                <!-- ユーザー名 -->
                <div class="field">
                    <label for="username" class="field-label">
                        ユーザー名 <span class="field-required">必須</span>
                    </label>
                    <div class="field-input-prefix">
                        <span class="prefix">@</span>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            class="field-input has-prefix"
                            class:field-error={form && 'field' in form && form.field === 'username'}
                            placeholder="animetaro"
                            maxlength="20"
                            pattern={"[a-zA-Z0-9_]{3,20}"}
                            required
                            bind:value={username}
                        />
                    </div>
                    {#if form && 'field' in form && form.field === 'username'}
                        <p class="field-error-msg">{form.message}</p>
                    {:else}
                        <p class="field-hint">3〜20文字の半角英数字・アンダースコア（_）のみ</p>
                    {/if}
                </div>

                <!-- 自己紹介 -->
                <div class="field">
                    <label for="bio" class="field-label">自己紹介</label>
                    <textarea
                        id="bio"
                        name="bio"
                        class="field-textarea"
                        class:field-error={form && 'field' in form && form.field === 'bio'}
                        placeholder="アニメが大好きです！推しは…"
                        rows="3"
                        maxlength="160"
                        bind:value={bio}
                    ></textarea>
                    <p class="field-hint" class:danger={bioRemaining < 0}>
                        {#if form && 'field' in form && form.field === 'bio'}
                            {form.message}
                        {:else}
                            残り {bioRemaining} 文字
                        {/if}
                    </p>
                </div>

                <div class="settings-actions">
                    <a href="/" class="btn btn-ghost">キャンセル</a>
                    <button type="submit" class="btn btn-primary" disabled={submitting}>
                        {submitting ? '保存中…' : '保存する'}
                    </button>
                </div>
            </form>
        </div>
    </main>
</div>
