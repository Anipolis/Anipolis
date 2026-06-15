import { createClient } from "@supabase/supabase-js";

type SeasonName = "winter" | "spring" | "summer" | "fall";

type ExternalLink = {
	name?: string | null;
	type?: string | null;
	title?: string | null;
	url?: string | null;
};

type AnimeResourceLink = {
	name: string;
	url: string;
};

type NamedResource = {
	name?: string | null;
};

type JikanRelationEntry = {
	mal_id?: number | null;
	type?: string | null;
	name?: string | null;
};

type JikanRelation = {
	relation?: string | null;
	entry?: JikanRelationEntry[];
};

type JikanAnime = {
	mal_id: number;
	url?: string | null;
	titles?: {
		type?: string | null;
		title?: string | null;
	}[];
	title?: string | null;
	title_english?: string | null;
	title_japanese?: string | null;
	title_synonyms?: string[];
	episodes?: number | null;
	type?: string | null;
	status?: string | null;
	source?: string | null;
	season?: SeasonName | null;
	year?: number | null;
	aired?: {
		from?: string | null;
		to?: string | null;
	};
	images?: {
		jpg?: {
			image_url?: string | null;
			large_image_url?: string | null;
		};
		webp?: {
			image_url?: string | null;
			large_image_url?: string | null;
		};
	};
	studios?: NamedResource[];
	genres?: NamedResource[];
	resources?: ExternalLink[];
	broadcast?: {
		day?: string | null;
		time?: string | null;
		timezone?: string | null;
		string?: string | null;
	};
	external?: ExternalLink[];
	relations?: JikanRelation[];
};

type JikanSeasonResponse = {
	data?: JikanAnime[];
	pagination?: {
		has_next_page?: boolean;
		current_page?: number;
		last_visible_page?: number;
		items?: {
			count?: number;
			total?: number;
			per_page?: number;
		};
	};
};

type JikanAnimeFullResponse = {
	data?: JikanAnime;
};

type AnimeImportRow = {
	mal_id: number;
	title: string;
	title_en: string | null;
	title_romaji: string | null;
	episode_count: string | null;
	type: string | null;
	status: "airing" | "finished" | "upcoming";
	aired_from: string | null;
	aired_to: string | null;
	season: string;
	source: string | null;
	studio: string[];
	studio_en: string[];
	genre: string[];
	genre_en: string[];
	broadcast_day: number | null;
	broadcast_time: string | null;
	official_site_url: string | null;
	official_x_url: string | null;
	resources: AnimeResourceLink[];
	cover_url: string | null;
};

type AnimeRelationImportRow = {
	anime_mal_id: number;
	related_anime_mal_id: number;
	relation_type: string;
	related_title: string;
};

type ImportDatabase = {
	public: {
		Tables: {
			anime: {
				Insert: AnimeImportRow;
				Update: Partial<AnimeImportRow>;
				Row: AnimeImportRow & {
					id: number;
					created_at: string;
				};
			};
			anime_relations: {
				Insert: AnimeRelationImportRow;
				Update: Partial<AnimeRelationImportRow>;
				Row: AnimeRelationImportRow & {
					created_at: string;
				};
			};
		};
	};
};

type ExistingAnimeValues = Pick<
	AnimeImportRow,
	"mal_id" | "official_site_url" | "official_x_url" | "resources" | "cover_url"
>;

const BASE_URL = "https://api.jikan.moe/v4";
const VALID_SEASONS = new Set<SeasonName>(["winter", "spring", "summer", "fall"]);
const REQUEST_WAIT_MIN_MS = 500;
const REQUEST_WAIT_MAX_MS = 1_000;
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 5;
const UPSERT_BATCH_SIZE = 100;
const BLOCKED_RESOURCE_KEYWORDS = ["namuwiki", "bangumi"];
const BLOCKED_TYPES = new Set(["music", "pv", "cm"]);
const FINITE_RELEASE_TYPES = new Set(["movie", "ona", "ova", "tvspecial", "special"]);
const LATE_NIGHT_EXTENSION_END_HOUR = 4;

