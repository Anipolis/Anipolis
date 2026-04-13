import type { Post } from "$lib/types/post";

export const mockTimeline: Post[] = [
	{
		id: "1",
		user: {
			name: "アニメ好き太郎",
			icon: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Taro",
		},
		content: "呪術廻戦の最新話やばすぎた！！宿儺の領域展開の作画が神がかってた 🔥 毎週楽しみすぎる",
		hashtags: ["呪術廻戦", "アニメ"],
		postedAt: new Date("2026-04-07T12:30:00"),
		relatedAnime: { id: "jujutsu-kaisen", title: "呪術廻戦" },
		likes: 142,
		reposts: 38,
		liked: false,
		reposted: false,
	},
	{
		id: "2",
		user: {
			name: "深夜アニメ戦士",
			icon: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Warrior",
		},
		content: "フォールガイズのコラボイベントでワンピース衣装きてる！可愛すぎるだろ 🏴‍☠️",
		hashtags: ["ワンピース", "フォールガイズ", "コラボ"],
		postedAt: new Date("2026-04-07T11:15:00"),
		relatedAnime: { id: "one-piece", title: "ワンピース" },
		likes: 89,
		reposts: 22,
		liked: true,
		reposted: false,
	},
	{
		id: "3",
		user: {
			name: "声優オタク美桜",
			icon: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Mio",
		},
		content:
			"ぼっち・ざ・ろっく！の劇場版いつくるんだろう…待ちきれない 🎸 ほととぎす演唱會のBlu-rayはもう何周したかわからない",
		hashtags: ["ぼざろ", "ぼっち・ざ・ろっく"],
		postedAt: new Date("2026-04-07T10:00:00"),
		relatedAnime: { id: "bocchi-the-rock", title: "ぼっち・ざ・ろっく！" },
		likes: 256,
		reposts: 71,
		liked: false,
		reposted: true,
	},
	{
		id: "4",
		user: {
			name: "キメツチ大好き",
			icon: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Kimetsu",
		},
		content: "鬼滅の刃 柱稽古編見終わった！無限城編が楽しみすぎる。アニメーション品質が毎回すごい 🗡️",
		hashtags: ["鬼滅の刃", "柱稽古編", "無限城編"],
		postedAt: new Date("2026-04-07T09:45:00"),
		relatedAnime: { id: "demon-slayer", title: "鬼滅の刃" },
		likes: 198,
		reposts: 45,
		liked: false,
		reposted: false,
	},
	{
		id: "5",
		user: {
			name: "ダンジョン探索者",
			icon: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Dungeon",
		},
		content:
			"ダンジョン飯1期おもしろかった！マルシルの暴走シーン最高だった 🍲 2期も決定してるしワクワクが止まらない",
		hashtags: ["ダンジョン飯", "ダンメシ"],
		postedAt: new Date("2026-04-07T08:20:00"),
		relatedAnime: { id: "delicious-in-dungeon", title: "ダンジョン飯" },
		likes: 312,
		reposts: 89,
		liked: true,
		reposted: true,
	},
	{
		id: "6",
		user: {
			name: "エヴァンゲリヲン信者",
			icon: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Eva",
		},
		content:
			"Frieren見てると死ぬのが怖くなるな…でもそれがいいんだよな。ヒンメルの「たった10年だ」のセリフで毎回泣く 😭",
		hashtags: ["フリーレン", "葬送のフリーレン"],
		postedAt: new Date("2026-04-07T07:00:00"),
		relatedAnime: { id: "frieren", title: "葬送のフリーレン" },
		likes: 421,
		reposts: 103,
		liked: false,
		reposted: false,
	},
];
