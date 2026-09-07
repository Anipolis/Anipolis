export interface InviteCodeState {
	value: string;
	dirty: boolean;
	source: string | null;
	linkSource: string;
}

/**
 * Reconcile server-provided invite data with the local input state.
 *
 * A new non-empty invite query is an explicit link navigation and owns the
 * field, even if an earlier link or manual input made the state dirty. Other
 * data updates (including form results, cookie hydration, and mode changes)
 * never overwrite manual input.
 */
export function syncInviteCodeState(
	state: InviteCodeState,
	dataInviteCode: string | null | undefined,
	queryInviteCode: string | null | undefined,
): void {
	const nextInviteCode = dataInviteCode ?? "";
	const nextInviteLink = queryInviteCode?.trim() ?? "";
	const isNewInviteLink = Boolean(nextInviteLink) && nextInviteLink !== state.linkSource;
	state.linkSource = nextInviteLink;

	if (nextInviteCode === state.source) {
		if (isNewInviteLink) {
			state.value = nextInviteCode;
			state.dirty = false;
		}
		return;
	}

	state.source = nextInviteCode;
	if (isNewInviteLink || !state.dirty) {
		state.value = nextInviteCode;
		if (isNewInviteLink) state.dirty = false;
	}
}
