<script lang="ts">
  import { renderMarkdown } from '../lib/markdown.ts';

  let { source }: { source: string } = $props();

  const html = $derived(renderMarkdown(source));
</script>

<!-- renderMarkdown sanitizes its output. -->
<div class="md">{@html html}</div>
