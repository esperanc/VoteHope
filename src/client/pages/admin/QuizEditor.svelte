<script lang="ts">
  import { onDestroy } from 'svelte';
  import { contentOf, duplicateQuestion, findIssues, LIMITS, newQuestion, type Quiz } from '../../../shared/quiz.ts';
  import AdminHeader from '../../components/AdminHeader.svelte';
  import Icon from '../../components/Icon.svelte';
  import QuestionView from '../../components/QuestionView.svelte';
  import QuestionEditor from '../../components/editor/QuestionEditor.svelte';
  import QuestionList from '../../components/editor/QuestionList.svelte';
  import SecondsInput from '../../components/editor/SecondsInput.svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { navigate } from '../../lib/router.svelte.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
  const SAVE_LABELS: Record<SaveState, MessageKey> = {
    saved: 'editor.saved',
    pending: 'editor.pending',
    saving: 'editor.saving',
    error: 'editor.saveError',
    conflict: 'editor.conflict',
  };

  let quiz = $state<Quiz | null>(null);
  let loadFailed = $state(false);
  let selectedId = $state<string | null>(null);
  let saveState = $state<SaveState>('saved');

  // Save bookkeeping; not shown on screen, so plain variables.
  let revision = 0;
  let savedJson = '';
  let conflicted = false;
  let destroyed = false;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const issues = $derived(quiz ? findIssues(quiz) : []);
  const incomplete = $derived(new Set(issues.flatMap((issue) => (issue.questionId ? [issue.questionId] : []))));
  const selectedIndex = $derived(quiz ? quiz.questions.findIndex((question) => question.id === selectedId) : -1);
  const selected = $derived(quiz && selectedIndex >= 0 ? quiz.questions[selectedIndex] : undefined);

  async function load() {
    try {
      const loaded = await api<Quiz>('GET', `/api/admin/quizzes/${params.id}`);
      revision = loaded.revision;
      savedJson = JSON.stringify(contentOf(loaded));
      selectedId = loaded.questions[0]?.id ?? null;
      quiz = loaded;
    } catch {
      loadFailed = true;
    }
  }
  load();

  const currentJson = () => JSON.stringify(contentOf(quiz!));

  // ---- Auto-save -------------------------------------------------------------
  // Any change schedules a save shortly after typing pauses. Saves carry the
  // revision they were based on; the server refuses them if the quiz was saved
  // from elsewhere in the meantime, so another window's edits are never lost.

  $effect(() => {
    if (!quiz || conflicted) return;
    if (currentJson() === savedJson) return;
    saveState = 'pending';
    schedule(800);
  });

  function schedule(delay: number) {
    if (destroyed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void save(), delay);
  }

  async function save(): Promise<void> {
    clearTimeout(timer);
    // One request at a time, so each save builds on the previous revision.
    while (inFlight) await inFlight;
    if (!quiz || conflicted) return;
    const json = currentJson();
    if (json === savedJson) {
      saveState = 'saved';
      return;
    }
    saveState = 'saving';
    inFlight = (async () => {
      try {
        const result = await api<{ revision: number }>('PUT', `/api/admin/quizzes/${quiz!.id}`, {
          revision,
          content: JSON.parse(json),
        });
        revision = result.revision;
        savedJson = json;
        if (currentJson() === savedJson) {
          saveState = 'saved';
        } else {
          saveState = 'pending';
          schedule(800);
        }
      } catch (err) {
        const status = err instanceof ApiError ? err.status : -1;
        if (status === 409) {
          conflicted = true;
          saveState = 'conflict';
        } else {
          saveState = 'error';
          // Connection trouble and server errors are retried; anything else
          // (e.g. the quiz was deleted meanwhile) would only fail again.
          if (status === 0 || status >= 500) schedule(5000);
        }
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
  }

  const hasUnsavedChanges = () => quiz !== null && !conflicted && currentJson() !== savedJson;

  function onbeforeunload(event: BeforeUnloadEvent) {
    if (!hasUnsavedChanges()) return;
    void save();
    event.preventDefault();
  }

  onDestroy(() => {
    destroyed = true;
    clearTimeout(timer);
    if (hasUnsavedChanges()) void save();
  });

  // ---- Question operations ---------------------------------------------------

  function addQuestion() {
    if (!quiz || quiz.questions.length >= LIMITS.questions) return;
    const question = newQuestion();
    quiz.questions.splice(selectedIndex >= 0 ? selectedIndex + 1 : quiz.questions.length, 0, question);
    selectedId = question.id;
  }

  function duplicateSelected() {
    if (!quiz || !selected || quiz.questions.length >= LIMITS.questions) return;
    const copy = duplicateQuestion($state.snapshot(selected));
    quiz.questions.splice(selectedIndex + 1, 0, copy);
    selectedId = copy.id;
  }

  function deleteSelected() {
    if (!quiz || !selected) return;
    const hasContent = selected.body.trim() !== '' || selected.options.some((option) => option.body.trim() !== '');
    if (hasContent && !confirm(t('editor.confirmDeleteQuestion', { n: selectedIndex + 1 }))) return;
    const index = selectedIndex;
    quiz.questions.splice(index, 1);
    selectedId = quiz.questions[Math.min(index, quiz.questions.length - 1)]?.id ?? null;
  }

  function moveSelected(delta: number) {
    if (!quiz) return;
    const to = selectedIndex + delta;
    if (selectedIndex < 0 || to < 0 || to >= quiz.questions.length) return;
    const [question] = quiz.questions.splice(selectedIndex, 1);
    quiz.questions.splice(to, 0, question!);
  }

  async function openPreview() {
    await save();
    navigate(`/admin/quizzes/${params.id}/preview`);
  }

  // A new quiz starts untitled: put the cursor in the title.
  function focusIfUntitled(input: HTMLInputElement) {
    if (!input.value) input.focus();
  }
</script>

<svelte:window {onbeforeunload} />

<AdminHeader />

{#if loadFailed}
  <main class="container stack">
    <p class="error">{t('editor.loadFailed')}</p>
    <a href="/admin">{t('admin.quizzes')}</a>
  </main>
{:else if !quiz}
  <p class="container muted">{t('common.loading')}</p>
{:else}
  <div class="bar">
    <a class="icon-btn" href="/admin" title={t('admin.quizzes')} aria-label={t('admin.quizzes')}>
      <Icon name="arrowLeft" />
    </a>
    <input
      use:focusIfUntitled
      class="title"
      bind:value={quiz.title}
      maxlength={LIMITS.titleLength}
      placeholder={t('editor.titlePlaceholder')}
      aria-label={t('editor.titlePlaceholder')}
    />
    <span class="save-state" data-state={saveState} aria-live="polite">{t(SAVE_LABELS[saveState])}</span>
    {#if saveState === 'conflict'}
      <button type="button" class="btn" onclick={() => location.reload()}>{t('editor.reload')}</button>
    {/if}
    <button type="button" class="btn" onclick={openPreview}>
      <Icon name="eye" />
      {t('editor.preview')}
    </button>
    <button
      type="button"
      class="btn btn-primary"
      onclick={async () => {
        await save();
        navigate(`/admin/quizzes/${params.id}/sessions`);
      }}
    >
      <Icon name="play" />
      {t('editor.run')}
    </button>
    <a class="btn" href={`/api/admin/quizzes/${quiz.id}/export`} download>
      <Icon name="download" />
      {t('dashboard.export')}
    </a>
  </div>

  <div class="layout">
    <aside class="sidebar">
      <details class="card settings">
        <summary>{t('editor.settings')}</summary>
        <div class="stack">
          <div>
            <label for="default-time">{t('editor.defaultTimeLimit')}</label>
            <SecondsInput
              id="default-time"
              value={quiz.defaultTimeLimitS}
              onchange={(seconds) => (quiz!.defaultTimeLimitS = seconds ?? LIMITS.defaultTimeLimitS)}
            />
          </div>
          <div>
            <label for="description">{t('editor.description')}</label>
            <textarea id="description" rows="3" maxlength={LIMITS.descriptionLength} bind:value={quiz.description}></textarea>
          </div>
        </div>
      </details>
      <QuestionList bind:questions={quiz.questions} bind:selectedId {incomplete} onadd={addQuestion} />
    </aside>

    <div class="main">
      {#if selected}
        {#key selectedId}
          <QuestionEditor
            bind:question={() => quiz!.questions[selectedIndex]!, (question) => (quiz!.questions[selectedIndex] = question)}
            index={selectedIndex}
            total={quiz.questions.length}
            defaultTimeLimitS={quiz.defaultTimeLimitS}
            issues={issues.filter((issue) => issue.questionId === selectedId)}
            onmove={moveSelected}
            onduplicate={duplicateSelected}
            ondelete={deleteSelected}
          />
        {/key}
      {:else}
        <div class="card empty">
          <p class="muted">{t('editor.noQuestionSelected')}</p>
          <button type="button" class="btn btn-primary" onclick={addQuestion}>
            <Icon name="plus" />
            {t('editor.addQuestion')}
          </button>
        </div>
      {/if}
    </div>

    {#if selected}
      <aside class="preview" aria-label={t('editor.studentView')}>
        <h2 class="preview-label">{t('editor.studentView')}</h2>
        <div class="phone">
          <div class="phone-top">
            <span>{t('preview.questionOf', { n: selectedIndex + 1, total: quiz.questions.length })}</span>
            <span>{t('preview.seconds', { seconds: selected.timeLimitS ?? quiz.defaultTimeLimitS })}</span>
          </div>
          {#key selectedId}
            <QuestionView question={selected} />
          {/key}
        </div>
      </aside>
    {/if}
  </div>
{/if}

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1.25rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .title {
    flex: 1 1 14rem;
    width: auto;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    font-size: 1.2rem;
    font-weight: 700;
    background: transparent;
    border-color: transparent;
  }

  .title:hover,
  .title:focus {
    background: var(--surface);
    border-color: var(--border);
  }

  .save-state {
    font-size: 0.85rem;
    white-space: nowrap;
    color: var(--muted);
  }

  .save-state[data-state='error'],
  .save-state[data-state='conflict'] {
    color: var(--danger);
  }

  .layout {
    display: grid;
    grid-template-columns: 16.5rem minmax(0, 1fr) 22rem;
    align-items: start;
    gap: 1.25rem;
    max-width: 1500px;
    margin: 0 auto;
    padding: 1.25rem;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .settings {
    padding: 0.8rem 1rem;
  }

  .settings summary {
    font-weight: 600;
    cursor: pointer;
  }

  .settings .stack {
    margin-top: 0.9rem;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .preview {
    position: sticky;
    top: 4.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .preview-label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
    color: var(--muted);
  }

  @media (max-width: 1180px) {
    .layout {
      grid-template-columns: 15rem minmax(0, 1fr);
    }

    .preview {
      grid-column: 2;
      position: static;
    }
  }

  @media (max-width: 760px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.9rem;
    }

    .preview {
      grid-column: auto;
    }
  }
</style>
