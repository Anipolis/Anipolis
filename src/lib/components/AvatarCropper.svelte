<script lang="ts">
import { onDestroy, onMount, untrack } from "svelte";
import { trapFocus } from "$lib/actions/trapFocus";
import {
	AVATAR_OUTPUT_SIZE,
	type CropState,
	clampOffset,
	coverScale,
	initialCrop,
	MAX_ZOOM,
	sourceRect,
	zoomTo,
} from "$lib/avatar-crop";

/**
 * アイコンにする範囲を選ぶ画面（初期設定・プロフィールの編集で共用）。
 * 画像をドラッグで動かし、スライダー・ホイール・2 本指で拡大する。決めた範囲を正方形（512px）の画像にして返す。
 * 切り抜きはブラウザの中で行うので、サーバー側は今のアップロードの仕組みのまま
 */
interface Props {
	file: File;
	onconfirm: (cropped: File) => void;
	oncancel: () => void;
}

let { file, onconfirm, oncancel }: Props = $props();

/** 枠（正方形）の一辺。開いたときの画面の幅に合わせて決める（幅 320px の端末でも収まるように） */
let VIEW = $state(280);

// 画像を選び直すときは、この画面ごと作り直される（呼ぶ側の {#if}）ので、最初の file だけを使う
const imageUrl = URL.createObjectURL(untrack(() => file));
let image = $state<HTMLImageElement | null>(null);
let natural = $state({ width: 0, height: 0 });
let crop = $state<CropState>({ x: 0, y: 0, scale: 1 });
let loadFailed = $state(false);
let saving = $state(false);

const minScale = $derived(natural.width ? coverScale(natural.width, natural.height, VIEW) : 1);
// スライダーは「枠を埋める倍率」から何倍かで持つ（1〜MAX_ZOOM）
const zoom = $derived(crop.scale / minScale);

onMount(() => {
	VIEW = Math.max(200, Math.min(280, window.innerWidth - 80));
	const img = new Image();
	img.onload = () => {
		image = img;
		natural = { width: img.naturalWidth, height: img.naturalHeight };
		crop = initialCrop(img.naturalWidth, img.naturalHeight, VIEW);
	};
	img.onerror = () => {
		loadFailed = true;
	};
	img.src = imageUrl;
});

onDestroy(() => URL.revokeObjectURL(imageUrl));

function setZoom(nextZoom: number, cx?: number, cy?: number): void {
	crop = zoomTo(crop, minScale * nextZoom, natural.width, natural.height, VIEW, cx, cy);
}

function moveBy(dx: number, dy: number): void {
	crop = clampOffset({ ...crop, x: crop.x + dx, y: crop.y + dy }, natural.width, natural.height, VIEW);
}

// ドラッグ（1 本指・マウス）と 2 本指の拡大
const pointers = new Map<number, { x: number; y: number }>();
let pinchDistance = 0;

function pointerPosition(event: PointerEvent): { x: number; y: number } {
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function handlePointerDown(event: PointerEvent): void {
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	pointers.set(event.pointerId, pointerPosition(event));
	if (pointers.size === 2) {
		const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
		pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
	}
}

function handlePointerMove(event: PointerEvent): void {
	const previous = pointers.get(event.pointerId);
	if (!previous) return;
	const current = pointerPosition(event);
	pointers.set(event.pointerId, current);
	if (pointers.size === 1) {
		moveBy(current.x - previous.x, current.y - previous.y);
	} else if (pointers.size === 2) {
		const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
		const distance = Math.hypot(a.x - b.x, a.y - b.y);
		if (pinchDistance > 0) setZoom(zoom * (distance / pinchDistance), (a.x + b.x) / 2, (a.y + b.y) / 2);
		pinchDistance = distance;
	}
}

function handlePointerUp(event: PointerEvent): void {
	pointers.delete(event.pointerId);
	pinchDistance = 0;
}

function handleWheel(event: WheelEvent): void {
	event.preventDefault();
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - rect.left, event.clientY - rect.top);
}

// キーボード: 矢印キーで動かし、＋／－で拡大・縮小
function handleStageKeydown(event: KeyboardEvent): void {
	const step = event.shiftKey ? 40 : 10;
	const moves: Record<string, [number, number]> = {
		ArrowLeft: [step, 0],
		ArrowRight: [-step, 0],
		ArrowUp: [0, step],
		ArrowDown: [0, -step],
	};
	const move = moves[event.key];
	if (move) {
		event.preventDefault();
		moveBy(...move);
	} else if (event.key === "+" || event.key === "=") {
		event.preventDefault();
		setZoom(zoom * 1.1);
	} else if (event.key === "-") {
		event.preventDefault();
		setZoom(zoom / 1.1);
	}
}

function handleWindowKeydown(event: KeyboardEvent): void {
	if (event.key === "Escape") oncancel();
}

