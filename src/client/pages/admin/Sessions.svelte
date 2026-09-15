<script lang="ts">
  import type { SessionSummary } from '../../../shared/session.ts';
  import AdminHeader from '../../components/AdminHeader.svelte';
  import SessionList from '../../components/sessions/SessionList.svelte';
  import { api } from '../../lib/api.ts';
  import { t } from '../../lib/i18n.svelte.ts';

  let sessions = $state<SessionSummary[] | null>(null);
  let failed = $state(false);

  async function load() {
    try {
      sessions = await api<SessionSummary[]>('GET', '/api/admin/sessions');
    } catch {
      failed = true;
    }
  }
  load();
</script>

<AdminHeader />

<main class="container stack">
  <h1>{t('sessions.title')}</h1>
  {#if failed}
    <p class="error">{t('error.network')}</p>
  {:else if !sessions}
    <p class="muted">{t('common.loading')}</p>
  {:else}
    <SessionList {sessions} />
  {/if}
</main>