const GENRE_JA_BY_EN: Record<string, string> = {
	Action: "アクション",
	Adventure: "アドベンチャー",
	"Avant Garde": "アバンギャルド",
	"Award Winning": "受賞歴あり",
	"Boys Love": "ボーイズラブ",
	Comedy: "コメディ",
	Drama: "ドラマ",
	Ecchi: "エッチ",
	Erotica: "エロティカ",
	Fantasy: "ファンタジー",
	"Girls Love": "ガールズラブ",
	Gourmet: "グルメ",
	Hentai: "成人向け",
	Horror: "ホラー",
	Mystery: "ミステリー",
	Romance: "ロマンス",
	"Sci-Fi": "SF",
	"Slice of Life": "日常",
	Sports: "スポーツ",
	Supernatural: "超自然",
	Suspense: "サスペンス",
	"Adult Cast": "大人キャスト",
	Anthropomorphic: "擬人化",
	CGDCT: "日常系",
	Childcare: "子育て",
	"Combat Sports": "格闘技",
	Crossdressing: "女装・男装",
	Delinquents: "不良",
	Detective: "探偵",
	Educational: "教育",
	"Gag Humor": "ギャグ",
	Gore: "ゴア",
	Harem: "ハーレム",
	"High Stakes Game": "デスゲーム",
	Historical: "歴史",
	"Idols (Female)": "女性アイドル",
	"Idols (Male)": "男性アイドル",
	Isekai: "異世界",
	Iyashikei: "癒し系",
	"Love Polygon": "恋愛群像",
	"Magical Sex Shift": "性転換",
	"Mahou Shoujo": "魔法少女",
	"Martial Arts": "武術",
	Mecha: "メカ",
	Medical: "医療",
	Military: "ミリタリー",
	Music: "音楽",
	Mythology: "神話",
	"Organized Crime": "犯罪組織",
	"Otaku Culture": "オタク文化",
	Parody: "パロディ",
	"Performing Arts": "芸能",
	Pets: "ペット",
	Psychological: "心理",
	Racing: "レース",
	Reincarnation: "転生",
	"Reverse Harem": "逆ハーレム",
	"Romantic Subtext": "恋愛要素",
	Samurai: "侍",
	School: "学園",
	Showbiz: "ショービズ",
	Space: "宇宙",
	"Strategy Game": "頭脳戦",
	"Super Power": "超能力",
	Survival: "サバイバル",
	"Team Sports": "チームスポーツ",
	"Time Travel": "タイムトラベル",
	Vampire: "吸血鬼",
	"Video Game": "ゲーム",
	Villainess: "悪役令嬢",
	"Visual Arts": "ビジュアルアーツ",
	Workplace: "職場",
	Josei: "女性向け",
	Kids: "子ども向け",
	Seinen: "青年向け",
	Shoujo: "少女向け",
	Shounen: "少年向け",
};

