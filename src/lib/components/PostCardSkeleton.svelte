<script lang="ts">
// PostCard のレイアウトに合わせたスケルトンプレースホルダー。
// ストリーミング中（投稿データ取得待ち）に表示する。
// 構造は PostCard と対応させること:
//   .post-card → .skeleton-post-card
//   アバター(40px circle) / ユーザー名・ハンドル行 / コンテンツ行 / アクションバー
</script>

<div class="skeleton-post-card" aria-hidden="true">
	<!-- アバター (avatar-md = 40×40px) -->
	<div class="skeleton skeleton-circle" style="width:40px;height:40px;flex-shrink:0"></div>

	<div class="skeleton-post-body">
		<!-- ヘッダー: ユーザー名 + 時刻 -->
		<div class="skeleton-post-header">
			<div class="skeleton-post-meta">
				<div class="skeleton" style="width:110px;height:13px"></div>
				<div class="skeleton" style="width:72px;height:11px"></div>
			</div>
			<div class="skeleton" style="width:36px;height:11px"></div>
		</div>

		<!-- コンテンツ行 -->
		<div class="skeleton" style="width:100%;height:13px"></div>
		<div class="skeleton" style="width:82%;height:13px"></div>
		<div class="skeleton" style="width:58%;height:13px"></div>

		<!-- アクションバー (いいね / リポスト / リプライ / ブックマーク) -->
		<div class="skeleton-post-actions">
			<div class="skeleton" style="width:32px;height:11px"></div>
			<div class="skeleton" style="width:32px;height:11px"></div>
			<div class="skeleton" style="width:32px;height:11px"></div>
			<div class="skeleton" style="width:24px;height:11px"></div>
		</div>
	</div>
</div>
