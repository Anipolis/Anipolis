import type { SubmitFunction } from "@sveltejs/kit";
import { tick } from "svelte";
import { confirmReaction } from "$lib/reaction-confirm";
import { isReactionFailure } from "$lib/reaction-feedback";
import { createReactionFeedback } from "$lib/reaction-feedback.svelte";
import type { Post, ReactionType, ReactionUser } from "$lib/types";

/** Per-post interaction state shared by the timeline row and the detail layout. */
export class PostController {
	#post: () => Post;
	#currentUserId: () => string | null;

	likeCountLocal = $state<number | null>(null);
	likedByMeLocal = $state<boolean | null>(null);
	repostCountLocal = $state<number | null>(null);
	repostedByMeLocal = $state<boolean | null>(null);
	bookmarkedByMeLocal = $state<boolean | null>(null);

	// いいね・リポスト・ブックマーク失敗時のカード内メッセージ
	readonly reactionFeedback = createReactionFeedback();

	// 同じ種類のリアクションは 1 件ずつ送る。送信中の連打は取り消し、応答順の逆転で
	// 古い応答が最新の状態を上書きしないようにする（#287）
	// 送信中に押された分は捨てず、表示だけ先に反転して「奇数回押されたか」を覚えておく。
	// 応答が返ったら、サーバーの確定値と押した結果がズレている場合に限り 1 回だけ再送する
	likeInFlight = $state(false);
	likeQueued = false;
	bookmarkInFlight = $state(false);
	bookmarkQueued = false;
	repostInFlight = $state(false);

	repostMenuOpen = $state(false);
	repostForm = $state<HTMLFormElement | null>(null);
	quoteModalOpen = $state(false);
	exchangeModalOpen = $state(false);
	reportModalOpen = $state(false);
	deleteModalOpen = $state(false);
	lightboxUrl = $state<string | null>(null);

	deleting = $state(false);
	deleteError = $state("");
	quoteText = $state("");
	quoteSubmitting = $state(false);
	quoteError = $state("");
	reportReason = $state("spam");
	reportDetails = $state("");
	reportSubmitting = $state(false);
	reportMessage = $state("");

	openReactionType = $state<ReactionType | null>(null);
	reactionUsers = $state<ReactionUser[]>([]);
	reactionUsersLoading = $state(false);
	reactionUsersError = $state("");

	constructor(post: () => Post, currentUserId: () => string | null) {
		this.#post = post;
		this.#currentUserId = currentUserId;
	}

	get post() {
		return this.#post();
	}
	get isLoggedIn() {
		return !!this.#currentUserId();
	}
	get isOwn() {
		const userId = this.#currentUserId();
		return !!userId && userId === this.post.user_id;
	}
	get likeCount() {
		return this.likeCountLocal ?? this.post.like_count;
	}
	get likedByMe() {
		return this.likedByMeLocal ?? this.post.liked_by_me;
	}
	get repostCount() {
		return this.repostCountLocal ?? this.post.repost_count;
	}
	get repostedByMe() {
		return this.repostedByMeLocal ?? this.post.reposted_by_me;
	}
	get bookmarkedByMe() {
		return this.bookmarkedByMeLocal ?? this.post.bookmarked_by_me;
	}
	/** A post's modals are fixed-position children, so the post must stack above its siblings while one is open. */
	get modalOpen() {
		return (
			this.deleteModalOpen ||
			this.exchangeModalOpen ||
			this.quoteModalOpen ||
			this.reportModalOpen ||
			!!this.lightboxUrl
		);
	}

	/** Escape closes every overlay except the quote composer, which may hold a draft. */
	closeOverlays() {
		this.lightboxUrl = null;
		this.deleteModalOpen = false;
		this.exchangeModalOpen = false;
		this.reportModalOpen = false;
		this.openReactionType = null;
	}

	closeQuoteModal() {
		this.quoteModalOpen = false;
		this.quoteText = "";
		this.quoteError = "";
	}

	closeReactionPopover() {
		this.openReactionType = null;
	}

	async openReactionPopover(event: MouseEvent, type: ReactionType) {
		event.preventDefault();
		event.stopPropagation();
		if (this.openReactionType === type) {
			this.closeReactionPopover();
			return;
		}
		this.repostMenuOpen = false;
		this.openReactionType = type;
		this.reactionUsers = [];
		this.reactionUsersError = "";
		this.reactionUsersLoading = true;
		try {
			const response = await fetch(`/api/posts/${encodeURIComponent(this.post.id)}/reactions?type=${type}`);
			const body = (await response.json().catch(() => ({}))) as {
				users?: ReactionUser[];
				message?: string;
			};
			if (this.openReactionType !== type) return;
			if (!response.ok) {
				this.reactionUsersError = body.message ?? "一覧を取得できませんでした";
			} else {
				this.reactionUsers = body.users ?? [];
			}
		} catch {
			if (this.openReactionType === type) this.reactionUsersError = "一覧を取得できませんでした";
		} finally {
			if (this.openReactionType === type) this.reactionUsersLoading = false;
		}
	}

	handleDelete: SubmitFunction = () => {
		this.deleting = true;
		this.deleteError = "";
		return async ({ result, update }) => {
			try {
				if (result.type === "failure" || result.type === "error") {
					this.deleteError =
						result.type === "failure"
							? ((result.data as { message?: string })?.message ?? "投稿の削除に失敗しました")
							: "投稿の削除に失敗しました";
					return;
				}
				this.deleteModalOpen = false;
				await update();
			} finally {
				this.deleting = false;
			}
		};
	};

