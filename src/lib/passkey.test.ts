import { describe, expect, it } from "vitest";
import { passkeyErrorMessage } from "./passkey";

describe("passkeyErrorMessage", () => {
	it("ダイアログを閉じた（NotAllowedError）場合はキャンセル扱いにする", () => {
		const error = {
			code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
			message: "The operation either timed out or was not allowed.",
			cause: { name: "NotAllowedError" },
		};
		expect(passkeyErrorMessage(error, "login")).toBe("パスキーの操作がキャンセルされたか、時間切れになりました");
	});

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
		expect(passkeyErrorMessage({ message: "Browser does not support WebAuthn" }, "login")).toBe(
			"このブラウザはパスキーに対応していません",
		);
	});

	it("レート制限を伝える", () => {
		expect(passkeyErrorMessage({ code: "over_request_rate_limit" }, "login")).toBe(
			"試行回数が多すぎます。しばらく待ってからお試しください",
		);
	});

	it("それ以外は操作ごとの汎用文言にする", () => {
		expect(passkeyErrorMessage({ code: "unexpected_failure" }, "login")).toBe("パスキーでログインできませんでした");
		expect(passkeyErrorMessage({}, "register")).toBe("パスキーを登録できませんでした");
	});
});