const STUDIO_JA_BY_EN: Record<string, string> = {
	"8bit": "エイトビット",
	AIC: "AIC",
	"Ajia-do": "亜細亜堂",
	Artland: "アートランド",
	"Bandai Namco Pictures": "BN Pictures",
	Bones: "ボンズ",
	"Brain's Base": "ブレインズ・ベース",
	CloverWorks: "CloverWorks",
	"CoMix Wave Films": "コミックス・ウェーブ・フィルム",
	"Doga Kobo": "動画工房",
	"David Production": "david production",
	Diomedéa: "ディオメディア",
	ENGI: "ENGI",
	Fanworks: "ファンワークス",
	"Felix Film": "FelixFilm",
	Gaina: "BENTEN Film",
	Gonzo: "GONZO",
	Graphinica: "グラフィニカ",
	"J.C.Staff": "J.C.STAFF",
	"Kyoto Animation": "京都アニメーション",
	LIDENFILMS: "ライデンフィルム",
	Lerche: "Lerche",
	"M.S.C": "エム・エス・シー",
	MAPPA: "MAPPA",
	Madhouse: "マッドハウス",
	OLM: "OLM",
	Orange: "オレンジ",
	"P.A. Works": "P.A.WORKS",
	Passione: "パッショーネ",
	Pierrot: "スタジオぴえろ",
	"Production I.G": "Production I.G",
	SANZIGEN: "サンジゲン",
	"SILVER LINK.": "SILVER LINK.",
	Satelight: "サテライト",
	Shaft: "シャフト",
	"Shin-Ei Animation": "シンエイ動画",
	"Studio 3Hz": "Studio 3Hz",
	"Studio Bind": "スタジオバインド",
	"Studio Blanc.": "スタジオブラン",
	"Studio Colorido": "スタジオコロリド",
	"Studio Deen": "スタジオディーン",
	"Studio Ghibli": "スタジオジブリ",
	"Studio Gokumi": "Studio五組",
	"Studio Hibari": "スタジオ雲雀",
	"Studio Kai": "スタジオKAI",
	"Studio Nue": "スタジオぬえ",
	"Studio Palette": "スタジオぱれっと",
	"Studio Pierrot": "ぴえろ",
	"Studio VOLN": "studio VOLN",
	Sublimation: "サブリメイション",
	Sunrise: "サンライズ",
	SynergySP: "SynergySP",
	"TMS Entertainment": "トムス・エンタテインメント",
	"Tatsunoko Production": "タツノコプロ",
	"Telecom Animation Film": "テレコム・アニメーションフィルム",
	"Toei Animation": "東映アニメーション",
	Trigger: "TRIGGER",
	Troyca: "TROYCA",
	"Typhoon Graphics": "颱風グラフィックス",
	Ufotable: "ufotable",
	"Wit Studio": "WIT STUDIO",
	"White Fox": "WHITE FOX",
	"Yokohama Animation Lab": "横浜アニメーションラボ",
	"Zero-G": "ゼロジー",
	"feel.": "feel.",
	ixtl: "ixtl",
	"Lay-duce": "Lay-duce",
	Nexus: "Nexus",
	Nomad: "ノーマッド",
	NUT: "NUT",
	"Polygon Pictures": "ポリゴン・ピクチュアズ",
	"Lapin Track": "ラパントラック",
	Shuka: "朱夏",
	"animation studio42": "animation studio42",
	"Hayabusa Film": "ハヤブサフィルム",
	Gekkou: "月虹",
	"Studio Chromato": "スタジオクロマト",
	"Bones Film": "ボンズ",
	"East Fish Studio": "イーストフィッシュスタジオ",
	"Atelier Peuplier": "アトリエププリエ",
	CompTown: "CompTown",
	"Platinum Vision": "プラチナビジョン",
	"Ashi Productions": "葦プロダクション",
	Millepensee: "ミルパンセ",
	"Tezuka Productions": "手塚プロダクション",
	"Bellnox Films": "ベルノックスフィルムズ",
	"EMT Squared": "EMTスクエアード",
	"Ga-Crew": "画狂",
	HORNETS: "HORNETS",
	"Okuruto Noboru": "オクルトノボル",
	"Signal.MD": "シグナル・エムディ",
	"studio MOTHER": "studio MOTHER",
	"asread.": "アスリード",
	"PINE JAM": "パインジャム",
	"Nyan Pollution": "Nyan Pollution-ω-",
	"Maho Film": "MAHO FILM",
	"Studio Outrigger": "スタジオアウトリガー",
	"Imagica Infos": "Imagica Infos",
	"Imageworks Studio": "Imageworks Studio",
	Khara: "スタジオカラー",
	"Arvo Animation": "アルボアニメーション",
	Seven: "アニメーションスタジオ・セブン",
	"Psyde Kick Studio": "サイドキックスタジオ",
	"Studio Hokiboshi": "studio HōKIBOSHI",
	"Studio Dotou": "STUDIO DOTOU",
	Doraku: "動楽",
	"Nothing New": "NOTHING NEW",
	"Blue bread": "Blue bread",
	"Studio Gohan": "スタジオごはん",
	"Kinema Citrus": "キネマシトラス",
	"Gift-o’-Animation": "ぎふとアニメーション",
	"Studio Jemi": "STUDIO JEMI",
	Actas: "アクタス",
	Shirogumi: "白組",
	Shion: "Shion",
	Majin: "Majin",
	Nur: "Nur",
	"Miyu Productions": "MIYUプロダクション",
	"ame pippin": "ame pippin",
	"Shogakukan Music & Digital Entertainment": "SMDE",
	"Dongwoo A&E": "同友A&E",
	"Uguisu Kobo": "うぐいす工房",
	"Toon Harbor Works": "トゥーンハーバーワークス",
	"ETERNA Animation": "ETERNA Animation",
	"Studio G-1Neo": "Studio G-1NEO",
	Contrail: "コントレール",
	Lesprit: "レスプリ",
	"Nippon Animation": "日本アニメーション",
};

