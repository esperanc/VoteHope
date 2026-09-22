<script lang="ts">
  import type { EmailMode, SessionDetail } from '../../../shared/session.ts';
  import { api, ApiError } from '../../lib/api.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { navigate } from '../../lib/router.svelte.ts';
  import Icon from '../Icon.svelte';

  let { quizId }: { quizId: number } = $props();

  const EMAILS: [EmailMode, MessageKey][] = [
    ['hidden', 'sessions.email.hidden'],
    ['optional', 'sessions.email.optional'],
    ['required', 'sessions.email.required'],
  ];

  let email = $state<EmailMode>('hidden');
  let busy = $state(false);
  let error = $state<MessageKey | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      const session = await api<SessionDetail>('POST', '/api/admin/sessions', { quizId, mode: 'sync', settings: { email } });
      navigate(`/admin/sessions/${session.id}/present`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'quiz_incomplete') error = 'sessions.quizIncomplete';
      else error = err instanceof ApiError && err.status === 0 ? 'error.network' : 'error.unexpected';
    } finally {
      busy = false;
    }
  }
</script>

<form class="stack" onsubmit={submit}>
  <div>
    <label for="live-email">{t('sessions.email')}</label>
    <select id="live-email" class="short" bind:value={email}>
      {#each EMAILS as [mode, label] (mode)}
        <option value={mode}>{t(label)}</option>
      {/each}
    </select>
  </div>
  {#if error}
    <p class="error" role="alert">{t(error)}</p>
  {/if}
  <div>
    <button type="submit" class="btn btn-primary" disabled={busy}>
      <Icon name="play" />
      {t('sessions.createLive')}
    </button>
  </div>
</form>

<style>
  .short {
    max-width: 12rem;
  }
</style>
