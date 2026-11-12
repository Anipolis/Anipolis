import { error, fail, redirect } from "@sveltejs/kit";
import type { MylistActivity } from "$lib/activity";
import {
	blockUserAction,
	deletePostAction,
	muteUserAction,
	removeUserAnimeEntry,
	toggleBookmarkAction,
	toggleFollowAction,
	toggleLikeAction,
	toggleRepostAction,
	unblockUserAction,
	unmuteUserAction,
	upsertUserAnimeEntry,
} from "$lib/server/actions";
import {
	checkIsFollowing,
	fillTimelinePage,
	getAnimeRankingTrending,
	getBookmarkedPostsPage,
	getFavoriteAnime,
	getFollowCounts,
	getFollowRequestStatus,
	getLikedPostsPage,
	getOwnEntriesForAnime,
	getProfileImagePostsPage,
	getProfilePostCount,
	getProfileTimelinePage,
	getTrendingHashtags,
	getUserActivityPage,
	getUserAnimeList,
	isBlockedByMe,
	isMutedByMe,
} from "$lib/server/queries";
import { parseTimelineCursor, type TimelineCursor } from "$lib/timeline-cursor";
import type { Post } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const EMPTY_PAGE: { posts: Post[]; nextCursor: TimelineCursor | null } = { posts: [], nextCursor: null };

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const { data: profile } = await supabase.from("profiles").select("*").eq("username", params.username).maybeSingle();

	if (!profile) {
		error(404, "ユーザーが見つかりません");
	}
	const profileWithHeader = {
		...profile,
		header_url: (profile as typeof profile & { header_url?: string | null }).header_url ?? null,
	};

	const isOwn = user?.id === profile.id;
	const myId = user?.id;

	const [isFollowing, rawFollowRequestStatus, isBlocked, isMuted] = await Promise.all([
		myId && !isOwn ? checkIsFollowing(supabase, myId, profile.id) : Promise.resolve(false),
		myId && !isOwn ? getFollowRequestStatus(supabase, myId, profile.id) : Promise.resolve("none" as const),
		myId && !isOwn ? isBlockedByMe(supabase, myId, profile.id) : Promise.resolve(false),
		myId && !isOwn ? isMutedByMe(supabase, myId, profile.id) : Promise.resolve(false),
	]);
	const followRequestStatus = isFollowing ? ("none" as const) : rawFollowRequestStatus;
	const canViewContent = isOwn || !profile.is_private || isFollowing;
	// 画面のタブの決め方（+page.svelte の activeTab）と合わせる。開いているタブの一覧だけを読む
	const requestedTab = url.searchParams.get("tab");
	// コレクションはプロフィールに並べず、自分用の /collections で管理する。前のリンクはそちらへ送る
	if (requestedTab === "collections") redirect(303, isOwn ? "/collections" : `/profile/${profile.username}`);
	const activeTab =
		requestedTab === "images" ||
		requestedTab === "list" ||
		requestedTab === "activity" ||
		requestedTab === "likes" ||
		requestedTab === "bookmarks"
			? requestedTab
			: "posts";
	const cursor = parseTimelineCursor(url.searchParams);
	const viewerId = user?.id ?? null;

	const loadActiveList = async (): Promise<{ posts: Post[]; nextCursor: TimelineCursor | null }> => {
		// 投稿の一覧は登録した人だけに見せる（マイリスト・アクティビティは投稿ではないので見せる）
		if (!canViewContent || !user) return EMPTY_PAGE;
		let page: { posts: Post[]; error: unknown | null; nextCursor: TimelineCursor | null };
		if (activeTab === "posts") {
			const repostContext = {
				id: profile.id,
				username: profile.username,
				display_name: profile.display_name,
				avatar_url: profile.avatar_url,
			};
			page = await fillTimelinePage(
				(next) => getProfileTimelinePage(supabase, repostContext, viewerId, { cursor: next }),
				cursor,
			);
		} else if (activeTab === "images") {
			page = await fillTimelinePage(
				(next) => getProfileImagePostsPage(supabase, profile.id, viewerId, { cursor: next }),
				cursor,
			);
		} else if (activeTab === "likes" && isOwn) {
			page = await getLikedPostsPage(supabase, profile.id, viewerId, cursor);
		} else if (activeTab === "bookmarks" && isOwn) {
			page = await getBookmarkedPostsPage(supabase, profile.id, cursor);
		} else {
			return EMPTY_PAGE;
		}
		if (page.error) console.error(`[profile] ${activeTab} query failed:`, page.error);
		return { posts: page.posts, nextCursor: page.nextCursor };
	};

	// アクティビティ（181）はマイリストと同じ相手に見せる。読めなかったときは null にして、「まだ無い」と見せない
	const canViewList = canViewContent && (isOwn || profile.list_is_public);
	const loadActivity = async (): Promise<{ items: MylistActivity[]; nextCursor: TimelineCursor | null } | null> => {
		if (activeTab !== "activity" || !canViewList) return { items: [], nextCursor: null };
		const page = await fillTimelinePage(
			(next) => getUserActivityPage(supabase, profile.id, viewerId, next ? { before: next } : {}),
			cursor,
		);
		if (page.error) {
			console.error("[profile] activity query failed:", page.error);
			return null;
		}
		return { items: page.posts, nextCursor: page.nextCursor };
	};

	const [activeList, postCount, followCounts, trendingResult, animeTrending, animeList, favoriteAnime, activity] =
		await Promise.all([
			loadActiveList(),

			canViewContent ? getProfilePostCount(supabase, profile.id) : Promise.resolve(0),

			getFollowCounts(supabase, profile.id),

			getTrendingHashtags(supabase, 10),

			getAnimeRankingTrending(supabase, 5),

			// マイリストのタブを開いているときは、読めなければ失敗として扱う（空のリストと見せない、#262）。
			// ほかのタブでは件数の表示に使うだけなので、読めなくてもプロフィールは出す
			canViewList
				? activeTab === "list"
					? getUserAnimeList(supabase, profile.id)
					: getUserAnimeList(supabase, profile.id).catch(() => [])
				: Promise.resolve([]),

			// ベスト作品（#361）。投稿と同じ相手に見せる。読めなくてもプロフィールは出すが、失敗は null で
			// 「未登録（[]）」と分ける。空と取り違えて編集・保存すると、保存済みの選択を消してしまう
			canViewContent ? getFavoriteAnime(supabase, profile.id).catch((): null => null) : Promise.resolve([]),

			loadActivity(),
		]);

	// 他の人のマイリストのカードでは、右のマスに見ている人自身のマイリストを出す。
	// 読めなければ null にしてボタンを出さない（未登録と取り違えて二重に登録させない）
	const viewerEntries =
		myId && !isOwn && activeTab === "list" && animeList.length > 0
			? await getOwnEntriesForAnime(
					supabase,
					myId,
					animeList.map((anime) => anime.id),
				).catch((): null => null)
			: null;

	return {
		profile: profileWithHeader,
		// 開いているタブ（投稿・画像・いいね・ブックマーク）の一覧と、その続きの目印
		listPosts: activeList.posts,
		listNextCursor: activeList.nextCursor,
		postCount,
		isOwn,
		canViewContent,
		followCounts,
		isFollowing,
		followRequestStatus,
		isBlocked,
		isMuted,
		trending: trendingResult,
		animeTrending,
		animeList,
		viewerEntries,
		favoriteAnime,
		activity,
		user,
	};
};

