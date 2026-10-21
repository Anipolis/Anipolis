import { hasEpisodeRooms } from "$lib/episode-room";
import { buildBroadcastEpisodeLog } from "$lib/server/broadcast-episode-log";
import type { Anime, BroadcastRoomOverride } from "$lib/types";

/**
 * 話数ルームにつながっていない放送枠を、どこにつなぐかを決める（#484）。
 * scripts/backfill-episode-room-sessions.ts から使う（決める部分だけをここに置いてテストする）。
 *
 * - 作品ページの推定（buildBroadcastEpisodeLog）で 1 話分の話数が出た枠は、その話数を保存する
 *   （放送枠のトリガーが話数ルームにつなぐ）。しょぼいの話数があれば逆算、無ければ放送を終えた作品だけ
 *   第1話からの週次カウント（承認済みの例外運用）
 * - 推定できない枠・話数ルームの無い作品の枠は、特番ルームに入れる（175 のトリガーが作る）
 * - 休止日の枠は触らない
 * - 推定の話数が、別の日の話数の付いた枠（しょぼい由来など）や、総話数と食い違うときは、誤りの恐れがあるので
 *   特番ルームに入れて理由を残す（管理者があとから話数ルームに統合できる）
 * - ただし、しょぼい同期の前に曜日と時刻から機械的に作った古い枠（schedule_source が無い）で、投稿の受付も
 *   締め切ったものは、特番ルームを作らずそのままにする（leave）。実際には放送の無かった週の枠であることが多く、
 *   「M月D日の特番」という中身の無いルームが並ぶだけになるため。締め切った枠には投稿が入らないので表示にも出ない
 */

export type BackfillAnime = Pick<
	Anime,
	| "id"
	| "type"
	| "room_type"
	| "season"
	| "aired_from"
	| "aired_to"
	| "broadcast_day"
	| "broadcast_time"
	| "episode_total"
>;

export type BackfillSession = {
	id: string;
	room_date: string;
	episode_number: number | null;
	episode_title: string | null;
	episode_room_id: string | null;
	posting_opens_at: string | null;
	posting_closes_at: string | null;
	/** しょぼい由来なら "syobocal"。古い枠（曜日と時刻から作ったもの）は null */
	schedule_source: string | null;
	/** 取り込みの検査で話数が疑わしいとして、話数を空にした枠（source_snapshot.episode_anomaly.applied） */
	episode_anomaly_applied: boolean;
};

export type BackfillPlan = {
	/** 推定の話数を保存する枠 */
	assign: { sessionId: string; date: string; episodeNumber: number }[];
	/** 特番ルームに入れる枠（reason は推定できなかった理由） */
	special: { sessionId: string; date: string; reason: string }[];
	/** 休止日なので触らない枠 */
	cancelled: { sessionId: string; date: string }[];
	/** 締め切った古い枠で、話数を推定できないのでそのままにする枠 */
	leave: { sessionId: string; date: string; reason: string }[];
};

