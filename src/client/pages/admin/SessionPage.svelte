<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { AsyncSettings, SessionResults } from '../../../shared/session.ts';
  import AdminHeader from '../../components/AdminHeader.svelte';
  import Icon from '../../components/Icon.svelte';
  import ResultsView from '../../components/sessions/ResultsView.svelte';
  import SessionSettings from '../../components/sessions/SessionSettings.svelte';
  import SharePanel from '../../components/sessions/SharePanel.svelte';
  import StateBadge from '../../components/sessions/StateBadge.svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { formatDateTime, formatTime, t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { navigate } from '../../lib/router.svelte.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  let results = $state<SessionResults | null>(null);
  let loadError = $state<MessageKey | null>(null);
  let actionError = $state<MessageKey | null>(null);
  let updatedAt = $state<Date | null>(null);
  let busy = $state(false);

  const session = $derived(results?.session);
  const backUrl = $derived(session?.quizId ? `/admin/quizzes/${session.quizId}/sessions` : '/admin/sessions');

  async function load() {
    try {
      results = await api<SessionResults>('GET', `/api/admin/sessions/${params.id}/results`);
      updatedAt = new Date();
    } catch (err) {
      if (!results) loadError = err instanceof ApiError && err.status === 404 ? 'sessions.notFound' : 'error.network';
    }
  }
  load();

  // Answers keep arriving in self-paced sessions: refresh while the page is visible.
  const refresher = setInterval(() => {
    if (document.visibilityState === 'visible' && !busy) void load();
  }, 10_000);
  onDestroy(() => clearInterval(refresher));

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    busy = true;
    actionError = null;
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      actionError = err instanceof ApiError && err.status === 0 ? 'error.network' : 'error.unexpected';
      return false;
    } finally {
      busy = false;
    }
  }

  const patch = (changes: object) => run(() => api('PATCH', `/api/admin/sessions/${params.id}`, changes));

  function saveSettings(changes: Partial<Pick<AsyncSettings, 'opensAt' | 'closesAt' | 'showScore'>>) {
    return patch(changes);
  }

  function toggleClosed() {
    if (!session) return;
    if (session.state === 'closed') {
      // A closing time already in the past would close it again at once.
      const { closesAt } = session.settings;
      const passed = closesAt !== null && Date.parse(closesAt) <= Date.now();
      void patch({ closed: false, ...(passed ? { closesAt: null } : {}) });
    } else if (confirm(t('sessions.confirmClose'))) {
      void patch({ closed: true });
    }
  }

  async function deleteSession() {
    if (!confirm(t('sessions.confirmDelete'))) return;
    const back = backUrl;
    if (await run(() => api('DELETE', `/api/admin/sessions/${params.id}`))) navigate(back);
  }

  function deleteAttempt(participantId: number, name: string) {
    if (!confirm(t('results.confirmDeleteAttempt', { name }))) return;
    void run(() => api('DELETE', `/api/admin/sessions/${params.id}/participants/${participantId}`));
  }
</script>

<AdminHeader />

<main class="container stack">
  {#if loadError}
    <p class="error">{t(loadError)}</p>
    <a href="/admin/sessions">{t('sessions.allSessions')}</a>
  {:else if !results || !session}
    <p class="muted">{t('common.loading')}</p>
  {:else}
    <a class="back" href={backUrl}>
      <Icon name="arrowLeft" size={16} />
      {session.quizId ? t('sessions.ofThisQuiz') : t('sessions.allSessions')}
    </a>

    <div class="page-head">
      <div class="title">
        <h1>{session.title.trim() || t('quiz.untitled')}</h1>
        <p class="meta">
          <StateBadge state={session.state} />
          <span>{t('sessions.selfPaced')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('sessions.created', { date: formatDateTime(session.createdAt) })}</span>
        </p>
      </div>
      <div class="actions">
        <button type="button" class="btn" disabled={busy} onclick={toggleClosed}>
          {session.state === 'closed' ? t('sessions.reopen') : t('sessions.close')}
        </button>
        <button type="button" class="icon-btn danger" disabled={busy} title={t('sessions.delete')} aria-label={t('sessions.delete')} onclick={deleteSession}>
          <Icon name="trash" />
        </button>
      </div>
    </div>

    {#if actionError}
      <p class="error" role="alert">{t(actionError)}</p>
    {/if}

    <div class="top" class:single={session.state === 'closed'}>
      {#if session.state !== 'closed'}
        <SharePanel {session} />
      {/if}
      <SessionSettings {session} onsave={saveSettings} />
    </div>

    <ResultsView {results} ondelete={deleteAttempt} />

    {#if updatedAt}
      <p class="muted small">{t('sessions.lastUpdated', { time: formatTime(updatedAt) })}</p>
    {/if}
  {/if}
</main>

<style>
  .title h1 {
    margin-bottom: 0.4rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .top {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    align-items: start;
    gap: 1rem;
  }

  .top.single {
    grid-template-columns: minmax(0, 1fr);
    max-width: 36rem;
  }

  @media (max-width: 860px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
