import { describe, expect, it } from "vitest";
import {
	isInvalidNonceError,
	isReauthenticationRequiredError,
	isSamePasswordError,
	normalizeNonce,
} from "./password-change";

describe("password change error classification", () => {
	it("detects the reauthentication requirement by code or message", () => {
		expect(isReauthenticationRequiredError({ code: "reauthentication_needed", message: "x" })).toBe(true);
		expect(isReauthenticationRequiredError({ message: "Password update requires reauthentication" })).toBe(true);
		expect(
			isReauthenticationRequiredError({ code: "same_password", message: "New password should be different" }),
		).toBe(false);
		expect(isReauthenticationRequiredError(null)).toBe(false);
	});

	it("does not confuse an invalid nonce with a missing reauthentication", () => {
		const invalid = { code: "reauthentication_not_valid", message: "Invalid nonce" };
		expect(isInvalidNonceError(invalid)).toBe(true);
		expect(isReauthenticationRequiredError(invalid)).toBe(false);
		expect(isInvalidNonceError({ message: "Nonce has expired or is invalid" })).toBe(true);
	});

	it("recognizes the same-password rejection", () => {
		expect(isSamePasswordError({ code: "same_password" })).toBe(true);
		expect(isSamePasswordError({ message: "New password should be different from the old password." })).toBe(true);
		expect(isSamePasswordError({ message: "Password is too weak" })).toBe(false);
	});
});

describe("normalizeNonce", () => {
	it("trims, strips inner spaces and converts full-width digits", () => {
		expect(normalizeNonce(" 123 456 ")).toBe("123456");
		expect(normalizeNonce("１２３４５６")).toBe("123456");
		expect(normalizeNonce(null)).toBe("");
		expect(normalizeNonce(new File([], "x"))).toBe("");
	});
});
