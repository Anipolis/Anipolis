type AnimeGenreTag = { readonly en: string; readonly ja: string };

export type AnimeGenreGroup = {
	readonly key: "genre" | "theme" | "demographic";
	readonly label: string;
	readonly tags: readonly AnimeGenreTag[];
};

// MAL(Jikan) の genres / themes / demographics と日本語表記の対応。
// 取り込みスクリプトが anime.genre に保存する語彙と、一覧の絞り込みに出す語彙をここで一致させる。
// MAL にタグが増えたらここに追加する(訳が無いと英語のまま保存され、絞り込みにも出ない)。
export const ANIME_GENRE_GROUPS: readonly AnimeGenreGroup[] = [
	{
		key: "genre",
		label: "ジャンル",
		tags: [
			{ en: "Action", ja: "アクション" },
			{ en: "Adventure", ja: "アドベンチャー" },
			{ en: "Comedy", ja: "コメディ" },
			{ en: "Drama", ja: "ドラマ" },
			{ en: "Fantasy", ja: "ファンタジー" },
			{ en: "Horror", ja: "ホラー" },
			{ en: "Mystery", ja: "ミステリー" },
			{ en: "Romance", ja: "ロマンス" },
			{ en: "Sci-Fi", ja: "SF" },
			{ en: "Sports", ja: "スポーツ" },
			{ en: "Slice of Life", ja: "日常" },
			{ en: "Supernatural", ja: "超常現象" },
			{ en: "Suspense", ja: "サスペンス" },
			{ en: "Gourmet", ja: "グルメ" },
			{ en: "Boys Love", ja: "ボーイズラブ" },
			{ en: "Girls Love", ja: "ガールズラブ" },
			{ en: "Avant Garde", ja: "前衛・実験的" },
			{ en: "Award Winning", ja: "受賞歴あり" },
			{ en: "Ecchi", ja: "エッチ" },
			{ en: "Erotica", ja: "性描写" },
			{ en: "Hentai", ja: "成人向け" },
		],
	},
	{
		key: "theme",
		label: "テーマ",
		// 五十音順
		tags: [
			{ en: "Villainess", ja: "悪役令嬢" },
			{ en: "Isekai", ja: "異世界" },
			{ en: "Iyashikei", ja: "癒し系" },
			{ en: "Medical", ja: "医療" },
			{ en: "Space", ja: "宇宙" },
			{ en: "Otaku Culture", ja: "オタク文化" },
			{ en: "Adult Cast", ja: "大人が主役" },
			{ en: "Music", ja: "音楽" },
			{ en: "School", ja: "学園" },
			{ en: "Combat Sports", ja: "格闘技" },
			{ en: "Anthropomorphic", ja: "擬人化" },
			{ en: "Gag Humor", ja: "ギャグ" },
			{ en: "Reverse Harem", ja: "逆ハーレム" },
			{ en: "Vampire", ja: "吸血鬼" },
			{ en: "Educational", ja: "教育" },
			{ en: "Showbiz", ja: "芸能界" },
			{ en: "Video Game", ja: "ゲーム" },
			{ en: "Urban Fantasy", ja: "現代ファンタジー" },
			{ en: "Gore", ja: "ゴア" },
			{ en: "Childcare", ja: "子育て" },
			{ en: "Survival", ja: "サバイバル" },
			{ en: "Workplace", ja: "職場" },
			{ en: "Idols (Female)", ja: "女性アイドル" },
			{ en: "Crossdressing", ja: "女装・男装" },
			{ en: "Psychological", ja: "心理描写" },
			{ en: "Mythology", ja: "神話" },
			{ en: "Strategy Game", ja: "頭脳ゲーム" },
			{ en: "Magical Sex Shift", ja: "性転換" },
			{ en: "Time Travel", ja: "タイムトラベル" },
			{ en: "Love Polygon", ja: "多角関係" },
			{ en: "Idols (Male)", ja: "男性アイドル" },
			{ en: "Detective", ja: "探偵" },
			{ en: "Team Sports", ja: "チームスポーツ" },
			{ en: "Super Power", ja: "超能力" },
			{ en: "High Stakes Game", ja: "デスゲーム" },
			{ en: "Reincarnation", ja: "転生" },
			{ en: "Harem", ja: "ハーレム" },
			{ en: "Parody", ja: "パロディ" },
			{ en: "Organized Crime", ja: "犯罪組織" },
			{ en: "Visual Arts", ja: "美術" },
			{ en: "CGDCT", ja: "美少女日常" },
			{ en: "Samurai", ja: "武士" },
			{ en: "Martial Arts", ja: "武術" },
			{ en: "Performing Arts", ja: "舞台芸術" },
			{ en: "Delinquents", ja: "不良" },
			{ en: "Pets", ja: "ペット" },
			{ en: "Mahou Shoujo", ja: "魔法少女" },
			{ en: "Military", ja: "ミリタリー" },
			{ en: "Mecha", ja: "メカ" },
			{ en: "Love Status Quo", ja: "もどかしい恋" },
			{ en: "Racing", ja: "レース" },
			{ en: "Historical", ja: "歴史" },
		],
	},
	{
		key: "demographic",
		label: "対象層",
		tags: [
			{ en: "Shounen", ja: "少年向け" },
			{ en: "Shoujo", ja: "少女向け" },
			{ en: "Seinen", ja: "青年向け" },
			{ en: "Josei", ja: "女性向け" },
			{ en: "Kids", ja: "子ども向け" },
		],
	},
];

