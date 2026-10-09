/**
 * マイリスト自動保存のキュー。
 *
 * 行（アニメID）ごとに次を保証する。
 * - 同じ行の保存リクエストは常に1本ずつ直列に送る（順序保証）。
 * - 送信中に新しい編集が入った場合、古いリクエストの結果は状態に反映せず、
 *   完了後に最新値をもう一度送る（古い応答が最新値を上書きしない）。
 * - 失敗した行は最新の編集値を保持し、retry() で同じ値を再送できる。
 *
 * Svelte に依存しない純粋なロジックとして切り出し、単体テストの対象にする。
 */

export type RowSaveStatus = "idle" | "pending" | "saving" | "saved" | "failed";

export type RowSaveState<T> = {
	status: RowSaveStatus;
	/** 最後に編集された値。失敗時の再試行にもこの値を使う */
	value: T;
	/** 失敗時のメッセージ */
	error: string | null;
};

export type SaveResult = { ok: true } | { ok: false; message: string };

export type SaveQueueOptions<T> = {
	/** 実際の保存処理。例外を投げた場合も失敗として扱う */
	save: (key: string, value: T) => Promise<SaveResult>;
	/** 行の状態が変わるたびに呼ばれる。UI へ反映する用途 */
	onChange?: (key: string, state: RowSaveState<T>) => void;
	/** 編集からリクエスト送信までの待ち時間 */
	debounceMs?: number;
	/** 「保存しました」表示を idle に戻すまでの時間。0 以下なら戻さない */
	savedTtlMs?: number;
	/** 例外を失敗メッセージに変換する */
	errorMessage?: (error: unknown) => string;
};

type RowEntry<T> = {
	state: RowSaveState<T>;
	/** 編集ごとに進む連番。応答が最新かどうかの判定に使う */
	seq: number;
	/** まだ送っていない編集があるか */
	dirty: boolean;
	/** 送信ループが動作中か */
	running: boolean;
	debounceTimer: ReturnType<typeof setTimeout> | null;
	savedTimer: ReturnType<typeof setTimeout> | null;
};

export const DEFAULT_SAVE_DEBOUNCE_MS = 500;
export const DEFAULT_SAVED_TTL_MS = 2500;
export const DEFAULT_SAVE_ERROR_MESSAGE = "保存できませんでした";

function defaultErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return DEFAULT_SAVE_ERROR_MESSAGE;
}

export function createSaveQueue<T>(options: SaveQueueOptions<T>) {
	const debounceMs = options.debounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS;
	const savedTtlMs = options.savedTtlMs ?? DEFAULT_SAVED_TTL_MS;
	const toErrorMessage = options.errorMessage ?? defaultErrorMessage;
	const rows = new Map<string, RowEntry<T>>();
	// dispose() 後は UI へ通知しないが、送信中の行の後続編集は送り切る
	let disposed = false;

	function emit(key: string, entry: RowEntry<T>) {
		if (disposed) return;
		options.onChange?.(key, { ...entry.state });
	}

	function setState(key: string, entry: RowEntry<T>, patch: Partial<RowSaveState<T>>) {
		entry.state = { ...entry.state, ...patch };
		emit(key, entry);
	}

	function clearTimers(entry: RowEntry<T>) {
		if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
		if (entry.savedTimer) clearTimeout(entry.savedTimer);
		entry.debounceTimer = null;
		entry.savedTimer = null;
	}

	async function run(key: string, entry: RowEntry<T>) {
		entry.running = true;
		try {
			// 送信中に新しい編集が入った場合はループを続け、最新値を送り直す
			while (entry.dirty) {
				entry.dirty = false;
				const seq = entry.seq;
				const value = entry.state.value;
				setState(key, entry, { status: "saving", error: null });

				let result: SaveResult;
				try {
					result = await options.save(key, value);
				} catch (error) {
					result = { ok: false, message: toErrorMessage(error) };
				}

				// 行が削除された、または応答待ちの間に新しい編集が入った場合は
				// この応答を状態に反映しない（古い応答で最新値を上書きしない）
				if (rows.get(key) !== entry) return;
				if (entry.seq !== seq) continue;

				if (result.ok) {
					setState(key, entry, { status: "saved", error: null });
					if (savedTtlMs > 0 && !disposed) {
						entry.savedTimer = setTimeout(() => {
							entry.savedTimer = null;
							if (entry.seq === seq && entry.state.status === "saved") {
								setState(key, entry, { status: "idle" });
							}
						}, savedTtlMs);
					}
				} else {
					setState(key, entry, { status: "failed", error: result.message });
				}
			}
		} finally {
			entry.running = false;
		}
	}

	function start(key: string, entry: RowEntry<T>) {
		if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
		entry.debounceTimer = null;
		entry.dirty = true;
		// 送信ループが動いていれば dirty を見て最新値を送り直す
		if (!entry.running) void run(key, entry);
	}

	function ensure(key: string, value: T): RowEntry<T> {
		let entry = rows.get(key);
		if (!entry) {
			entry = {
				state: { status: "idle", value, error: null },
				seq: 0,
				dirty: false,
				running: false,
				debounceTimer: null,
				savedTimer: null,
			};
			rows.set(key, entry);
		}
		return entry;
	}

	return {
		/** 編集を受け付け、デバウンス後に保存する */
		schedule(key: string, value: T) {
			const entry = ensure(key, value);
			entry.seq += 1;
			if (entry.savedTimer) clearTimeout(entry.savedTimer);
			entry.savedTimer = null;
			if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
			setState(key, entry, { status: "pending", value, error: null });
			entry.debounceTimer = setTimeout(() => {
				entry.debounceTimer = null;
				start(key, entry);
			}, debounceMs);
		},

		/** 失敗した行を、保持している最新値でもう一度送る */
		retry(key: string) {
			const entry = rows.get(key);
			if (!entry || entry.state.status !== "failed") return;
			start(key, entry);
		},

		/** デバウンス待ちの行をすべて即時送信する（画面移動前などに使う） */
		flush() {
			for (const [key, entry] of rows) {
				if (entry.debounceTimer) start(key, entry);
			}
		},

		/** 行の保存予定を取り消して状態を破棄する（行削除時に使う） */
		cancel(key: string) {
			const entry = rows.get(key);
			if (!entry) return;
			clearTimers(entry);
			rows.delete(key);
		},

		/** まだサーバーに反映されていない行（保存待ち・送信中・失敗）のキー */
		unsavedKeys(): string[] {
			const keys: string[] = [];
			for (const [key, entry] of rows) {
				const status = entry.state.status;
				if (status === "pending" || status === "saving" || status === "failed") keys.push(key);
			}
			return keys;
		},

		getState(key: string): RowSaveState<T> | undefined {
			const entry = rows.get(key);
			return entry ? { ...entry.state } : undefined;
		},

		/**
		 * コンポーネント破棄時に使う。表示用タイマーを止めて UI 通知をやめるが、行は消さない:
		 * 保存中の行に後続の編集（dirty）があれば送信ループがそれを送り切り、デバウンス待ちの行は
		 * 即時送信する。rows を消すと、応答待ちの間に入った最新の編集が一度も送られずに失われる。
		 */
		dispose() {
			disposed = true;
			for (const [key, entry] of rows) {
				if (entry.savedTimer) clearTimeout(entry.savedTimer);
				entry.savedTimer = null;
				if (entry.debounceTimer) start(key, entry);
			}
		},
	};
}

export type SaveQueue<T> = ReturnType<typeof createSaveQueue<T>>;