	// 成功時も update() は呼ばない。update() は load 全体の再実行（invalidateAll）で、
	// ストリーミング配信のタイムラインではスケルトンに戻り閲覧位置を失う（#100）。
	// サーバーの結果（liked / bookmarked / reposted）で楽観更新を確定させるだけにする（#287）。
	// 失敗時は null（= props の post に戻る）ではなく操作前の確定値へ戻す。再取得しないので
	// props の post は古くなり得て、null に戻すと成功済みの操作まで巻き戻るため。
	handleLike: SubmitFunction = ({ formElement, cancel }) => {
		if (this.likeInFlight) {
			cancel();
			this.likeQueued = !this.likeQueued;
			const liked = this.likedByMe;
			this.likeCountLocal = Math.max(0, this.likeCount + (liked ? -1 : 1));
			this.likedByMeLocal = !liked;
			return;
		}
		this.likeInFlight = true;
		this.likeQueued = false;
		const wasLiked = this.likedByMe;
		const countBefore = this.likeCount;
		this.likedByMeLocal = !wasLiked;
		this.likeCountLocal = wasLiked ? countBefore - 1 : countBefore + 1;
		return async ({ result }) => {
			this.likeInFlight = false;
			const queued = this.likeQueued;
			this.likeQueued = false;
			if (isReactionFailure(result)) {
				this.likedByMeLocal = wasLiked;
				this.likeCountLocal = countBefore;
				this.reactionFeedback.fail("like", result, formElement);
				return;
			}
			const confirmed = confirmReaction("like", result, { wasActive: wasLiked, countBefore });
			this.likedByMeLocal = confirmed.active;
			this.likeCountLocal = confirmed.count;
			this.reactionFeedback.clear();
			if (queued) formElement.requestSubmit();
		};
	};

	handleBookmark: SubmitFunction = ({ formElement, cancel }) => {
		if (this.bookmarkInFlight) {
			cancel();
			this.bookmarkQueued = !this.bookmarkQueued;
			this.bookmarkedByMeLocal = !this.bookmarkedByMe;
			return;
		}
		this.bookmarkInFlight = true;
		this.bookmarkQueued = false;
		const wasBookmarked = this.bookmarkedByMe;
		this.bookmarkedByMeLocal = !wasBookmarked;
		return async ({ result }) => {
			this.bookmarkInFlight = false;
			const queued = this.bookmarkQueued;
			this.bookmarkQueued = false;
			if (isReactionFailure(result)) {
				this.bookmarkedByMeLocal = wasBookmarked;
				this.reactionFeedback.fail("bookmark", result, formElement);
				return;
			}
			this.bookmarkedByMeLocal = confirmReaction("bookmark", result, {
				wasActive: wasBookmarked,
				countBefore: 0,
			}).active;
			this.reactionFeedback.clear();
			if (queued) formElement.requestSubmit();
		};
	};

	// リポストフォームはメニューを閉じた時点で DOM から消えるため、再試行はメニューを
	// 開き直してから新しいフォームを送信する（破棄済みフォームの requestSubmit は無効）
	async retryRepost() {
		this.repostMenuOpen = true;
		await tick();
		this.repostForm?.requestSubmit();
	}

	handleRepost: SubmitFunction = ({ cancel }) => {
		this.repostMenuOpen = false;
		if (this.repostInFlight) {
			cancel();
			return;
		}
		this.repostInFlight = true;
		const wasReposted = this.repostedByMe;
		const countBefore = this.repostCount;
		this.repostedByMeLocal = !wasReposted;
		this.repostCountLocal = wasReposted ? countBefore - 1 : countBefore + 1;
		return async ({ result }) => {
			this.repostInFlight = false;
			if (isReactionFailure(result)) {
				this.repostedByMeLocal = wasReposted;
				this.repostCountLocal = countBefore;
				this.reactionFeedback.fail("repost", result, () => void this.retryRepost());
				return;
			}
			const confirmed = confirmReaction("repost", result, { wasActive: wasReposted, countBefore });
			this.repostedByMeLocal = confirmed.active;
			this.repostCountLocal = confirmed.count;
			this.reactionFeedback.clear();
		};
	};

	async submitQuoteRepost() {
		if (!this.quoteText.trim()) return;
		this.quoteSubmitting = true;
		this.quoteError = "";
		try {
			const fd = new FormData();
			fd.append("content", this.quoteText.trim());
			fd.append("quote_post_id", this.post.id);
			const res = await fetch("/api/posts", { method: "POST", body: fd });
			if (!res.ok) {
				const msg = await res.text();
				this.quoteError = msg || "投稿に失敗しました";
			} else {
				const count = this.repostCount;
				this.closeQuoteModal();
				this.repostedByMeLocal = true;
				this.repostCountLocal = count + 1;
			}
		} catch {
			this.quoteError = "投稿に失敗しました";
		}
		this.quoteSubmitting = false;
	}

	async submitReport() {
		this.reportSubmitting = true;
		this.reportMessage = "";
		try {
			const fd = new FormData();
			fd.append("target_type", "post");
			fd.append("target_id", this.post.id);
			fd.append("reason", this.reportReason);
			fd.append("details", this.reportDetails.trim());

			const res = await fetch("/api/reports", { method: "POST", body: fd });
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) {
				this.reportMessage = body.message ?? "通報の送信に失敗しました";
			} else {
				this.reportMessage = "通報を受け付けました";
				this.reportDetails = "";
				setTimeout(() => {
					this.reportModalOpen = false;
					this.reportMessage = "";
				}, 900);
			}
		} catch {
			this.reportMessage = "通報の送信に失敗しました";
		}
		this.reportSubmitting = false;
	}
}
