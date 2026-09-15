<script lang="ts">
  import LanguageSwitch from '../components/LanguageSwitch.svelte';
  import { t } from '../lib/i18n.svelte.ts';
</script>

<div class="corner"><LanguageSwitch /></div>

<main class="center-page">
  <div class="narrow stack hero">
    <h1 class="brand logo">Vote<span>Hope</span></h1>
    <p class="muted">{t('home.tagline')}</p>
    <a class="btn btn-primary" href="/admin">{t('home.presenterArea')}</a>
  </div>
</main>

<style>
  .corner {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }

  .hero {
    text-align: center;
  }

  .logo {
    font-size: 2.6rem;
  }
</style>