export function planEpisodeRoomBackfill(
	anime: BackfillAnime,
	sessions: readonly BackfillSession[],
	overrides: readonly BroadcastRoomOverride[],
	now: Date = new Date(),
): BackfillPlan {
	const plan: BackfillPlan = { assign: [], special: [], cancelled: [], leave: [] };
	const cancelledDates = new Set(overrides.filter((override) => override.is_cancelled).map((o) => o.room_date));
	const unroomed = sessions
		.filter((session) => session.episode_room_id === null)
		.sort((a, b) => a.room_date.localeCompare(b.room_date));
	if (unroomed.length === 0) return plan;

	const nowIso = now.toISOString();
	const toSpecial = (session: BackfillSession, reason: string) => {
		const closed = session.posting_closes_at !== null && session.posting_closes_at <= nowIso;
		if (session.schedule_source === null && closed) {
			plan.leave.push({ sessionId: session.id, date: session.room_date.slice(0, 10), reason });
		} else {
			plan.special.push({ sessionId: session.id, date: session.room_date.slice(0, 10), reason });
		}
	};

	if (!hasEpisodeRooms(anime)) {
		for (const session of unroomed) {
			if (cancelledDates.has(session.room_date)) {
				plan.cancelled.push({ sessionId: session.id, date: session.room_date });
			} else {
				toSpecial(session, "話数ルームの無い作品");
			}
		}
		return plan;
	}

	const snapshots = sessions.map((session) => ({
		date: session.room_date.slice(0, 10),
		start: session.episode_number,
		end: session.episode_number,
		// 推定は副題（ラベル）の付いた話数の無い回を特番とみなして飛ばす。話数が疑わしいだけの本編の回は
		// 副題を外して渡し、前後の回から話数を推定させる（ハルさんの方針: 推定の話数でつなぐ）
		label: session.episode_anomaly_applied ? null : session.episode_title,
		opened: session.posting_opens_at !== null && session.posting_opens_at <= nowIso,
	}));
	const slotByDate = new Map(
		buildBroadcastEpisodeLog(anime, snapshots, overrides, now).map((slot) => [slot.date, slot]),
	);
	// 日付 → 話数（保存済み、または推定で 1 話分に決まったもの）
	const numberByDate = new Map<string, number>();
	for (const session of sessions) {
		const date = session.room_date.slice(0, 10);
		const slot = slotByDate.get(date);
		const number =
			session.episode_number ??
			(slot?.start !== null && slot?.start === slot?.end ? (slot?.start ?? null) : null);
		if (number !== null) numberByDate.set(date, number);
	}
	fillBracketedGaps(sessions, cancelledDates, overrides, numberByDate);
	// 別の日の、話数の付いた枠（しょぼい由来など）が使っている話数。推定と重なったら推定のほうを疑う
	const numberedElsewhere = new Map<number, string>();
	for (const session of sessions) {
		if (session.episode_number !== null) numberedElsewhere.set(session.episode_number, session.room_date);
	}
	const assignedNumbers = new Set<number>();

	for (const session of unroomed) {
		const date = session.room_date.slice(0, 10);
		if (cancelledDates.has(date)) {
			plan.cancelled.push({ sessionId: session.id, date });
			continue;
		}
		const episode = numberByDate.get(date) ?? null;
		if (episode === null) {
			const label = slotByDate.get(date)?.label;
			toSpecial(session, label ? `ラベル「${label}」` : "話数を推定できない");
			continue;
		}
		if (episode < 1 || episode > 9999) {
			toSpecial(session, `推定の話数 ${episode} が範囲外`);
			continue;
		}
		if (anime.episode_total !== null && anime.episode_total !== undefined && episode > anime.episode_total) {
			toSpecial(session, `推定の第${episode}話が総話数 ${anime.episode_total} を超える`);
			continue;
		}
		const otherDate = numberedElsewhere.get(episode);
		if (otherDate !== undefined && otherDate !== date) {
			toSpecial(session, `推定の第${episode}話は ${otherDate} の枠と重なる`);
			continue;
		}
		if (assignedNumbers.has(episode)) {
			toSpecial(session, `推定の第${episode}話が別の日と重なる`);
			continue;
		}
		assignedNumbers.add(episode);
		plan.assign.push({ sessionId: session.id, date, episodeNumber: episode });
	}
	return plan;
}

/**
 * 推定（buildBroadcastEpisodeLog）は最初のアンカーより前を逆算するだけで、アンカーとアンカーの間の穴は埋めない。
 * 話数が疑わしいとして話数を空にした本編の回は、たいてい話数の分かる回に挟まれているので、ここで埋める。
 * 前後を話数の分かる回に挟まれた「話数の無い回」の並びが、話数の差とちょうど同じ数のときだけ順に振る
 * （例: 第2話と第4話の間に 1 回 → 第3話）。休止日と、特番・総集編の回は並びに入れない（話数のカウントも消費しない。
 * 推定と同じ扱い）。特番・総集編とみなすのは、副題だけの回（話数の疑わしい回を除く）と、管理者の上書きでラベルが
 * 付いた回・話数のカウントを進めない（episode_count_increment = 0）回。
 * 数が合わない並び（休止の付け忘れ・特番の混入など）は推定しない。numberByDate を書き換える。
 */
function fillBracketedGaps(
	sessions: readonly BackfillSession[],
	cancelledDates: ReadonlySet<string>,
	overrides: readonly BroadcastRoomOverride[],
	numberByDate: Map<string, number>,
) {
	const overrideByDate = new Map(overrides.map((override) => [override.room_date, override]));
	const ordered = sessions
		.map((session) => ({ session, date: session.room_date.slice(0, 10) }))
		.filter(({ session, date }) => {
			if (cancelledDates.has(date)) return false;
			if (numberByDate.has(date)) return true;
			const override = overrideByDate.get(date);
			// 管理者が上書きで特番・総集編にした回は、副題の有無や話数の疑わしさに関係なく番号を振らない
			if (override?.episode_label?.trim() || override?.episode_count_increment === 0) return false;
			// 副題だけの回は特番（話数が疑わしいだけの本編の回は除く）
			return !(session.episode_title !== null && !session.episode_anomaly_applied);
		})
		.sort((a, b) => a.date.localeCompare(b.date));

	let index = 0;
	while (index < ordered.length) {
		if (numberByDate.has(ordered[index]?.date ?? "")) {
			index += 1;
			continue;
		}
		const runStart = index;
		while (index < ordered.length && !numberByDate.has(ordered[index]?.date ?? "")) index += 1;
		const before = runStart > 0 ? numberByDate.get(ordered[runStart - 1]?.date ?? "") : undefined;
		const after = index < ordered.length ? numberByDate.get(ordered[index]?.date ?? "") : undefined;
		const runLength = index - runStart;
		if (before === undefined || after === undefined || after - before - 1 !== runLength) continue;
		for (let offset = 0; offset < runLength; offset += 1) {
			const date = ordered[runStart + offset]?.date;
			if (date) numberByDate.set(date, before + offset + 1);
		}
	}
}
