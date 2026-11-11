/**
 * メールのリンクを開いたとき（ブラウザのページ遷移）のリクエストか。
 *
 * メールのリンクの着地先（/auth/confirm・/auth/reset-password）は、GET でトークンを確認して
 * そのブラウザをログインさせる。画像の URL（アイコンなど、利用者が決められる値）にこのリンクを
 * 入れられると、その画像を表示しただけの人のブラウザが、リンクの持ち主のアカウントでログインし直される。
 *
 * ブラウザは読み込みの種類を Sec-Fetch-Dest で送る。ページ遷移は "document"、画像は "image"、
 * fetch（SvelteKit のクライアント遷移の __data.json を含む）は "empty"。ページ遷移以外では確認しない。
 * このヘッダーはページのスクリプトからは書き換えられない。
 * ヘッダーを送らない古いブラウザ・メールアプリは、これまで通り受け付ける。
 */
export function isEmailLinkNavigation(request: Request): boolean {
	const destination = request.headers.get("sec-fetch-dest");
	return destination === null || destination === "document";
}
