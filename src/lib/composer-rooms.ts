// 投稿欄のルーム選び（/api/anime/[id]/rooms）の応答の形

/** 投稿欄のルーム選びで、作品を選んだあとに出す1件分（話数のマス・特番） */
export interface ComposerRoomEntry {
	key: string;
	kind: "episode" | "special";
	/** 「第6話」「特番」など */
	label: string;
	/** マスに出す短い文字（「6」「特」） */
	chip: string;
	episodeNumber: number | null;
	specialKey: string | null;
	/** 今投稿できるか（まだ放送されていない話は選べない） */
	open: boolean;
}

export type ComposerRoomsResponse =
	| { roomType: "global"; lobbySessionId: string | null }
	| { roomType: "episode"; entries: ComposerRoomEntry[] };
