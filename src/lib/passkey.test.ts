import { afterEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({ startAuthentication: vi.fn(), startRegistration: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => browser);

const { passkeyErrorMessage, registerPasskey, signInWithPasskey } = await import("./passkey");

function mockFetch(...responses: { status: number; body: unknown }[]) {
	const fetchMock = vi.fn();
	for (const { status, body } of responses) {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
	}
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("signInWithPasskey", () => {
	it("オプション取得 → 認証器 → 検証の順に進み、遷移先を返す", async () => {
		const fetchMock = mockFetch(
			{ status: 200, body: { challenge: "c" } },
			{ status: 200, body: { redirectTo: "/mylist" } },
		);
		browser.startAuthentication.mockResolvedValue({ id: "cred-1" });

		expect(await signInWithPasskey("/mylist")).toEqual({ ok: true, redirectTo: "/mylist" });
		expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
		expect(fetchMock).toHaveBeenLastCalledWith(
			"/api/auth/passkey/authentication/verify",
			expect.objectContaining({ body: JSON.stringify({ response: { id: "cred-1" }, next: "/mylist" }) }),
		);
	});

	it("サーバーのエラー文言をそのまま返す", async () => {
		mockFetch(
			{ status: 200, body: { challenge: "c" } },
			{ status: 400, body: { message: "このパスキーは登録されていません" } },
		);
		browser.startAuthentication.mockResolvedValue({ id: "cred-1" });
		expect(await signInWithPasskey("/")).toEqual({
			ok: false,
			message: "このパスキーは登録されていません",
			reauthRequired: false,
		});
	});

	it("ダイアログを閉じたらキャンセルとして扱う", async () => {
		mockFetch({ status: 200, body: { challenge: "c" } });
		browser.startAuthentication.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
		expect(await signInWithPasskey("/")).toMatchObject({
			ok: false,
			message: "パスキーの操作がキャンセルされたか、時間切れになりました",
		});
	});
});

describe("registerPasskey", () => {
	it("再ログインが必要なことを呼び出し側に伝える", async () => {
		mockFetch({ status: 403, body: { message: "ログインし直してください", code: "reauth_required" } });
		expect(await registerPasskey()).toEqual({
			ok: false,
			message: "ログインし直してください",
			reauthRequired: true,
		});
		expect(browser.startRegistration).not.toHaveBeenCalled();
	});

	it("認証器で作った資格情報をサーバーに送る", async () => {
		const fetchMock = mockFetch(
			{ status: 200, body: { challenge: "c" } },
			{ status: 200, body: { registered: true } },
		);
		browser.startRegistration.mockResolvedValue({ id: "cred-1" });
		expect(await registerPasskey()).toEqual({ ok: true, redirectTo: null });
		expect(fetchMock).toHaveBeenLastCalledWith(
			"/api/auth/passkey/registration/verify",
			expect.objectContaining({ body: JSON.stringify({ response: { id: "cred-1" } }) }),
		);
	});
});

describe("passkeyErrorMessage", () => {
	it("中断シグナルもキャンセル扱いにする", () => {
		expect(passkeyErrorMessage({ code: "ERROR_CEREMONY_ABORTED" }, "register")).toBe(
			"パスキーの操作がキャンセルされたか、時間切れになりました",
		);
	});

	it("登録済みの認証器を伝える", () => {
		expect(passkeyErrorMessage({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }, "register")).toBe(
			"このパスキーはすでに登録されています",
		);
	});

	it("非対応ブラウザを伝える", () => {
		expect(passkeyErrorMessage(new Error("WebAuthn is not supported in this browser"), "login")).toBe(
			"このブラウザはパスキーに対応していません",
		);
	});

	it("それ以外は操作ごとの汎用文言にする", () => {
		expect(passkeyErrorMessage(new Error("boom"), "login")).toBe("パスキーでログインできませんでした");
		expect(passkeyErrorMessage(null, "register")).toBe("パスキーを登録できませんでした");
	});
});
