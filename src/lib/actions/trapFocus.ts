const FOCUSABLE = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(node: HTMLElement): HTMLElement[] {
	return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.closest("[inert],[hidden]") && el.getClientRects().length > 0,
	);
}

export function trapFocus(node: HTMLElement) {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	const previousTabIndex = node.getAttribute("tabindex");
	const firstFocusable = getFocusable(node)[0];

	if (firstFocusable) {
		firstFocusable.focus();
	} else {
		if (previousTabIndex === null) node.setAttribute("tabindex", "-1");
		node.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== "Tab") return;
		const focusable = getFocusable(node);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	node.addEventListener("keydown", handleKeydown);

	return {
		destroy() {
			node.removeEventListener("keydown", handleKeydown);
			if (previousTabIndex === null && node.getAttribute("tabindex") === "-1") {
				node.removeAttribute("tabindex");
			}
			previouslyFocused?.focus();
		},
	};
}
