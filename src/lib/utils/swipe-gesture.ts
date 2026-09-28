/**
 * モバイル横スワイプ(ページ遷移)の判定ロジック。
 *
 * DOM に依存しない純粋関数として切り出し、以下を判定する:
 * - タッチ開始位置がスワイプ対象として妥当か(入力欄・ダイアログ・横スクローラー・文字選択中は除外)
 * - ジェスチャーが「横方向の意図」を持つか(縦スクロールや文字選択を横取りしない)
 *
 * Element を直接受け取らず最小限のインターフェースで扱うため、
 * テストでは疑似要素オブジェクトで検証できる。
 */

/** Element の必要最小限の形。実 DOM Element はこの型を構造的に満たす。 */
export type SwipeElementLike = {
	tagName: string;
	parentElement: SwipeElementLike | null;
	getAttribute(name: string): string | null;
	isContentEditable?: boolean;
	classList?: { contains(name: string): boolean };
};

/** window.getSelection() の必要最小限の形 */
export type SwipeSelectionLike = {
	isCollapsed: boolean;
	rangeCount: number;
	toString(): string;
};

export type SwipeStartDecision =
	| "TRACK"
	| "IGNORE_TARGET"
	| "IGNORE_EDITABLE"
	| "IGNORE_DIALOG"
	| "IGNORE_CHROME"
	| "IGNORE_SCROLLER"
	| "IGNORE_SELECTION"
	| "IGNORE_EDGE"
	| "IGNORE_MULTITOUCH";

export type SwipeAxis = "undecided" | "horizontal" | "vertical";

export type SwipeResult = "WAITING" | "SWIPE_NEXT" | "SWIPE_PREV" | "IGNORE_SHORT" | "IGNORE_VERTICAL" | "IGNORE_ROUTE";

/** 横スワイプと判定する最小移動量(px) */
export const SWIPE_MIN_DISTANCE = 42;
/** 横移動量が縦移動量の何倍以上なら「横の意図」とみなすか */
export const SWIPE_HORIZONTAL_RATIO = 2;
/** 軸(縦/横)を確定させる最小移動量(px)。これ未満は判定を保留する */
export const SWIPE_AXIS_LOCK_SLOP = 10;
/** ブラウザーの「戻る/進む」エッジジェスチャーと競合しないよう無視する画面端の幅(px) */
export const SWIPE_EDGE_EXCLUSION = 24;

/** アプリのナビゲーション用クロム(スワイプ対象外)を表すクラス名 */
export const SWIPE_IGNORED_CHROME_CLASSES = [
	"mobile-bottom-nav",
	"mobile-drawer",
	"mobile-drawer-backdrop",
	"mobile-header",
] as const;

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "combobox", "slider", "spinbutton"]);
const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);

/** 入力・編集系の要素か(input type=range などのスライダーも含む) */
export function isEditableElement(element: SwipeElementLike): boolean {
	const tag = element.tagName.toUpperCase();
	if (EDITABLE_TAGS.has(tag)) return true;
	if (element.isContentEditable) return true;
	const contentEditable = element.getAttribute("contenteditable");
	if (contentEditable !== null && contentEditable.toLowerCase() !== "false") return true;
	const role = element.getAttribute("role")?.toLowerCase();
	return role !== undefined && EDITABLE_ROLES.has(role);
}

/** ダイアログ・モーダル(の内側)か */
export function isDialogElement(element: SwipeElementLike): boolean {
	if (element.tagName.toUpperCase() === "DIALOG") return true;
	const role = element.getAttribute("role")?.toLowerCase();
	if (role !== undefined && DIALOG_ROLES.has(role)) return true;
	return element.getAttribute("aria-modal") === "true";
}

/** ナビゲーション用クロム(下部ナビ・ドロワー・ヘッダー)か */
export function isNavigationChrome(element: SwipeElementLike): boolean {
	const classList = element.classList;
	if (!classList) return false;
	return SWIPE_IGNORED_CHROME_CLASSES.some((name) => classList.contains(name));
}

/** 文字選択中か(範囲選択があり、空文字でない) */
export function hasTextSelection(selection: SwipeSelectionLike | null | undefined): boolean {
	if (!selection) return false;
	if (selection.rangeCount === 0 || selection.isCollapsed) return false;
	return selection.toString().length > 0;
}

