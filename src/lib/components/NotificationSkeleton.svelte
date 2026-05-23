<script lang="ts">
// Notification アイテムのレイアウトに合わせたスケルトンプレースホルダー。
// /notifications ページのストリーミング中（データ取得待ち）に表示する。
</script>

<div class="skeleton-notification-item" aria-hidden="true">
	<!-- アバター (avatar-md = 40×40px) -->
	<div class="skeleton skeleton-circle" style="width:40px;height:40px;flex-shrink:0"></div>

	<div class="skeleton-notification-body">
		<!-- 名前行 -->
		<div class="skeleton" style="width:130px;height:13px"></div>
		<!-- テキスト行 -->
		<div class="skeleton" style="width:80%;height:12px"></div>
		<!-- 時刻 -->
		<div class="skeleton" style="width:50px;height:11px"></div>
	</div>
</div>