function parseArgs(argv: string[]) {
	const options: { year?: number; season?: SeasonName; dryRun: boolean; enrichLinks: boolean } = {
		dryRun: false,
		enrichLinks: true,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];

		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}

		if (arg === "--skip-link-enrichment") {
			options.enrichLinks = false;
			continue;
		}

		if (arg === "--year" && next) {
			options.year = Number.parseInt(next, 10);
			index += 1;
			continue;
		}

		if (arg === "--season" && next) {
			if (!isSeasonName(next)) throw new Error(`Invalid season: ${next}`);
			options.season = next;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!Number.isInteger(options.year) || !options.year || options.year < 1900) {
		throw new Error("Usage: pnpm import:jikan -- --year 2026 --season winter [--dry-run] [--skip-link-enrichment]");
	}

	if (!options.season) {
		throw new Error("Usage: pnpm import:jikan -- --year 2026 --season winter [--dry-run] [--skip-link-enrichment]");
	}

	return { year: options.year, season: options.season, dryRun: options.dryRun, enrichLinks: options.enrichLinks };
}

function isSeasonName(value: string): value is SeasonName {
	return VALID_SEASONS.has(value as SeasonName);
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function retryDelayMs(response: Response | null, attempt: number) {
	const retryAfter = response?.headers.get("retry-after");
	const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;

	if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
		return retryAfterSeconds * 1_000 + randomInt(250, 750);
	}

	return Math.min(30_000, 2_000 * 2 ** attempt) + randomInt(250, 1_000);
}

async function fetchJsonWithRetry(url: string): Promise<JikanSeasonResponse | null> {
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
		let response: Response | null = null;

		try {
			response = await fetch(url, {
				headers: {
					Accept: "application/json",
					"User-Agent": "Anipolis seasonal anime importer",
				},
			});

			if (response.ok) return (await response.json()) as JikanSeasonResponse;

			const body = await response.text();
			const shouldRetry = RETRY_STATUS_CODES.has(response.status);
			console.warn(`Request failed: ${response.status} ${response.statusText} ${body.slice(0, 200)}`);

			if (!shouldRetry || attempt === MAX_RETRIES) return null;

			const delayMs = retryDelayMs(response, attempt);
			console.warn(`Retrying in ${Math.round(delayMs / 1_000)}s... (${attempt + 1}/${MAX_RETRIES})`);
			await sleep(delayMs);
		} catch (error) {
			console.warn(`Request error: ${error instanceof Error ? error.message : String(error)}`);
			if (attempt === MAX_RETRIES) return null;

			const delayMs = retryDelayMs(response, attempt);
			console.warn(`Retrying in ${Math.round(delayMs / 1_000)}s... (${attempt + 1}/${MAX_RETRIES})`);
			await sleep(delayMs);
		} finally {
			const waitMs = randomInt(REQUEST_WAIT_MIN_MS, REQUEST_WAIT_MAX_MS);
			await sleep(waitMs);
		}
	}

	return null;
}

async function fetchAnimeFull(malId: number) {
	const payload = await fetchJsonWithRetry(`${BASE_URL}/anime/${malId}/full`);
	return (payload as JikanAnimeFullResponse | null)?.data ?? null;
}

async function fetchSeasonAnime(year: number, season: SeasonName) {
	const animes: JikanAnime[] = [];
	let page = 1;
	let hasNextPage = true;

	while (hasNextPage) {
		const url = new URL(`${BASE_URL}/seasons/${year}/${season}`);
		url.searchParams.set("page", String(page));

		console.log(`Fetching page ${page}: ${url.toString()}`);
		const payload = await fetchJsonWithRetry(url.toString());

		if (!payload) {
			console.warn(`Page ${page} skipped after retries.`);
			break;
		}

		const pageItems = payload.data ?? [];
		animes.push(...pageItems);

		console.log(`Page ${page} fetched... ${pageItems.length} items found (${animes.length} total)`);

		hasNextPage = payload.pagination?.has_next_page === true;
		page += 1;
	}

	return animes;
}

async function enrichAnimeLinks(animes: JikanAnime[]) {
	const enriched: JikanAnime[] = [];

	for (const [index, anime] of animes.entries()) {
		console.log(`Fetching external links ${index + 1}/${animes.length}: MAL ${anime.mal_id}`);
		const fullAnime = await fetchAnimeFull(anime.mal_id);

		if (!fullAnime) {
			console.warn(`External links skipped: MAL ${anime.mal_id}`);
			enriched.push(anime);
			continue;
		}

		enriched.push({
			...anime,
			external: fullAnime.external ?? anime.external,
			resources: fullAnime.resources ?? anime.resources,
			relations: fullAnime.relations ?? [],
		});
	}

	return enriched;
}

