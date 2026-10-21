import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Anime, Post, RoomAiring, TrendingHashtag } from "$lib/types";

/**
 * LiveRoomView が期待するデータ形状。
 * 放送ルーム（/rooms/anime/[id]/[date], lobby）、話数ルーム（/rooms/anime/[id]/ep/[n]）、イベントルーム（/events/[id]）の
 * どちらのローダーもこの形状に合わせて返す。
 * anime はイベントにアニメが紐づいていない場合 null になりうる。
 */
type RoomRealtimeClient = Pick<SupabaseClient, "channel" | "removeChannel">;

export type LiveRoomData = {
	supabase: RoomRealtimeClient;
	anime: Anime | null;
	room: {
		session_id: string;
		date: string;
		/** episode_room は話数ルーム（153）。session_id にはルーム ID が入る */
		kind: "episode" | "global" | "event" | "episode_room";
		hashtag: string;
		scheduled_at: string;
		posting_opens_at: string;
		posting_closes_at: string;
		duration_minutes: number | null;
		title: string;
		/** 以下は話数ルームだけ */
		episode_number?: number;
		/** 開く時刻が決まっているか（未定の話は「まだ投稿できない」とだけ出す） */
		opens_at_known?: boolean;
		/** ルームの中の放送枠（見出しと「ライブ開始地点へ」に使う） */
		airings?: RoomAiring[];
		/** ?airing= で指定された放送枠。最初にその位置を表示する */
		initial_airing_id?: string | null;
		/** 読み込んだ分より前に投稿があるか（「前の投稿を読み込む」を出す） */
		has_older_posts?: boolean;
		/** 前へ読み足す境界（除外前の最古の行）。表示中の先頭投稿ではなくこれを使う */
		older_cursor?: { createdAt: string; id: string } | null;
	};
	posts: Post[];
	trending: TrendingHashtag[];
	animeTrending: Anime[];
	user: User | null;
	roomExperiment: {
		enabled: boolean;
		sessionId?: string | undefined;
	};
	roomExitSurvey: {
		experimentRunId: string | null;
		alreadyAnswered: boolean;
		postCount: number;
		surveyVersion: string;
	};
};

export type LiveRoomActionData =
	| {
			message?: string;
			success?: boolean;
			postId?: string;
			deleted?: boolean;
			liked?: boolean;
			bookmarked?: boolean;
			reposted?: boolean;
	  }
	| null
	| undefined;
