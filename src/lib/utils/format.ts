/**
 * 相対時間を日本語で返す
 * 例: "2分前", "3時間前", "昨日", "4月10日"
 */
export function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds <= 0) return 'たった今';
    if (diffSeconds < 60) return `${diffSeconds}秒前`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分前`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}時間前`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}日前`;

    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

/**
 * 投稿文字数のクラス名を返す（色変化用）
 */
export function charCountClass(length: number, max: number): string {
    if (max <= 0) throw new Error('max must be > 0');
    const ratio = length / max;
    if (ratio >= 1) return 'danger';
    if (ratio >= 0.9) return 'warning';
    return '';
}
