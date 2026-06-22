<script lang="ts">
// アニメカード (.anime-card) のレイアウトに合わせたスケルトンプレースホルダー。
// アニメ一覧ページのストリーミング中（データ取得待ち）に表示する。
</script>

<div class="skeleton-anime-card" aria-hidden="true">
	<!-- カバー画像 (aspect-ratio 1/1.414、親がoverflowをclipするためborder-radiusなし) -->
	<div class="skeleton skeleton-anime-cover"></div>

	<!-- 情報エリア -->
	<div class="skeleton-anime-info">
		<!-- タイトル行1 -->
		<div class="skeleton" style="width:90%;height:13px"></div>
		<!-- タイトル行2 -->
		<div class="skeleton" style="width:70%;height:13px"></div>
		<!-- メタ情報 -->
		<div class="skeleton" style="width:50px;height:11px"></div>
	</div>
</div>