/** 画面端(戻るジェスチャー領域)から始まるタッチか */
export function startsInEdgeZone(startX: number, viewportWidth: number, edge = SWIPE_EDGE_EXCLUSION): boolean {
	if (viewportWidth <= 0) return false;
	return startX <= edge || startX >= viewportWidth - edge;
}

export type SwipeStartContext = {
	/** タッチ開始要素。Element でない場合は null */
	target: SwipeElementLike | null;
	/** 祖先走査の上限(この要素自身は検査しない)。null なら根まで走査する */
	boundary?: SwipeElementLike | null;
	/** 要素が横スクロール可能か。DOM 計測が必要なので呼び出し側から注入する */
	isHorizontalScroller?: (element: SwipeElementLike) => boolean;
	selection?: SwipeSelectionLike | null;
	touchCount?: number;
	startX?: number;
	viewportWidth?: number;
};

/**
 * タッチ開始時に「このタッチをスワイプ候補として追跡してよいか」を判定する。
 * 除外理由を返すので、開発時のデバッグ表示にも使える。
 */
export function decideSwipeStart(context: SwipeStartContext): SwipeStartDecision {
	const { target, boundary = null, isHorizontalScroller, selection, touchCount = 1, startX, viewportWidth } = context;

	if (touchCount > 1) return "IGNORE_MULTITOUCH";
	if (!target) return "IGNORE_TARGET";
	if (hasTextSelection(selection)) return "IGNORE_SELECTION";
	if (startX !== undefined && viewportWidth !== undefined && startsInEdgeZone(startX, viewportWidth)) {
		return "IGNORE_EDGE";
	}

	for (
		let element: SwipeElementLike | null = target;
		element && element !== boundary;
		element = element.parentElement
	) {
		if (isEditableElement(element)) return "IGNORE_EDITABLE";
		if (isDialogElement(element)) return "IGNORE_DIALOG";
		if (isNavigationChrome(element)) return "IGNORE_CHROME";
		if (isHorizontalScroller?.(element)) return "IGNORE_SCROLLER";
	}
	return "TRACK";
}

/**
 * ジェスチャーの軸を確定する。一度確定した軸はジェスチャー終了まで変えない
 * (縦スクロール中に指が横へ流れてもページ遷移しないようにするため)。
 */
export function resolveSwipeAxis(
	current: SwipeAxis,
	deltaX: number,
	deltaY: number,
	options: { slop?: number; ratio?: number } = {},
): SwipeAxis {
	if (current !== "undecided") return current;
	const { slop = SWIPE_AXIS_LOCK_SLOP, ratio = SWIPE_HORIZONTAL_RATIO } = options;
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	if (Math.max(absX, absY) < slop) return "undecided";
	return absX >= absY * ratio ? "horizontal" : "vertical";
}

/** 横スワイプ距離が十分で、かつ横方向の意図があるか */
export function isHorizontalSwipe(
	deltaX: number,
	deltaY: number,
	options: { minDistance?: number; ratio?: number } = {},
): boolean {
	const { minDistance = SWIPE_MIN_DISTANCE, ratio = SWIPE_HORIZONTAL_RATIO } = options;
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	return absX >= minDistance && absX >= absY * ratio;
}

export type SwipeNavigationContext = {
	/** 現在のタブ位置。該当なしは -1 */
	currentIndex: number;
	tabCount: number;
};

/**
 * 移動量と軸から最終的なスワイプ結果を返す。
 * 軸が縦に確定している場合は距離に関わらず無視する。
 */
export function classifySwipe(
	deltaX: number,
	deltaY: number,
	axis: SwipeAxis,
	navigation: SwipeNavigationContext,
	options: { minDistance?: number; ratio?: number } = {},
): SwipeResult {
	if (axis === "vertical") return "IGNORE_VERTICAL";
	if (Math.abs(deltaX) < (options.minDistance ?? SWIPE_MIN_DISTANCE)) return "IGNORE_SHORT";
	if (!isHorizontalSwipe(deltaX, deltaY, options)) return "IGNORE_VERTICAL";

	const { currentIndex, tabCount } = navigation;
	if (currentIndex < 0) return "IGNORE_ROUTE";
	if (deltaX < 0 && currentIndex >= tabCount - 1) return "IGNORE_ROUTE";
	if (deltaX > 0 && currentIndex <= 0) return "IGNORE_ROUTE";
	return deltaX < 0 ? "SWIPE_NEXT" : "SWIPE_PREV";
}
