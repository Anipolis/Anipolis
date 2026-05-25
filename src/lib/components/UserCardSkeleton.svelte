<script lang="ts">
// ユーザーカードのレイアウトに合わせたスケルトンプレースホルダー。
// フォロワー・フォロー中ページのストリーミング中（データ取得待ち）に表示する。
</script>

<div class="skeleton-user-card-item" aria-hidden="true">
	<!-- アバター (avatar-md = 40×40px) -->
	<div class="skeleton skeleton-circle" style="width:40px;height:40px;flex-shrink:0"></div>

	<div class="skeleton-user-card-info">
		<!-- 表示名 -->
		<div class="skeleton" style="width:110px;height:14px"></div>
		<!-- ユーザー名 (@handle) -->
		<div class="skeleton" style="width:75px;height:12px"></div>
		<!-- 自己紹介行 -->
		<div class="skeleton" style="width:85%;height:12px"></div>
	</div>
</div>
