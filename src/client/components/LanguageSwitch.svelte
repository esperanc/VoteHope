<script lang="ts">
  import { i18n, LOCALES, setLocale } from '../lib/i18n.svelte.ts';
</script>

<div class="switch" role="group" aria-label="Idioma / Language">
  {#each LOCALES as locale (locale)}
    <button type="button" aria-pressed={i18n.locale === locale} onclick={() => setLocale(locale)}>
      {locale.toUpperCase()}
    </button>
  {/each}
</div>

<style>
  .switch {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  button {
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    padding: 0.35rem 0.6rem;
    color: var(--muted);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    color: var(--accent-text);
    background: var(--accent);
  }
</style>
