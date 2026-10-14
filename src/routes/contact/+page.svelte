<script lang="ts">
import LegalDocument from "$lib/components/LegalDocument.svelte";

type Contact = { id: string; heading: string; description: string; email: string };

// mailto: は既定のメールアプリがない環境やアプリ内ブラウザで何も起きないため、
// アドレスを文字で見せてコピーできるようにし、メールアプリ起動は補助的なリンクに留める
const contacts: Contact[] = [
	{
		id: "general",
		heading: "一般のお問い合わせ・権利者の方",
		description:
			"本サービスへのご意見・不具合のご報告、作品情報の誤りのご指摘、権利者の方からの修正・削除のご依頼、企業・学校・協力者の方からのご連絡はこちらへお願いします。",
		email: "contact@anipolis.net",
	},
	{
		id: "privacy",
		heading: "個人情報の取扱い",
		description:
			"個人情報の取扱いに関するご相談、開示・訂正・削除・利用停止等のご請求、アカウント削除のご依頼はこちらへお願いします。",
		email: "privacy@anipolis.net",
	},
];

let copiedId = $state<string | null>(null);
let failedId = $state<string | null>(null);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

async function copyEmail(contact: Contact) {
	clearTimeout(resetTimer);
	try {
		await navigator.clipboard.writeText(contact.email);
		copiedId = contact.id;
		failedId = null;
	} catch {
		copiedId = null;
		failedId = contact.id;
	}
	resetTimer = setTimeout(() => {
		copiedId = null;
		failedId = null;
	}, 2500);
}
</script>

<LegalDocument title="お問い合わせ">
	<h1>お問い合わせ</h1>
	<p>Anipolisへのお問い合わせは、内容に応じて以下のメールアドレスまでお送りください。</p>

	{#each contacts as contact (contact.id)}
		<section class="contact-block" aria-labelledby="contact-{contact.id}">
			<h2 id="contact-{contact.id}">{contact.heading}</h2>
			<p>{contact.description}</p>
			<div class="contact-address">
				<span class="contact-email">{contact.email}</span>
				<button
					type="button"
					class="contact-copy"
					class:copied={copiedId === contact.id}
					onclick={() => copyEmail(contact)}
					aria-label={copiedId === contact.id ? "コピーしました" : `${contact.email} をコピー`}
					title={copiedId === contact.id ? "コピーしました" : "コピー"}
				>
					{#if copiedId === contact.id}
						<span class="i-lucide-check" aria-hidden="true"></span>
					{:else}
						<span class="i-lucide-copy" aria-hidden="true"></span>
					{/if}
				</button>
				<a href="mailto:{contact.email}" class="contact-mailto">メールアプリで開く</a>
			</div>
			{#if failedId === contact.id}
				<p class="contact-copy-error" role="status">
					コピーできませんでした。アドレスを長押し・選択してコピーしてください。
				</p>
			{/if}
		</section>
	{/each}

	<h2>お送りいただく際のお願い</h2>
	<ul>
		<li>作品情報や投稿に関するご連絡は、対象ページのURLと具体的な内容を添えてください。</li>
		<li>アカウントに関するご連絡は、ユーザー名（@から始まるID）をお書き添えください。</li>
		<li>内容を確認のうえ、順次対応します。返信までにお時間をいただく場合があります。</li>
	</ul>
</LegalDocument>

<style>
.contact-block {
	padding: 4px 0 8px;
}

.contact-address {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	margin: 4px 0 12px;
	padding: 12px 14px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
}

.contact-email {
	font-weight: 700;
	font-size: 1rem;
	user-select: all;
	word-break: break-all;
}

.contact-copy {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: none;
	color: var(--color-text-muted);
	font-size: 1rem;
	cursor: pointer;
	transition:
		background 0.12s,
		color 0.12s;
}

.contact-copy:hover {
	background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	color: var(--color-accent);
}

.contact-copy.copied {
	border-color: var(--color-accent);
	color: var(--color-accent);
}

.contact-mailto {
	font-size: 0.85rem;
}

.contact-copy-error {
	color: var(--color-text-muted);
	font-size: 0.85rem;
}
</style>