export const actions: Actions = {
	// マイリストのタブのカードから自分のマイリストを変える（アニメ一覧と同じ）
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return upsertUserAnimeEntry(supabase, request, user.id);
	},

	removeWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return removeUserAnimeEntry(supabase, request, user.id);
	},

	updateProfile: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const { data: profile } = await supabase
			.from("profiles")
			.select("id")
			.eq("username", params.username)
			.maybeSingle();

		if (!profile || profile.id !== user.id) {
			return fail(403, { message: "プロフィール編集は本人だけが利用できます" });
		}

		const form = await request.formData();
		const displayName = (form.get("display_name") as string | null)?.trim() || null;
		const bio = (form.get("bio") as string | null)?.trim() || null;

		if (displayName && displayName.length > 50) {
			return fail(400, { field: "display_name", message: "表示名は50文字以内で入力してください" });
		}
		if (bio && bio.length > 160) {
			return fail(400, { field: "bio", message: "自己紹介は160文字以内で入力してください" });
		}

		const { error } = await supabase.from("profiles").update({ display_name: displayName, bio }).eq("id", user.id);

		if (error) return fail(500, { message: "プロフィールの更新に失敗しました" });

		return { success: true };
	},

	follow: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleFollowAction(request, supabase, user.id);
	},

	deletePost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return deletePostAction(request, supabase, user.id);
	},

	like: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleLikeAction(request, supabase, user.id);
	},

	repost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleRepostAction(request, supabase, user.id);
	},
	bookmark: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleBookmarkAction(request, supabase, user.id);
	},

	block: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return blockUserAction(request, supabase, user.id);
	},

	unblock: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return unblockUserAction(request, supabase, user.id);
	},

	mute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return muteUserAction(request, supabase, user.id);
	},

	unmute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return unmuteUserAction(request, supabase, user.id);
	},
};