/** 枠に見えている範囲を正方形の画像にする。WebP にできないブラウザ（古い Safari など）では JPEG にする */
async function confirmCrop(): Promise<void> {
	if (!image || saving) return;
	saving = true;
	const canvas = document.createElement("canvas");
	canvas.width = AVATAR_OUTPUT_SIZE;
	canvas.height = AVATAR_OUTPUT_SIZE;
	const context = canvas.getContext("2d");
	if (!context) {
		saving = false;
		return;
	}
	const { sx, sy, size } = sourceRect(crop, VIEW);
	context.imageSmoothingQuality = "high";
	context.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);

	const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
	let blob = await toBlob("image/webp");
	if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
	saving = false;
	if (!blob) return;
	const ext = blob.type === "image/webp" ? "webp" : "jpg";
	onconfirm(new File([blob], `avatar.${ext}`, { type: blob.type }));
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div
	class="cropper-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) oncancel();
	}}
>
	<div class="cropper" use:trapFocus role="dialog" aria-modal="true" aria-labelledby="cropper-title">
		<div class="cropper-header">
			<h2 id="cropper-title">アイコンの範囲を決める</h2>
			<button type="button" class="cropper-close" onclick={oncancel} aria-label="閉じる">
				<span class="i-lucide-x" aria-hidden="true"></span>
			</button>
		</div>

		{#if loadFailed}
			<p class="cropper-error" role="alert">この画像は読み込めませんでした。別の画像を選んでください。</p>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- 枠はドラッグと矢印キーで画像を動かす操作の場所（role="application"）なので、フォーカスでき、操作を受け取る -->
			<div
				class="cropper-stage"
				style:width="{VIEW}px"
				style:height="{VIEW}px"
				role="application"
				aria-label="アイコンにする範囲。ドラッグか矢印キーで動かし、＋／－で拡大・縮小します"
				tabindex="0"
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerUp}
				onwheel={handleWheel}
				onkeydown={handleStageKeydown}
			>
				{#if image}
					<img
						src={imageUrl}
						alt=""
						draggable="false"
						style:width="{natural.width * crop.scale}px"
						style:height="{natural.height * crop.scale}px"
						style:transform="translate({crop.x}px, {crop.y}px)"
					>
				{/if}
				<div class="cropper-circle" aria-hidden="true"></div>
			</div>

			<label class="cropper-zoom">
				<span class="i-lucide-zoom-out" aria-hidden="true"></span>
				<span class="sr-only">拡大・縮小</span>
				<input
					type="range"
					min="1"
					max={MAX_ZOOM}
					step="0.01"
					value={zoom}
					disabled={!image}
					oninput={(event) => setZoom(Number(event.currentTarget.value))}
				>
				<span class="i-lucide-zoom-in" aria-hidden="true"></span>
			</label>
		{/if}

		<div class="cropper-actions">
			<button type="button" class="btn btn-ghost" onclick={oncancel}>キャンセル</button>
			<button type="button" class="btn btn-primary" onclick={confirmCrop} disabled={!image || saving}>
				{saving ? "処理中..." : "この範囲で決定"}
			</button>
		</div>
	</div>
</div>

<style>
.cropper-backdrop {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: grid;
	place-items: center;
	padding: 16px;
	background: rgb(0 0 0 / 0.54);
}

.cropper {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
	width: min(360px, 100%);
	padding: 16px 20px 20px;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.34);
	color: var(--color-text);
}

.cropper-header {
	display: flex;
	align-items: center;
	align-self: stretch;
	gap: 8px;
}

.cropper-header h2 {
	flex: 1;
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.cropper-close {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 8px;
	background: none;
	color: var(--color-text-muted);
	cursor: pointer;
}

.cropper-close:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.cropper-close [class^="i-lucide"] {
	width: 18px;
	height: 18px;
}

.cropper-stage {
	position: relative;
	max-width: 100%;
	overflow: hidden;
	border-radius: 8px;
	background: var(--color-bg);
	cursor: grab;
	touch-action: none;
	user-select: none;
}

.cropper-stage:active {
	cursor: grabbing;
}

.cropper-stage:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}

.cropper-stage img {
	position: absolute;
	top: 0;
	left: 0;
	max-width: none;
	pointer-events: none;
}

/* 丸い枠の外を暗くして、アイコンに使われる範囲を示す */
.cropper-circle {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	/* サイト全体の角の形（squircle）ではなく、実際のアイコン（.avatar）と同じ真円にする */
	corner-shape: round;
	box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.5);
	outline: 2px solid rgb(255 255 255 / 0.8);
	pointer-events: none;
}

.cropper-zoom {
	display: flex;
	align-items: center;
	align-self: stretch;
	gap: 10px;
	color: var(--color-text-muted);
}

.cropper-zoom input {
	flex: 1;
	accent-color: var(--color-accent);
}

.cropper-zoom [class^="i-lucide"] {
	flex: none;
	width: 18px;
	height: 18px;
}

.cropper-actions {
	display: flex;
	align-self: stretch;
	justify-content: flex-end;
	gap: 8px;
}

.cropper-error {
	margin: 24px 0;
	color: var(--color-danger);
	font-size: 0.9rem;
}
</style>
