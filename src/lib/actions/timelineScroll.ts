interface Options {
	following: boolean;
	newestFirst: boolean;
}

/** Preserve the first visible post when media or earlier rows change height. */
export function timelineScroll(node: HTMLElement, options: Options) {
	let anchor: HTMLElement | undefined;
	let offset = 0;
	function remember() {
		const top = node.getBoundingClientRect().top;
		anchor = Array.from(node.querySelectorAll<HTMLElement>("[data-post-id]")).find(
			(post) => post.getBoundingClientRect().bottom > top,
		);
		if (anchor) offset = anchor.getBoundingClientRect().top - top;
	}
	function restore() {
		if (options.following) {
			node.scrollTop = options.newestFirst ? 0 : node.scrollHeight;
		} else if (anchor?.isConnected) {
			node.scrollTop += anchor.getBoundingClientRect().top - node.getBoundingClientRect().top - offset;
		}
		remember();
	}
	const observer = new ResizeObserver(restore);
	if (node.firstElementChild) observer.observe(node.firstElementChild);
	node.addEventListener("scroll", remember);
	remember();
	return {
		update(next: Options) {
			const resume = (!options.following && next.following) || options.newestFirst !== next.newestFirst;
			options = next;
			if (resume) queueMicrotask(restore);
		},
		destroy() {
			observer.disconnect();
			node.removeEventListener("scroll", remember);
		},
	};
}
