<script lang="ts">
import LegalDocument from "$lib/components/LegalDocument.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<LegalDocument title="プライバシーポリシー" html={data.html} />