function hasBlockedResource(anime: JikanAnime) {
	const links = [...(anime.resources ?? []), ...(anime.external ?? [])];

	return links.some((link) => {
		const searchableText =
			`${link.name ?? ""} ${link.type ?? ""} ${link.title ?? ""} ${link.url ?? ""}`.toLowerCase();
		return BLOCKED_RESOURCE_KEYWORDS.some((keyword) => searchableText.includes(keyword));
	});
}

function filterBlockedResourceAnime(animes: JikanAnime[]) {
	const allowed: JikanAnime[] = [];
	const blocked: JikanAnime[] = [];

	for (const anime of animes) {
		if (hasBlockedResource(anime)) {
			blocked.push(anime);
			continue;
		}

		allowed.push(anime);
	}

	if (blocked.length > 0) {
		console.warn(
			`Filtered ${blocked.length} anime with blocked resources: ${blocked
				.map((anime) => `${anime.mal_id}:${anime.title ?? anime.title_japanese ?? "Untitled"}`)
				.join(", ")}`,
		);
	}

	return allowed;
}

function filterBlockedTypeAnime(animes: JikanAnime[]) {
	const allowed: JikanAnime[] = [];
	const blocked: JikanAnime[] = [];

	for (const anime of animes) {
		if (anime.type && BLOCKED_TYPES.has(anime.type.toLowerCase())) {
			blocked.push(anime);
			continue;
		}

		allowed.push(anime);
	}

	if (blocked.length > 0) {
		console.warn(
			`Filtered ${blocked.length} anime with blocked types: ${blocked
				.map(
					(anime) =>
						`${anime.mal_id}:${anime.type ?? "Unknown"}:${anime.title ?? anime.title_japanese ?? "Untitled"}`,
				)
				.join(", ")}`,
		);
	}

	return allowed;
}

function toDateOnly(value: string | null | undefined) {
	if (!value) return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	return date.toISOString().slice(0, 10);
}

function normalizeNameList(items: NamedResource[] | null | undefined) {
	return [...new Set((items ?? []).map((item) => item.name?.trim()).filter((name): name is string => Boolean(name)))];
}

function translateNameList(names: string[], dictionary: Record<string, string>) {
	return names.map((name) => dictionary[name] ?? name);
}

