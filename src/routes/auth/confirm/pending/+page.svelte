<script lang="ts">
// メールアドレスの変更で、古い・新しいアドレスの両方に確認が要る設定のときの案内（/auth/confirm から来る）
</script>

<svelte:head><title>もう一方のメールアドレスも確認してください - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card confirm-pending">
			<h1>確認を受け付けました</h1>
			<p>
				メールアドレスの変更には、変更前と変更後の両方のアドレスでの確認が必要です。もう一方のアドレスに届いたメールのリンクも開いてください。両方の確認が済むと、変更が完了します。
			</p>
			<a href="/" class="btn btn-primary">ホームへ</a>
		</div>
	</main>
</div>

<style>
.confirm-pending h1 {
	font-size: 1.15rem;
	font-weight: 700;
	margin: 0 0 12px;
}

.confirm-pending p {
	line-height: 1.8;
	margin: 0 0 20px;
}
</style>
