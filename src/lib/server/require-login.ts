import { redirect } from "@sveltejs/kit";

/**
 * ログインが必要なページで、未ログインならログイン画面へ送る。ログインしたらこのページに戻る。
 * （以前はホームへ黙って戻すか 401 のエラー画面を出していて、何が起きたか分からなかった #436）
 * 戻り先は /auth 側で sanitizeInternalRedirect によりサイト内のパスに絞られる。
 */
export function redirectToLogin(url: URL): never {
	redirect(303, `/auth?next=${encodeURIComponent(url.pathname + url.search)}`);
}
