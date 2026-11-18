/**
 * カタログの放送状態（anime.status）だけを直すための計画（#594）。
 * resolve:anime-catalog は作品の行をまるごと作り直すので、過去シーズンで流し直すと
 * スタジオ名・放送の枠など判断待ちの項目まで変わる。--only-status では、既にある行の status だけを書き換える。
 */
export type StatusUpdatePlan = {
	/** 新しい status ごとの mal_id（書き込みはこの単位でまとめる） */
	byStatus: Map<string, number[]>;
	/** 「古い → 新しい」ごとの件数（確認用） */
	transitions: Map<string, number>;
	/** カタログにまだ行が無いので触らない作品の数 */
	skippedMissing: number;
};

export function planStatusUpdates(
	resolved: readonly { mal_id: number; status: string | null }[],
	currentStatusByMalId: ReadonlyMap<number, string | null>,
): StatusUpdatePlan {
	const byStatus = new Map<string, number[]>();
	const transitions = new Map<string, number>();
	let skippedMissing = 0;
	for (const { mal_id, status } of resolved) {
		if (!currentStatusByMalId.has(mal_id)) {
			skippedMissing += 1;
			continue;
		}
		const current = currentStatusByMalId.get(mal_id) ?? null;
		// 決められなかった（null）ときは、今の値を消さない
		if (!status || status === current) continue;
		byStatus.set(status, [...(byStatus.get(status) ?? []), mal_id]);
		const key = `${current ?? "(空)"} → ${status}`;
		transitions.set(key, (transitions.get(key) ?? 0) + 1);
	}
	return { byStatus, transitions, skippedMissing };
}
