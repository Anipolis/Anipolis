import type { Attachment } from "svelte/attachments";

const KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * role="tablist" に付けて、左右の矢印・Home・End で隣や端のタブへ移る（WAI-ARIA のタブの操作）。
 * 移った先のタブはその場で押す（フォーカスと選択を一緒に動かす）。
 * Tab キーでは選ばれているタブにだけ止まるよう、各タブは tabindex={選択中 ? 0 : -1} にしておく
 */
export const tabListKeys: Attachment<HTMLElement> = (list) => {
	const handleKeydown = (event: KeyboardEvent) => {
		if (!KEYS.has(event.key)) return;
		const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
		const current = tabs.indexOf(event.target as HTMLElement);
		if (current === -1) return;
		event.preventDefault();
		const last = tabs.length - 1;
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? last
					: event.key === "ArrowRight"
						? (current + 1) % tabs.length
						: (current - 1 + tabs.length) % tabs.length;
		const target = tabs[next];
		if (!target) return;
		target.focus();
		target.click();
	};

	list.addEventListener("keydown", handleKeydown);
	return () => list.removeEventListener("keydown", handleKeydown);
};
