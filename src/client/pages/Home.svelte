<script lang="ts">
  import LanguageSwitch from '../components/LanguageSwitch.svelte';
  import { t } from '../lib/i18n.svelte.ts';
  import { navigate } from '../lib/router.svelte.ts';

  let code = $state('');
  let invalid = $state(false);

  function join(event: SubmitEvent) {
    event.preventDefault();
    const digits = code.replace(/\D/g, '');
    invalid = digits.length !== 6;
    if (!invalid) navigate(`/j/${digits}`);
  }
</script>

<div class="corner"><LanguageSwitch /></div>

<main class="center-page">
  <div class="narrow stack hero">
    <h1 class="brand logo">Vote<span>Hope</span></h1>
    <p class="muted">{t('home.tagline')}</p>

    <form class="card join" onsubmit={join}>
      <label for="code">{t('home.codeLabel')}</label>
      <div class="row">
        <input
          id="code"
          inputmode="numeric"
          autocomplete="off"
          placeholder="123 456"
          maxlength="7"
          bind:value={code}
          aria-invalid={invalid}
        />
        <button class="btn btn-primary" type="submit">{t('home.join')}</button>
      </div>
      {#if invalid}
        <p class="field-error">{t('home.invalidCode')}</p>
      {/if}
    </form>

    <a class="presenter" href="/admin">{t('home.presenterArea')}</a>
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

  .join {
    text-align: left;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  #code {
    font-size: 1.4rem;
    letter-spacing: 0.12em;
    text-align: center;
  }

  .presenter {
    display: inline-block;
    font-size: 0.9rem;
    color: var(--muted);
  }
</style>
