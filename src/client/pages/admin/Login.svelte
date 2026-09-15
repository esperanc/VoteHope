<script lang="ts">
  import LanguageSwitch from '../../components/LanguageSwitch.svelte';
  import { ApiError } from '../../lib/api.ts';
  import { auth, login, refreshAuth } from '../../lib/auth.svelte.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { navigate, queryParam } from '../../lib/router.svelte.ts';

  let password = $state('');
  let error = $state<MessageKey | null>(null);
  let busy = $state(false);

  function nextPath(): string {
    const next = queryParam('next');
    // Only same-site paths, so the login page can't be used to redirect elsewhere.
    return next?.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  }

  $effect(() => {
    if (auth.status === 'unknown') refreshAuth();
    else if (auth.status === 'in') navigate(nextPath(), true);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      await login(password);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : -1;
      error =
        status === 401
          ? 'login.wrongPassword'
          : status === 429
            ? 'login.tooManyAttempts'
            : status === 0
              ? 'error.network'
              : 'error.unexpected';
      password = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="corner"><LanguageSwitch /></div>

<main class="center-page">
  <form class="card narrow stack" onsubmit={submit}>
    <a class="brand" href="/">Vote<span>Hope</span></a>
    <h1>{t('login.title')}</h1>
    <div>
      <label for="password">{t('login.password')}</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="password" type="password" autocomplete="current-password" required autofocus bind:value={password} />
    </div>
    {#if error}
      <p class="error" role="alert">{t(error)}</p>
    {/if}
    <button class="btn btn-primary btn-block" type="submit" disabled={busy}>{t('login.submit')}</button>
  </form>
</main>

<style>
  .corner {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }

  h1 {
    font-size: 1.35rem;
  }
</style>
