import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Anime, Post, TrendingHashtag } from "$lib/types";

/**
 * LiveRoomView が期待するデータ形状。
 * 放送ルーム（/rooms/anime/[id]/[date], lobby）とイベントルーム（/events/[id]）の
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
		kind: "episode" | "global" | "event";
		hashtag: string;
		scheduled_at: string;
		posting_opens_at: string;
		posting_closes_at: string;
		duration_minutes: number | null;
		title: string;
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
