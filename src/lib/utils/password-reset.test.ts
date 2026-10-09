import { describe, expect, it } from "vitest";
import {
	getPasswordResetRedirectTo,
	isPlausibleEmail,
	listSignInProviderLabels,
	normalizeEmail,
	parseRecoveryLink,
	validateNewPassword,
	withFixedDuration,
} from "./password-reset";

describe("normalizeEmail / isPlausibleEmail", () => {
	it("trims and lowercases the input", () => {
		expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
		expect(normalizeEmail(null)).toBe("");
	});

	it("accepts ordinary addresses and rejects obvious mistakes", () => {
		expect(isPlausibleEmail("user@example.com")).toBe(true);
		expect(isPlausibleEmail("")).toBe(false);
		expect(isPlausibleEmail("user@")).toBe(false);
		expect(isPlausibleEmail("user example.com")).toBe(false);
		expect(isPlausibleEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
	});
});

describe("validateNewPassword", () => {
	it("requires the same minimum length as signup", () => {
		expect(validateNewPassword("12345", "12345")).toEqual({
			ok: false,
			field: "password",
			message: "パスワードは6文字以上で入力してください",
		});
	});

	it("requires the confirmation to match", () => {
		expect(validateNewPassword("secret1", "secret2")).toEqual({
			ok: false,
			field: "confirm",
			message: "パスワードが一致しません",
		});
	});

	it("accepts a matching password of sufficient length", () => {
		expect(validateNewPassword("secret1", "secret1")).toEqual({ ok: true });
	});
});

describe("getPasswordResetRedirectTo", () => {
	it("points at the reset page on the request origin", () => {
		expect(getPasswordResetRedirectTo("https://anipolis.example")).toBe(
			"https://anipolis.example/auth/reset-password",
		);
	});
});

describe("parseRecoveryLink", () => {
	it("prefers token_hash recovery links", () => {
		const params = new URLSearchParams({ token_hash: "abc", type: "recovery", code: "xyz" });
		expect(parseRecoveryLink(params)).toEqual({ kind: "token_hash", tokenHash: "abc" });
	});

	it("ignores token_hash of other types", () => {
		const params = new URLSearchParams({ token_hash: "abc", type: "signup" });
		expect(parseRecoveryLink(params)).toEqual({ kind: "none" });
	});

	it("recognises PKCE codes", () => {
		expect(parseRecoveryLink(new URLSearchParams({ code: "xyz" }))).toEqual({ kind: "code", code: "xyz" });
	});

	it("maps Supabase error redirects to expired / invalid", () => {
		expect(parseRecoveryLink(new URLSearchParams({ error: "access_denied", error_code: "otp_expired" }))).toEqual({
			kind: "error",
			expired: true,
		});
		expect(parseRecoveryLink(new URLSearchParams({ error: "access_denied" }))).toEqual({
			kind: "error",
			expired: false,
		});
	});

	it("returns none for a plain visit", () => {
		expect(parseRecoveryLink(new URLSearchParams())).toEqual({ kind: "none" });
	});
});

describe("listSignInProviderLabels", () => {
	it("maps providers to display labels, drops email and duplicates", () => {
		expect(listSignInProviderLabels(["email", "google", "twitter", "x", "discord", "google"])).toEqual([
			"Google",
			"X",
			"Discord",
		]);
	});

	it("passes unknown providers through", () => {
		expect(listSignInProviderLabels(["github"])).toEqual(["github"]);
	});
});

describe("withFixedDuration", () => {
	it("waits for the full duration even when the task finishes immediately", async () => {
		const startedAt = Date.now();
		await withFixedDuration(async () => {}, 40);
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(35);
	});

	it("returns on time without waiting for a slow task, handing it to keepAlive", async () => {
		let finished = false;
		const kept: Promise<unknown>[] = [];
		const startedAt = Date.now();
		await withFixedDuration(
			() =>
				new Promise<void>((resolve) =>
					setTimeout(() => {
						finished = true;
						resolve();
					}, 300),
				),
			20,
			(promise) => kept.push(promise),
		);
		expect(Date.now() - startedAt).toBeLessThan(200);
		expect(finished).toBe(false);
		expect(kept).toHaveLength(1);
		await kept[0];
		expect(finished).toBe(true);
	});
});