const SOURCE_JA_BY_EN: Record<string, string> = {
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

function translateSource(source: string | null | undefined) {
	const normalized = source?.trim();
	if (!normalized) return null;
	return SOURCE_JA_BY_EN[normalized.toLowerCase()] ?? normalized;
}

function normalizeBroadcastDay(day: string | null | undefined) {
	if (!day) return null;

	const key = day.toLowerCase();
	const days: Record<string, number> = {
		sundays: 0,
		sunday: 0,
		mondays: 1,
		monday: 1,
		tuesdays: 2,
		tuesday: 2,
		wednesdays: 3,
		wednesday: 3,
		thursdays: 4,
		thursday: 4,
		fridays: 5,
		friday: 5,
		saturdays: 6,
		saturday: 6,
	};

	return days[key] ?? null;
}

function normalizeBroadcastTime(time: string | null | undefined) {
	if (!time) return null;

	const match = time.trim().match(/^([0-9]{1,2}):([0-5][0-9])$/);
	if (!match) return null;

	const hour = Number.parseInt(match[1] ?? "", 10);
	if (hour < 0 || hour > 47) return null;

	return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function normalizeBroadcastSchedule(broadcast: JikanAnime["broadcast"]) {
	const broadcastDay = normalizeBroadcastDay(broadcast?.day);
	const broadcastTime = normalizeBroadcastTime(broadcast?.time);

	if (broadcastDay === null || broadcastTime === null) {
		return { broadcast_day: broadcastDay, broadcast_time: broadcastTime };
	}

	const hour = Number.parseInt(broadcastTime.slice(0, 2), 10);
	if (hour >= LATE_NIGHT_EXTENSION_END_HOUR) {
		return { broadcast_day: broadcastDay, broadcast_time: broadcastTime };
	}

	return {
		broadcast_day: (broadcastDay + 6) % 7,
		broadcast_time: `${String(hour + 24).padStart(2, "0")}${broadcastTime.slice(2)}`,
	};
}

function normalizeAnimeType(type: string | null | undefined) {
	return type?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function isFiniteReleaseType(type: string | null | undefined) {
	return FINITE_RELEASE_TYPES.has(normalizeAnimeType(type));
}

function getJstDateOnly() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function normalizeStatus(
	status: string | null | undefined,
	type: string | null | undefined,
	airedFrom: string | null,
	airedTo: string | null,
): AnimeImportRow["status"] {
	const lowered = status?.toLowerCase() ?? "";

	if (airedFrom && airedFrom > getJstDateOnly()) return "upcoming";
	if (lowered.includes("not yet")) return "upcoming";
	if (lowered.includes("finished")) return "finished";

	if (isFiniteReleaseType(type) && airedFrom && !airedTo) {
		return airedFrom > getJstDateOnly() ? "upcoming" : "finished";
	}

	return "airing";
}

function findOfficialSiteUrl(external: ExternalLink[] | null | undefined) {
	return (
		(external ?? []).find((link) => {
			const label = `${link.type ?? ""} ${link.name ?? ""} ${link.title ?? ""}`.toLowerCase();
			return label.includes("official site") && Boolean(link.url);
		})?.url ?? null
	);
}

function findOfficialXUrl(external: ExternalLink[] | null | undefined) {
	return (
		(external ?? []).find((link) => {
			if (!link.url) return false;

			try {
				const hostname = new URL(link.url).hostname.toLowerCase();
				return (
					hostname === "x.com" ||
					hostname.endsWith(".x.com") ||
					hostname === "twitter.com" ||
					hostname.endsWith(".twitter.com")
				);
			} catch {
				return false;
			}
		})?.url ?? null
	);
}

function isHttpUrl(value: string | null | undefined) {
	if (!value) return false;

	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

function normalizeResourceLink(link: ExternalLink): AnimeResourceLink | null {
	const url = link.url?.trim();
	if (!isHttpUrl(url)) return null;
	if (isMalUrl(url)) return null;

	const name = (link.name ?? link.title ?? link.type ?? "").trim();
	if (!name) return null;
	if (name.toLowerCase() === "mal" || name.toLowerCase().includes("myanimelist")) return null;

	return { name, url: url as string };
}

function isMalUrl(value: string) {
	try {
		const hostname = new URL(value).hostname.toLowerCase();
		return hostname === "myanimelist.net" || hostname.endsWith(".myanimelist.net");
	} catch {
		return false;
	}
}

function dedupeResourceLinks(resources: AnimeResourceLink[]) {
	const seen = new Set<string>();
	const deduped: AnimeResourceLink[] = [];

	for (const resource of resources) {
		const key = resource.url.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(resource);
	}

	return deduped;
}

function removeMalResourceLinks(resources: AnimeResourceLink[]) {
	return resources.filter((resource) => resource.name.toLowerCase() !== "mal" && !isMalUrl(resource.url));
}

function buildAnimeResources(anime: JikanAnime) {
	const resources: AnimeResourceLink[] = [];

	for (const link of anime.resources ?? []) {
		const normalized = normalizeResourceLink(link);
		if (normalized) resources.push(normalized);
	}

	return dedupeResourceLinks(resources);
}

function findTitleByType(anime: JikanAnime, type: string) {
	return anime.titles?.find((title) => title.type?.toLowerCase() === type.toLowerCase())?.title?.trim() || null;
}

function mapJikanAnime(anime: JikanAnime, year: number, season: SeasonName): AnimeImportRow {
	const titleJapanese = anime.title_japanese?.trim() || findTitleByType(anime, "Japanese");
	const titleEnglish = anime.title_english?.trim() || findTitleByType(anime, "English");
	const titleRomaji = anime.title?.trim() || findTitleByType(anime, "Default");
	const airedFrom = toDateOnly(anime.aired?.from);
	const airedTo = toDateOnly(anime.aired?.to);
	const studioEn = normalizeNameList(anime.studios);
	const studioJa = translateNameList(studioEn, STUDIO_JA_BY_EN);
	const genreEn = normalizeNameList(anime.genres);
	const genreJa = translateNameList(genreEn, GENRE_JA_BY_EN);
	const officialSiteUrl = findOfficialSiteUrl(anime.external);
	const broadcastSchedule = normalizeBroadcastSchedule(anime.broadcast);

	return {
		mal_id: anime.mal_id,
		title: titleJapanese || titleRomaji || titleEnglish || `MAL ${anime.mal_id}`,
		title_en: titleEnglish,
		title_romaji: titleRomaji,
		episode_count: anime.episodes ? String(anime.episodes) : null,
		type: anime.type ?? null,
		status: normalizeStatus(anime.status, anime.type, airedFrom, airedTo),
		aired_from: airedFrom,
		aired_to: airedTo,
		season: `${year}-${season}`,
		source: translateSource(anime.source),
		studio: studioJa,
		studio_en: studioEn,
		genre: genreJa,
		genre_en: genreEn,
		broadcast_day: broadcastSchedule.broadcast_day,
		broadcast_time: broadcastSchedule.broadcast_time,
		official_site_url: officialSiteUrl,
		official_x_url: findOfficialXUrl(anime.external),
		resources: buildAnimeResources(anime),
		cover_url: null,
	};
}

function mapAnimeRelations(anime: JikanAnime): AnimeRelationImportRow[] {
	return (anime.relations ?? []).flatMap((relation) => {
		const relationType = relation.relation?.trim();
		if (!relationType) return [];

		return (relation.entry ?? [])
			.filter(
				(entry): entry is JikanRelationEntry & { mal_id: number; name: string } =>
					entry.type === "anime" &&
					typeof entry.mal_id === "number" &&
					entry.mal_id !== anime.mal_id &&
					typeof entry.name === "string" &&
					entry.name.trim().length > 0,
			)
			.map((entry) => ({
				anime_mal_id: anime.mal_id,
				related_anime_mal_id: entry.mal_id,
				relation_type: relationType,
				related_title: entry.name.trim(),
			}));
	});
}

function mergeUniqueStrings(left: string[], right: string[]) {
	return [...new Set([...left, ...right])];
}

function preferPresent<T>(next: T | null, previous: T | null) {
	return next ?? previous;
}

function preferNonEmptyArray<T>(next: T[], previous: T[]) {
	return next.length > 0 ? next : previous;
}

function mergeAnimeRows(previous: AnimeImportRow, next: AnimeImportRow): AnimeImportRow {
	return {
		...previous,
		...next,
		title: next.title || previous.title,
		studio: mergeUniqueStrings(previous.studio, next.studio),
		studio_en: mergeUniqueStrings(previous.studio_en, next.studio_en),
		genre: mergeUniqueStrings(previous.genre, next.genre),
		genre_en: mergeUniqueStrings(previous.genre_en, next.genre_en),
		title_en: preferPresent(next.title_en, previous.title_en),
		title_romaji: preferPresent(next.title_romaji, previous.title_romaji),
		episode_count: preferPresent(next.episode_count, previous.episode_count),
		type: preferPresent(next.type, previous.type),
		aired_from: preferPresent(next.aired_from, previous.aired_from),
		aired_to: preferPresent(next.aired_to, previous.aired_to),
		source: preferPresent(next.source, previous.source),
		broadcast_day: preferPresent(next.broadcast_day, previous.broadcast_day),
		broadcast_time: preferPresent(next.broadcast_time, previous.broadcast_time),
		official_site_url: preferPresent(next.official_site_url, previous.official_site_url),
		official_x_url: preferPresent(next.official_x_url, previous.official_x_url),
		resources: preferNonEmptyArray(next.resources, previous.resources),
		cover_url: preferPresent(next.cover_url, previous.cover_url),
	};
}

function dedupeAnimeRows(rows: AnimeImportRow[]) {
	const rowsByMalId = new Map<number, AnimeImportRow>();
	let duplicateCount = 0;

	for (const row of rows) {
		const previous = rowsByMalId.get(row.mal_id);

		if (!previous) {
			rowsByMalId.set(row.mal_id, row);
			continue;
		}

		duplicateCount += 1;
		rowsByMalId.set(row.mal_id, mergeAnimeRows(previous, row));
	}

	if (duplicateCount > 0) {
		console.warn(`Deduplicated ${duplicateCount} duplicate MAL IDs before Supabase upsert.`);
	}

	return [...rowsByMalId.values()];
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before running the importer.",
		);
	}

	return createClient<ImportDatabase>(supabaseUrl, serviceRoleKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});
}

async function preserveExistingValuesOnPartialFailures(
	supabase: ReturnType<typeof getSupabaseClient>,
	batch: AnimeImportRow[],
) {
	const malIdsNeedingExistingValues = batch
		.filter(
			(row) =>
				row.official_site_url === null ||
				row.official_x_url === null ||
				row.resources.length === 0 ||
				row.cover_url === null,
		)
		.map((row) => row.mal_id);

	if (malIdsNeedingExistingValues.length === 0) return batch;

	const { data, error } = await supabase
		.from("anime")
		.select("mal_id, official_site_url, official_x_url, resources, cover_url")
		.in("mal_id", malIdsNeedingExistingValues);

	if (error) {
		console.warn(`Could not read existing anime values before upsert: ${error.message}`);
		return batch;
	}

	const existingValuesByMalId = new Map(
		((data ?? []) as ExistingAnimeValues[]).map((row) => [
			row.mal_id,
			{
				official_site_url: row.official_site_url,
				official_x_url: row.official_x_url,
				resources: removeMalResourceLinks(row.resources ?? []),
				cover_url: row.cover_url,
			},
		]),
	);

	return batch.map((row) => {
		const existingValues = existingValuesByMalId.get(row.mal_id);

		if (!existingValues) return row;

		return {
			...row,
			official_site_url: row.official_site_url ?? existingValues.official_site_url,
			official_x_url: row.official_x_url ?? existingValues.official_x_url,
			resources: row.resources.length > 0 ? row.resources : existingValues.resources,
			cover_url: row.cover_url ?? existingValues.cover_url,
		};
	});
}

async function upsertAnimeRows(rows: AnimeImportRow[]) {
	const supabase = getSupabaseClient();
	const savedMalIds = new Set<number>();
	let saved = 0;

	for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
		const batch = await preserveExistingValuesOnPartialFailures(
			supabase,
			rows.slice(start, start + UPSERT_BATCH_SIZE),
		);
		const { error } = await supabase.from("anime").upsert(batch, { onConflict: "mal_id" });

		if (error) {
			console.error(`Supabase upsert failed for batch ${start / UPSERT_BATCH_SIZE + 1}: ${error.message}`);
			continue;
		}

		for (const row of batch) savedMalIds.add(row.mal_id);
		saved += batch.length;
		console.log(`Supabase upserted ${saved}/${rows.length} rows`);
	}

	return savedMalIds;
}

