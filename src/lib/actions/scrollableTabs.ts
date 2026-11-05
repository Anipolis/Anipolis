import type { Attachment } from "svelte/attachments";

const FADE_PX = 32;

function fadeMask(moreLeft: boolean, moreRight: boolean): string {
	if (moreLeft && moreRight) {
		return `linear-gradient(to right, transparent, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), transparent)`;
	}
	if (moreRight) return `linear-gradient(to right, #000 calc(100% - ${FADE_PX}px), transparent)`;
	if (moreLeft) return `linear-gradient(to left, #000 calc(100% - ${FADE_PX}px), transparent)`;
	return "";
}

/**
 * 入りきらない幅で横に送るタブの並び。開いているタブを見える位置まで送り、続きがある側の端をぼかして知らせる。
 * activeKey が変わると付け直され、開いているタブの位置を合わせ直す
 */
export function scrollableTabs(activeSelector: string, _activeKey: unknown): Attachment<HTMLElement> {
	return (nav) => {
		const update = () => {
			const moreLeft = nav.scrollLeft > 1;
			const moreRight = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
			nav.style.maskImage = fadeMask(moreLeft, moreRight);
		};

		// scrollIntoView はページごと縦にも動かすので、タブの並びだけを横に送る。ぼかしに隠れない位置で止める
		const active = nav.querySelector<HTMLElement>(activeSelector);
		if (active) {
			const navBox = nav.getBoundingClientRect();
			const activeBox = active.getBoundingClientRect();
			const overRight = activeBox.right + FADE_PX - navBox.right;
			const overLeft = navBox.left + FADE_PX - activeBox.left;
			if (overRight > 0) nav.scrollLeft += overRight;
			else if (overLeft > 0) nav.scrollLeft -= overLeft;
		}
		update();

		nav.addEventListener("scroll", update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(nav);
		return () => {
			nav.removeEventListener("scroll", update);
			observer.disconnect();
		};
	};
}
