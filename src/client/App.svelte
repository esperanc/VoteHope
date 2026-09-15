<script lang="ts">
  import { navigate, router } from './lib/router.svelte.ts';
  import { auth, refreshAuth } from './lib/auth.svelte.ts';
  import { t } from './lib/i18n.svelte.ts';
  import { matchRoute } from './routes.ts';

  const match = $derived(matchRoute(router.path));
  const waitingForLogin = $derived(match.route.admin === true && auth.status !== 'in');

  $effect(() => {
    if (!match.route.admin) return;
    if (auth.status === 'unknown') {
      refreshAuth();
    } else if (auth.status === 'out') {
      const next = encodeURIComponent(router.path + router.search);
      navigate(`/admin/login?next=${next}`, true);
    }
  });
</script>

{#if waitingForLogin}
  <p class="container muted">{t('common.loading')}</p>
{:else}
  {#await match.route.load() then page}
    {@const Page = page.default}
    <Page params={match.params} />
  {:catch}
    <p class="container error">{t('error.loadFailed')}</p>
  {/await}
{/if}
