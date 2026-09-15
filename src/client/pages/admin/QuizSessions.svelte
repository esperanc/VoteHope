<script lang="ts">
  import { countIncompleteQuestions, type Quiz } from '../../../shared/quiz.ts';
  import type { SessionSummary } from '../../../shared/session.ts';
  import AdminHeader from '../../components/AdminHeader.svelte';
  import Icon from '../../components/Icon.svelte';
  import SessionForm from '../../components/sessions/SessionForm.svelte';
  import SessionList from '../../components/sessions/SessionList.svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { t, tn, type MessageKey } from '../../lib/i18n.svelte.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  let quiz = $state<Quiz | null>(null);
  let sessions = $state<SessionSummary[] | null>(null);
  let error = $state<MessageKey | null>(null);

  const incomplete = $derived(quiz ? countIncompleteQuestions(quiz) : 0);

  async function load() {
    try {
      const [loadedQuiz, loadedSessions] = await Promise.all([
        api<Quiz>('GET', `/api/admin/quizzes/${params.id}`),
        api<SessionSummary[]>('GET', `/api/admin/sessions?quizId=${params.id}`),
      ]);
      quiz = loadedQuiz;
      sessions = loadedSessions;
    } catch (err) {
      error = err instanceof ApiError && err.status === 404 ? 'editor.loadFailed' : 'error.network';
    }
  }
  load();
</script>

<AdminHeader />

<main class="container stack">
  <a class="back" href={`/admin/quizzes/${params.id}`}>
    <Icon name="arrowLeft" size={16} />
    {t('sessions.backToEditor')}
  </a>

  {#if error}
    <p class="error">{t(error)}</p>
  {:else if !quiz}
    <p class="muted">{t('common.loading')}</p>
  {:else}
    <h1>{t('sessions.runTitle', { title: quiz.title.trim() || t('quiz.untitled') })}</h1>

    {#if quiz.questions.length === 0 || incomplete > 0}
      <p class="card notice-warn">
        {quiz.questions.length === 0 ? t('issue.noQuestions') : tn('sessions.incomplete', incomplete)}
      </p>
    {:else}
      <section class="card stack">
        <div>
          <h2>{t('sessions.new')}</h2>
          <p class="muted small">{t('sessions.newHint')}</p>
        </div>
        <SessionForm quizId={quiz.id} />
      </section>
    {/if}

    <h2>{t('sessions.ofThisQuiz')}</h2>
    {#if sessions}
      <SessionList {sessions} />
    {/if}
  {/if}
</main>