export const ANIME_GENRES: readonly string[] = ANIME_GENRE_GROUPS.flatMap((group) => group.tags.map((tag) => tag.ja));

export const GENRE_JA_BY_EN: Record<string, string> = Object.fromEntries(
	ANIME_GENRE_GROUPS.flatMap((group) => group.tags.map((tag) => [tag.en, tag.ja])),
);

// ⓘ などで絞り込みの仕様を説明するときの文言。画面ごとに書き分けず、ここを参照する
export const ANIME_GENRE_FILTER_HELP =
	"同じ種類のタグはいずれかに当てはまる作品、種類をまたぐとすべてに当てはまる作品を表示します";

const GENRE_GROUP_KEY_BY_NAME = new Map(
	ANIME_GENRE_GROUPS.flatMap((group) =>
		group.tags.flatMap((tag) => [
			[tag.ja, group.key],
			[tag.en.toLowerCase(), group.key],
		]),
	),
);

// 絞り込み用に、選ばれたタグを種類ごとにまとめる。同じ種類の中は OR、種類をまたぐと AND で使う。
// 語彙にないタグ(URL で直接指定されたものなど)は、それぞれ独立した種類として扱う。
export function groupGenreFilters(genres: readonly string[]): string[][] {
	const groups = new Map<string, string[]>();
	for (const genre of genres) {
		const key =
			GENRE_GROUP_KEY_BY_NAME.get(genre) ?? GENRE_GROUP_KEY_BY_NAME.get(genre.toLowerCase()) ?? `other:${genre}`;
		groups.set(key, [...(groups.get(key) ?? []), genre]);
	}
	return [...groups.values()];
}

// 表記を見直す前の日本語タグ → 現在の表記。取り込み元に残る旧表記の解決時や、旧表記の URL で使う
export const LEGACY_GENRE_JA: Record<string, string> = {
	百合: "ガールズラブ",
	オカルト: "超常現象",
	アバンギャルド: "前衛・実験的",
	エロティカ: "性描写",
	大人キャスト: "大人が主役",
	ショービズ: "芸能界",
	心理: "心理描写",
	頭脳戦: "頭脳ゲーム",
	恋愛群像: "多角関係",
	ビジュアルアーツ: "美術",
	日常系: "美少女日常",
	侍: "武士",
	芸能: "舞台芸術",
};

const GENRE_JA_BY_LOWER_EN = new Map(Object.entries(GENRE_JA_BY_EN).map(([en, ja]) => [en.toLowerCase(), ja]));
// URL など外部から来た名前で引くので、constructor などの継承プロパティに当たらないよう Map で持つ
const LEGACY_GENRE_JA_BY_NAME = new Map(Object.entries(LEGACY_GENRE_JA));

// MAL と Jikan で表記揺れがあるため大文字小文字を区別しない。旧表記は現在の表記に直し、訳の無い名前はそのまま残す。
export function translateAnimeGenres(names: readonly string[]): string[] {
	return [
		...new Set(
			names.map(
				(name) =>
					GENRE_JA_BY_LOWER_EN.get(name.trim().toLowerCase()) ??
					LEGACY_GENRE_JA_BY_NAME.get(name.trim()) ??
					name,
			),
		),
	];
}

export const ANIME_SOURCE_OPTIONS = [
	"漫画",
	"ライトノベル",
	"小説",
	"ビジュアルノベル",
	"ゲーム",
	"オリジナル",
	"4コマ漫画",
	"Web漫画",
	"メディアミックス",
	"カードゲーム",
	"書籍",
	"絵本",
	"音楽",
	"ラジオ",
	"その他",
] as const;

export const JIKAN_SOURCE_JA_BY_EN: Record<string, (typeof ANIME_SOURCE_OPTIONS)[number]> = {
	"4-koma manga": "4コマ漫画",
	book: "書籍",
	"card game": "カードゲーム",
	game: "ゲーム",
	"light novel": "ライトノベル",
	manga: "漫画",
	"mixed media": "メディアミックス",
	music: "音楽",
	novel: "小説",
	original: "オリジナル",
	other: "その他",
	"picture book": "絵本",
	radio: "ラジオ",
	"visual novel": "ビジュアルノベル",
	"web manga": "Web漫画",
};

export function translateAnimeSource(source: string | null | undefined): string | null {
	const normalized = source?.trim();
	if (!normalized) return null;
	return JIKAN_SOURCE_JA_BY_EN[normalized.toLowerCase()] ?? normalized;
}
