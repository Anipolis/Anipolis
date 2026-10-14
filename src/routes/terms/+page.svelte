<script lang="ts">
import LegalDocument from "$lib/components/LegalDocument.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<LegalDocument title="利用規約" html={data.html} />
