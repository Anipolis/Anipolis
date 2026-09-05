/**
 * Shared HTTP policy for the data importers.
 *
 * Every attempt has a finite timeout. Transient upstream failures (rate
 * limiting, 5xx responses, and network/abort errors) are retried with capped
 * exponential backoff. A permanent 4xx response is returned immediately so
 * callers can fail with the upstream status instead of hammering the service.
 */

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_HTTP_MAX_RETRIES = 5;
export const DEFAULT_HTTP_RETRY_STATUS_CODES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);
export const HTTP_RETRY_BACKOFF_BASE_MS = 2_000;
export const HTTP_RETRY_MAX_DELAY_MS = 60_000;

export type HttpRetryOptions = {
	timeoutMs?: number;
	maxRetries?: number;
	retryStatuses?: ReadonlySet<number>;
	sleep?: (delayMs: number) => void | Promise<void>;
	now?: () => number;
	afterAttempt?: () => void | Promise<void>;
	onResponse?: (response: Response) => void;
};

function defaultSleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Return the delay requested by an upstream Retry-After header, falling back
 * to capped exponential backoff when the header is absent or malformed.
 * Both the seconds and HTTP-date forms from RFC 9110 are accepted.
 */
export function getHttpRetryDelayMs(response: Response | null, attempt: number, now = Date.now()): number {
	const retryAfter = response?.headers.get("retry-after")?.trim();
	if (retryAfter) {
		if (/^\d+$/.test(retryAfter)) {
			return Math.min(Number(retryAfter) * 1_000, HTTP_RETRY_MAX_DELAY_MS);
		}

		const retryAt = Date.parse(retryAfter);
		if (Number.isFinite(retryAt)) {
			return Math.min(Math.max(retryAt - now, 0), HTTP_RETRY_MAX_DELAY_MS);
		}
	}

	return Math.min(HTTP_RETRY_MAX_DELAY_MS, HTTP_RETRY_BACKOFF_BASE_MS * 2 ** attempt);
}

function attemptSignal(input: RequestInit, timeoutMs: number): AbortSignal {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	return input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
}

export async function fetchWithRetry(
	input: RequestInfo | URL,
	init: RequestInit = {},
	options: HttpRetryOptions = {},
): Promise<Response> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
	const maxRetries = options.maxRetries ?? DEFAULT_HTTP_MAX_RETRIES;
	const retryStatuses = options.retryStatuses ?? DEFAULT_HTTP_RETRY_STATUS_CODES;
	const sleep = options.sleep ?? defaultSleep;
	const now = options.now ?? Date.now;

	if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
		throw new Error("HTTP timeout must be a positive integer.");
	}
	if (!Number.isInteger(maxRetries) || maxRetries < 0) {
		throw new Error("HTTP maxRetries must be a non-negative integer.");
	}

	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(input, { ...init, signal: attemptSignal(init, timeoutMs) });
		} catch (error) {
			await options.afterAttempt?.();
			if (attempt >= maxRetries) throw error;
			await sleep(getHttpRetryDelayMs(null, attempt, now()));
			continue;
		}

		try {
			options.onResponse?.(response);
		} finally {
			await options.afterAttempt?.();
		}

		if (response.ok || !retryStatuses.has(response.status) || attempt >= maxRetries) {
			return response;
		}

		// Release a retryable response body before opening the next connection.
		await response.body?.cancel();
		await sleep(getHttpRetryDelayMs(response, attempt, now()));
	}

	throw new Error("HTTP retry loop exited unexpectedly.");
}
