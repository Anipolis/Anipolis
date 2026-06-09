export function isHttpUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	return value.startsWith("http://") || value.startsWith("https://");
}

export function isMalUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	return value.includes("myanimelist.net") || value.includes("mal.");
}
