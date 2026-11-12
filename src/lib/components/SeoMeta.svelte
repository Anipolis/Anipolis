<script lang="ts">
import { page } from "$app/state";
import {
	canonicalUrl,
	DEFAULT_DESCRIPTION,
	DEFAULT_OG_IMAGE_ALT,
	DEFAULT_OG_IMAGE_PATH,
	metaText,
	toAbsoluteUrl,
} from "$lib/seo";

/**
 * ページの <title> と、共有したときのカード（OGP / X）をまとめて出す（#271）。
 * クローラーは JS を動かさないので、値はサーバーで描画できるもの（load の結果）だけにする。
 *
 * - image を渡さなければ既定の画像（static/og-default.png、横長）を大きなカードで出す
 * - 作品のカバーのように縦長の画像は card="summary"（小さな正方形の枠）にする。
 *   X の大きなカードは 2:1 に切り抜くため、縦長だと顔や題字が切れる
 * - noindex は検索に載せたくないページ（非公開のコレクションなど）
 * - url は og:url の上書き。既定はクエリを落とした URL だが、招待リンクのようにクエリが
 *   行き先の一部になっているページでは渡す（Facebook などは og:url をリンク先に使う）
 */
let {
	title,
	description = DEFAULT_DESCRIPTION,
	image = null,
	imageAlt = null,
	card = null,
	type = "website",
	noindex = false,
	url: urlOverride = null,
}: {
	title: string;
	description?: string | null | undefined;
	image?: string | null;
	imageAlt?: string | null;
	card?: "summary" | "summary_large_image" | null;
	type?: "website" | "article" | "profile";
	noindex?: boolean;
	url?: string | null;
} = $props();

const origin = $derived(page.url.origin);
const resolvedImage = $derived(toAbsoluteUrl(image ?? DEFAULT_OG_IMAGE_PATH, origin));
const resolvedAlt = $derived(image ? (imageAlt ?? title) : DEFAULT_OG_IMAGE_ALT);
const resolvedCard = $derived(card ?? (image ? "summary" : "summary_large_image"));
const resolvedDescription = $derived(metaText(description || DEFAULT_DESCRIPTION, 160));
const canonical = $derived(canonicalUrl(page.url));
const url = $derived(urlOverride ? toAbsoluteUrl(urlOverride, origin) : canonical);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={resolvedDescription}>
	<link rel="canonical" href={canonical}>
	<meta property="og:title" content={title}>
	<meta property="og:description" content={resolvedDescription}>
	<meta property="og:type" content={type}>
	<meta property="og:url" content={url}>
	<meta property="og:image" content={resolvedImage}>
	<meta property="og:image:alt" content={resolvedAlt}>
	{#if !image}
		<meta property="og:image:width" content="1200">
		<meta property="og:image:height" content="630">
	{/if}
	<meta name="twitter:card" content={resolvedCard}>
	<meta name="twitter:title" content={title}>
	<meta name="twitter:description" content={resolvedDescription}>
	<meta name="twitter:image" content={resolvedImage}>
	<meta name="twitter:image:alt" content={resolvedAlt}>
	{#if noindex}
		<meta name="robots" content="noindex">
	{/if}
</svelte:head>
