<script lang="ts">
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import { type RoomReminder, roomReminderStatus, roomReminderTime, roomReminderToastKey } from "$lib/room-reminders";

/**
 * 放送前のお知らせが鳴った瞬間に、パソコンは右下・スマホは上に小さく出す。
 * 同じお知らせ（通知の行が鳴った1回）は、この端末で一度だけ出す。数秒で消え、×でも閉じられる
 */

const SHOWN_KEY = "anipolis:room-reminder-toasts";
const SHOWN_LIMIT = 50;
const VISIBLE_LIMIT = 3;
const DISMISS_MS = 8_000;

let toasts = $state<RoomReminder[]>([]);
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function readShown(): string[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "[]");
		return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
	} catch {
		return [];
	}
}

function writeShown(ids: string[]) {
	try {
		localStorage.setItem(SHOWN_KEY, JSON.stringify(ids.slice(-SHOWN_LIMIT)));
	} catch {
		// 保存できない端末では、ページを読み直すたびに出直すだけ
	}
}

function markShown(reminder: RoomReminder) {
	const shown = readShown();
	const key = roomReminderToastKey(reminder);
	if (!shown.includes(key)) writeShown([...shown, key]);
}

function startTimer(id: string) {
	const previous = timers.get(id);
	if (previous) clearTimeout(previous);
	timers.set(
		id,
		setTimeout(() => dismiss(id), DISMISS_MS),
	);
}

// 一度に出すのは3件まで。はみ出した分は待たせ、前のが消えたら出す（実際に出したときに表示済みにする）
let waiting: RoomReminder[] = [];

function showWaiting() {
	while (toasts.length < VISIBLE_LIMIT && waiting.length > 0) {
		const [next, ...rest] = waiting;
		waiting = rest;
		if (!next) break;
		toasts = [...toasts, next];
		markShown(next);
		startTimer(next.id);
	}
}

/** layout が新しいお知らせを受け取るたびに呼ぶ。未読でまだ出していないものだけ出す */
export function notify(reminders: readonly RoomReminder[]) {
	const shown = readShown();
	for (const reminder of reminders) {
		if (reminder.read || shown.includes(roomReminderToastKey(reminder))) continue;
		if (toasts.some((toast) => toast.id === reminder.id)) {
			// 出ている間に次のタイミングで鳴り直したら、その場で差し替えて出し直す
			toasts = toasts.map((toast) => (toast.id === reminder.id ? reminder : toast));
			markShown(reminder);
			startTimer(reminder.id);
			continue;
		}
		waiting = [...waiting.filter((item) => item.id !== reminder.id), reminder];
	}
	showWaiting();
}

function dismiss(id: string) {
	const timer = timers.get(id);
	if (timer) clearTimeout(timer);
	timers.delete(id);
	toasts = toasts.filter((toast) => toast.id !== id);
	showWaiting();
}

$effect(() => () => {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
});
</script>

{#if toasts.length > 0}
	<div class="room-reminder-toasts" role="status" aria-live="polite">
		{#each toasts as toast (toast.id)}
			<div class="room-reminder-toast">
				<a href={toast.href} class="room-reminder-toast-link" onclick={() => dismiss(toast.id)}>
					<span class="room-reminder-toast-cover">
						{#if toast.cover_url}
							<img
								src={coverThumbSrc(toast.cover_url)}
								{@attach coverThumbFallback(toast.cover_url)}
								alt=""
							>
						{:else}
							<span class="i-lucide-calendar-clock" aria-hidden="true"></span>
						{/if}
					</span>
					<span class="room-reminder-toast-text">
						<span class="room-reminder-toast-title">{toast.title}</span>
						<span class="room-reminder-toast-meta">
							<span class="i-lucide-alarm-clock" aria-hidden="true"></span>
							{roomReminderStatus(toast, Date.now())}・{roomReminderTime(toast)}
							開始
						</span>
					</span>
				</a>
				<button
					type="button"
					class="room-reminder-toast-close"
					aria-label="お知らせを閉じる"
					onclick={() => dismiss(toast.id)}
				>
					<span class="i-lucide-x" aria-hidden="true"></span>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
.room-reminder-toasts {
	position: fixed;
	right: 20px;
	bottom: 20px;
	z-index: 900;
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: min(340px, calc(100vw - 24px));
	pointer-events: none;
}
.room-reminder-toast {
	position: relative;
	display: flex;
	align-items: stretch;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 14px;
	background: var(--color-bg-card);
	box-shadow: 0 10px 28px rgb(0 0 0 / 0.28);
	pointer-events: auto;
	animation: room-reminder-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.room-reminder-toast-link {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 12px;
	min-width: 0;
	padding: 10px 40px 10px 10px;
	color: var(--color-text);
	text-decoration: none;
}
.room-reminder-toast-link:hover {
	background: var(--color-surface-hover);
}
.room-reminder-toast-cover {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 40px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 6px;
	background: var(--color-border);
	color: var(--color-accent);
	font-size: 18px;
}
.room-reminder-toast-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.room-reminder-toast-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}
.room-reminder-toast-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 14px;
	font-weight: 700;
	line-height: 1.4;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.room-reminder-toast-meta {
	display: flex;
	align-items: center;
	gap: 4px;
	color: var(--color-accent);
	font-size: 12px;
	font-weight: 600;
}
.room-reminder-toast-close {
	position: absolute;
	top: 0;
	right: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	padding: 0;
	border: none;
	background: transparent;
	color: var(--color-text-muted);
	font-size: 16px;
	cursor: pointer;
}
.room-reminder-toast-close:hover {
	color: var(--color-text);
}
@keyframes room-reminder-in {
	from {
		opacity: 0;
		transform: translateY(16px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: none;
	}
}
/* スマホは右下に投稿ボタン、ルームでは下に入力欄があるので、上から降ろす */
@media (max-width: 960px) {
	.room-reminder-toasts {
		top: calc(env(safe-area-inset-top) + 12px);
		right: 12px;
		bottom: auto;
		left: 12px;
		width: auto;
	}
	.room-reminder-toast {
		animation-name: room-reminder-in-top;
	}
}
@keyframes room-reminder-in-top {
	from {
		opacity: 0;
		transform: translateY(-16px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: none;
	}
}
@media (prefers-reduced-motion: reduce) {
	.room-reminder-toast {
		animation: none;
	}
}
</style>
