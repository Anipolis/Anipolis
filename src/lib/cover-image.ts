import type { Attachment } from "svelte/attachments";
import { coverThumbUrl } from "./anime-cover";

// 小さく表示するカバー用。コンポーネントにせず <img> に付ける形にしているのは、
// 呼び出し側のスコープ付き CSS（.slot-cover や .foo img など）をそのまま効かせるため。
//
//   <img src={coverThumbSrc(url)} {@attach coverThumbFallback(url)} alt="" class="slot-cover">

/** サムネイルの URL。サムネイル規約の対象外（外部 URL など）は原寸の URL をそのまま返す */
export function coverThumbSrc(url: string): string {
	return coverThumbUrl(url) ?? url;
}

/**
 * サムネイルが未生成・削除済みで読み込めないときに原寸へ切り替える。
 * SSR の画像がハイドレーション前に失敗していた場合も、接続時に検知して戻す。
 */
export function coverThumbFallback(url: string): Attachment<HTMLImageElement> {
	return (img) => {
		const restore = () => {
			if (img.getAttribute("src") !== url) img.src = url;
		};
		if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) restore();
		img.addEventListener("error", restore);
		return () => img.removeEventListener("error", restore);
	};
}
