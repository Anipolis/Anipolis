function toDateStr(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function isEligibleForRoomLog(season: string | null): boolean {
	if (!season) return false;
	const parts = season.split("-");
	const y = parseInt(parts[0] ?? "", 10);
	const name = parts[1];
	if (y > 2026) return true;
	return y === 2026 && name !== "winter";
}

export function calcBroadcastEpisodes(
	airedFrom: string,
	airedTo: string | null,
	broadcastDay: number,
): Array<{ number: number; date: string }> {
	const start = new Date(airedFrom);
	const today = new Date();
	const end = airedTo ? new Date(airedTo) : today;
	const cutoff = end < today ? end : today;

	const first = new Date(start);
	while (first.getDay() !== broadcastDay) {
		first.setDate(first.getDate() + 1);
	}

	const dates: string[] = [];
	const cur = new Date(first);
	while (cur <= cutoff) {
		dates.push(toDateStr(cur));
		cur.setDate(cur.getDate() + 7);
	}

	return dates.reverse().map((date, i) => ({ number: dates.length - i, date }));
}