async function syncAnimeRelations(animes: JikanAnime[], savedMalIds: Set<number>) {
	const supabase = getSupabaseClient();
	let synced = 0;

	for (const anime of animes) {
		if (!savedMalIds.has(anime.mal_id) || anime.relations === undefined) continue;

		const { error: deleteError } = await supabase.from("anime_relations").delete().eq("anime_mal_id", anime.mal_id);
		if (deleteError) {
			console.error(`Could not replace anime relations for MAL ${anime.mal_id}: ${deleteError.message}`);
			continue;
		}

		const relationRows = mapAnimeRelations(anime);
		if (relationRows.length > 0) {
			const { error: insertError } = await supabase.from("anime_relations").insert(relationRows);
			if (insertError) {
				console.error(`Could not save anime relations for MAL ${anime.mal_id}: ${insertError.message}`);
				continue;
			}
		}

		synced += relationRows.length;
	}

	console.log(`Synced ${synced} anime relations.`);
}

async function main() {
	const { year, season, dryRun, enrichLinks } = parseArgs(process.argv.slice(2));

	console.log(`Starting Jikan season import: ${year} ${season}${dryRun ? " (dry-run)" : ""}`);
	const rawAnimes = await fetchSeasonAnime(year, season);
	const animes = enrichLinks ? await enrichAnimeLinks(rawAnimes) : rawAnimes;
	const filteredAnimes = filterBlockedTypeAnime(filterBlockedResourceAnime(animes));
	const rows = dedupeAnimeRows(filteredAnimes.map((anime) => mapJikanAnime(anime, year, season)));

	console.log(`Mapped ${rows.length} anime rows.`);

	if (dryRun) {
		console.log(JSON.stringify(rows.slice(0, 3), null, 2));
		console.log("Dry run complete. No database writes were made.");
		return;
	}

	const savedMalIds = await upsertAnimeRows(rows);
	await syncAnimeRelations(filteredAnimes, savedMalIds);
	console.log(`Import complete: ${rows.length} rows processed.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
