import { getContext, setContext } from "svelte";
import { createLatestResolved, type LatestResolved } from "$lib/latest-resolved.svelte";
import type { Anime, OpenBroadcastRoomSummary, TrendingHashtag } from "$lib/types";

export interface SidebarData {
	trending: TrendingHashtag[];
	animeTrending: Anime[];
	watchingAnime: Anime[];
	liveRooms: OpenBroadcastRoomSummary[];
}

const sidebarKey = Symbol("shared-sidebar");

/** ページのアンマウントをまたいで解決済みのサイド情報を保持する。SSR のリクエスト間では共有しない。 */
export function provideSidebar(getData: () => Promise<SidebarData> | SidebarData, getUserId: () => string) {
	const sidebar = createLatestResolved(getData, getUserId);
	setContext(sidebarKey, sidebar);
	return sidebar;
}

export function getSidebar(): LatestResolved<SidebarData> | undefined {
	return getContext(sidebarKey);
}
