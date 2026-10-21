import type { Post } from "$lib/types";

const reactions = [
	"きたあああ",
	"ここの作画すき",
	"かわいい",
	"え？",
	"この間の取り方、すごくいい",
	"そこで終わるの！？",
	"音楽も最高",
	"来週まで待てない…",
];
const names = ["みかんねこ", "ぽち。", "tomakura", "毎週この時間を楽しみにしているアニメ好き", "しおり", "Liner"];

export function makeTimelinePosts(count = 40): Post[] {
	return Array.from({ length: count }, (_, index) => {
		const author = Math.floor(index / 2) % names.length;
		return {
			id: `preview-${index}`,
			user_id: `preview-user-${author}`,
			username: `viewer_${author}`,
			display_name: names[author] ?? "視聴者",
			avatar_url: null,
			content:
				index === 12
					? "最初は何気ない会話だと思っていたけど、ここで第1話の台詞につながるんだ。\nもう一回見返したくなる。背景の色が変わっていくところも好き。"
					: (reactions[index % reactions.length] ?? "きた"),
			created_at: new Date(Date.UTC(2026, 8, 8, 12, 0, index * 20)).toISOString(),
			parent_id: null,
			quoted_post_id: null,
			quoted_post: null,
			hashtags: [],
			image_urls: index === 18 ? ["/anipolis-logo-light.png"] : [],
			like_count: index % 4 === 0 ? 8 : index % 3,
			repost_count: 0,
			reply_count: 0,
			liked_by_me: false,
			reposted_by_me: false,
			bookmarked_by_me: false,
			anime_id: "42",
			broadcast_room_session_id: "preview-room",
			event_room: null,
			anime_quote: {
				id: "42",
				title: "星をめぐる旅",
				cover_url: null,
				user_score: null,
				official_hashtag: null,
				room_href: null,
				episode_number: null,
			},
			exchange_share: null,
			cw_anime_id: index === 22 ? "42" : null,
			cw_anime: index === 22 ? { id: "42", title: "星をめぐる旅", cover_url: null } : null,
			repost_context: null,
		};
	});
}
