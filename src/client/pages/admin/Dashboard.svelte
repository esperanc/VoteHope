<script lang="ts">
  import { LIMITS, newQuestion, type Quiz, type QuizSummary } from '../../../shared/quiz.ts';
  import AdminHeader from '../../components/AdminHeader.svelte';
  import Icon from '../../components/Icon.svelte';
  import { api, ApiError, upload } from '../../lib/api.ts';
  import { formatDateTime, t, tn, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { navigate } from '../../lib/router.svelte.ts';

  let quizzes = $state<QuizSummary[] | null>(null);
  let error = $state<MessageKey | null>(null);
  let busy = $state(false);
  let importInput: HTMLInputElement;

  const titleOf = (quiz: { title: string }) => quiz.title.trim() || t('quiz.untitled');

  async function run(action: () => Promise<void>, errorFor?: (status: number) => MessageKey) {
    busy = true;
    error = null;
    try {
      await action();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : -1;
      error = status === 0 ? 'error.network' : (errorFor?.(status) ?? 'error.unexpected');
    } finally {
      busy = false;
    }
  }

  async function load() {
    quizzes = await api<QuizSummary[]>('GET', '/api/admin/quizzes');
  }
  run(load);

  function createQuiz() {
    run(async () => {
      // Starts untitled; the editor focuses the empty title field.
      const quiz = await api<Quiz>('POST', '/api/admin/quizzes', {
        title: '',
        description: '',
        defaultTimeLimitS: LIMITS.defaultTimeLimitS,
        questions: [newQuestion()],
      });
      navigate(`/admin/quizzes/${quiz.id}`);
    });
  }

  function duplicate(quiz: QuizSummary) {
    run(async () => {
      const title = t('dashboard.copyOf', { title: titleOf(quiz) }).slice(0, LIMITS.titleLength);
      await api('POST', `/api/admin/quizzes/${quiz.id}/duplicate`, { title });
      await load();
    });
  }

  function remove(quiz: QuizSummary) {
    if (!confirm(t('dashboard.confirmDelete', { title: titleOf(quiz) }))) return;
    run(async () => {
      await api('DELETE', `/api/admin/quizzes/${quiz.id}`);
      await load();
    });
  }

  function importFile() {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    run(
      async () => {
        const quiz = await upload<Quiz>('/api/admin/quizzes/import', file);
        navigate(`/admin/quizzes/${quiz.id}`);
      },
      (status) => (status === 413 ? 'dashboard.importTooLarge' : 'dashboard.importFailed'),
    );
  }
</script>

<AdminHeader />

<main class="container stack">
  <div class="page-head">
    <h1>{t('admin.quizzes')}</h1>
    <div class="actions">
      <button type="button" class="btn" disabled={busy} onclick={() => importInput.click()}>
        <Icon name="upload" />
        {t('dashboard.import')}
      </button>
      <button type="button" class="btn btn-primary" disabled={busy} onclick={createQuiz}>
        <Icon name="plus" />
        {t('dashboard.newQuiz')}
      </button>
      <input type="file" accept=".zip,.json,application/zip,application/json" hidden bind:this={importInput} onchange={importFile} />
    </div>
  </div>

  {#if error}
    <p class="error" role="alert">{t(error)}</p>
  {/if}

  {#if quizzes === null}
    {#if !error}<p class="muted">{t('common.loading')}</p>{/if}
  {:else if quizzes.length === 0}
    <div class="card">
      <p class="muted">{t('admin.noQuizzes')}</p>
    </div>
  {:else}
    <ul class="quizzes">
      {#each quizzes as quiz (quiz.id)}
        {@const name = titleOf(quiz)}
        <li class="card quiz">
          <a class="open" href={`/admin/quizzes/${quiz.id}`}>
            <span class="name">{name}</span>
            <span class="meta">
              {#if quiz.questionCount === 0}
                <span class="status warn">{t('dashboard.empty')}</span>
              {:else}
                <span>{tn('dashboard.questions', quiz.questionCount)}</span>
                <span aria-hidden="true">·</span>
                {#if quiz.incompleteCount > 0}
                  <span class="status warn">{tn('dashboard.incomplete', quiz.incompleteCount)}</span>
                {:else}
                  <span class="status ok">{t('dashboard.ready')}</span>
                {/if}
              {/if}
              <span aria-hidden="true">·</span>
              <span>{t('dashboard.edited', { date: formatDateTime(quiz.updatedAt) })}</span>
            </span>
          </a>
          <div class="row-actions">
            <button type="button" class="icon-btn" disabled={busy} title={t('dashboard.duplicate')} aria-label={`${t('dashboard.duplicate')}: ${name}`} onclick={() => duplicate(quiz)}>
              <Icon name="copy" />
            </button>
            <a class="icon-btn" href={`/api/admin/quizzes/${quiz.id}/export`} download title={t('dashboard.export')} aria-label={`${t('dashboard.export')}: ${name}`}>
              <Icon name="download" />
            </a>
            <button type="button" class="icon-btn danger" disabled={busy} title={t('dashboard.delete')} aria-label={`${t('dashboard.delete')}: ${name}`} onclick={() => remove(quiz)}>
              <Icon name="trash" />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .quizzes {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .quiz {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 0.8rem 0.9rem 1.2rem;
  }

  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    color: inherit;
    text-decoration: none;
  }

  .name {
    overflow: hidden;
    font-size: 1.05rem;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .open:hover .name {
    color: var(--accent);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.45rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .status {
    font-weight: 600;
  }

  .ok {
    color: var(--success);
  }

  .warn {
    color: var(--warning);
  }

  .row-actions {
    display: flex;
    flex: none;
  }
</style>
