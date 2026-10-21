/** Re-measure after binding updates and width changes, including clearing a submitted draft. */
export function autosize(node: HTMLTextAreaElement, _value: string) {
	function resize() {
		node.style.height = "auto";
		node.style.height = `${node.scrollHeight}px`;
	}
	let width = 0;
	const observer = new ResizeObserver(() => {
		if (width === node.clientWidth) return;
		width = node.clientWidth;
		resize();
	});
	observer.observe(node);
	queueMicrotask(resize);
	return {
		update(_value: string) {
			queueMicrotask(resize);
		},
		destroy() {
			observer.disconnect();
		},
	};
}
