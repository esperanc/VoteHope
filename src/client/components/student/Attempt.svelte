<script lang="ts">
  // Answering a quiz. Choices show at once and are saved in the background; the
  // server's clock decides when time is up, this screen only counts down.
  import { onDestroy, untrack } from 'svelte';
  import { GRACE_MS, type PlayState } from '../../../shared/session.ts';
  import { ApiError } from '../../lib/api.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { playApi } from '../../lib/play.ts';
  import { snippet } from '../../lib/text.ts';
  import Icon from '../Icon.svelte';
  import QuestionView from '../QuestionView.svelte';
  import Countdown from './Countdown.svelte';

  let {
    play,
    offset,
    code,
    onstate,
  }: { play: PlayState; offset: number; code: string; onstate: (next: PlayState) => void } = $props();

  type SaveStatus = 'saving' | 'saved' | 'error';

  const perQuestion = $derived(play.info.timerMode === 'perQuestion');
  const questions = $derived(play.questions);

  let answers = $state<Record<string, string[]>>(untrack(() => ({ ...play.answers })));
  let saveStatus = $state<Record<string, SaveStatus>>({});
  /** Shown question when moving freely; questions.length means the review screen. */
  let position = $state(0);
  let timeUp = $state(false);
  let busy = $state(false);
  let error = $state<MessageKey | null>(null);
  let destroyed = false;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<string, Promise<void>>();

  const current = $derived(perQuestion ? questions[0] : questions[position]);
  const isAnswered = (questionId: string) => (answers[questionId]?.length ?? 0) > 0;
  const answeredCount = $derived(questions.filter((question) => isAnswered(question.id)).length);

  function choose(questionId: string, optionIds: string[]) {
    answers[questionId] = optionIds;
    saveStatus[questionId] = 'saving';
    clearTimeout(timers.get(questionId));
    timers.set(questionId, setTimeout(() => void save(questionId), 400));
  }

  async function save(questionId: string): Promise<void> {
    timers.delete(questionId);
    await inFlight.get(questionId); // saves of one question go out in order
    const optionIds = $state.snapshot(answers[questionId] ?? []);
    const request = (async () => {
      try {
        await playApi('PUT', code, `/answers/${questionId}`, { optionIds });
        if (!timers.has(questionId)) saveStatus[questionId] = 'saved';
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 0 || status >= 500) {
          saveStatus[questionId] = 'error';
          if (!destroyed) timers.set(questionId, setTimeout(() => void save(questionId), 3000));
        } else {
          // Time is up or the attempt ended: the server says what comes next.
          await refresh();
        }
      }
    })();
    inFlight.set(questionId, request);
    await request;
    if (inFlight.get(questionId) === request) inFlight.delete(questionId);
  }

  /** Sends every answer still waiting to be saved. */
  async function flush(): Promise<void> {
    const waiting = [...timers.keys()];
    for (const id of waiting) clearTimeout(timers.get(id));
    await Promise.all([...waiting.map((id) => save(id)), ...inFlight.values()]);
  }

  async function refresh() {
    try {
      onstate(await playApi('GET', code));
    } catch {
      // Keep the current screen; the next action tries again.
    }
  }

  async function next() {
    busy = true;
    error = null;
    try {
      await flush();
      const updated = await playApi('POST', code, '/next', { from: play.index });
      timeUp = false;
      onstate(updated);
    } catch {
      error = 'error.network';
    } finally {
      busy = false;
    }
  }

  async function submit() {
    busy = true;
    error = null;
    try {
      await flush();
      onstate(await playApi('POST', code, '/submit'));
    } catch (err) {
      error = err instanceof ApiError && err.status !== 0 ? 'error.unexpected' : 'error.network';
    } finally {
      busy = false;
    }
  }

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function expired() {
    timeUp = true;
    await flush();
    if (perQuestion) {
      await wait(1500); // let the student read "Time is up"
      await next();
    } else {
      await wait(GRACE_MS + 500); // after the server's allowance it reports the attempt as finished
      await refresh();
    }
  }

  function go(index: number) {
    position = index;
    window.scrollTo(0, 0);
  }

  function saveLabel(questionId: string): string {
    const status = saveStatus[questionId];
    if (status === 'saving') return t('student.saving');
    if (status === 'saved') return t('student.saved');
    if (status === 'error') return t('student.saveRetry');
    return '';
  }

  // A phone that slept may have missed the end of a question or of the quiz.
  function onvisibilitychange() {
    if (document.visibilityState === 'visible') void refresh();
  }

  onDestroy(() => {
    destroyed = true;
    for (const [id, timer] of timers) {
      clearTimeout(timer);
      void save(id);
    }
  });
</script>

<svelte:document {onvisibilitychange} />

<div class="attempt">
  <div class="status">
    <span>
      {#if current}
        {t('student.questionOf', { n: (perQuestion ? play.index : position) + 1, total: play.questionCount })}
      {:else}
        {t('student.review')}
      {/if}
    </span>
    {#if play.deadline !== null}
      {#key play.deadline}
        <Countdown deadline={play.deadline} {offset} onexpire={expired} />
      {/key}
    {/if}
  </div>

  {#if timeUp}
    <p class="time-up" role="alert"><Icon name="clock" /> {t('student.timeUp')}</p>
  {/if}

  {#if current}
    {@const question = current}
    {#key question.id}
      <div class="card">
        <QuestionView
          {question}
          bind:selected={() => answers[question.id] ?? [], (optionIds) => choose(question.id, optionIds)}
          disabled={timeUp}
        />
      </div>
    {/key}
    <p class="save-state" aria-live="polite">{saveLabel(question.id)}</p>

    {#if perQuestion}
      <button type="button" class="btn btn-primary btn-block big" disabled={busy || timeUp} onclick={next}>
        {play.index === play.questionCount - 1 ? t('student.finish') : t('student.next')}
      </button>
      <p class="muted small center">{t('student.noGoingBack')}</p>
    {:else}
      <div class="steps">
        <button type="button" class="btn big" disabled={position === 0} onclick={() => go(position - 1)}>
          <Icon name="arrowLeft" size={16} />
          {t('student.previous')}
        </button>
        <button type="button" class="btn btn-primary big" onclick={() => go(position + 1)}>
          {position === questions.length - 1 ? t('student.reviewAnswers') : t('student.next')}
        </button>
      </div>
      <nav class="dots" aria-label={t('student.review')}>
        {#each questions as q, i (q.id)}
          <button
            type="button"
            class:answered={isAnswered(q.id)}
            aria-current={i === position ? 'step' : undefined}
            aria-label={t('student.goTo', { n: i + 1 })}
            onclick={() => go(i)}
          >
            {i + 1}
          </button>
        {/each}
      </nav>
    {/if}
  {:else}
    <div class="card stack">
      <h2>{t('student.reviewTitle')}</h2>
      <p>{t('student.answeredOf', { answered: answeredCount, total: questions.length })}</p>
      <ol class="review">
        {#each questions as q, i (q.id)}
          <li>
            <button type="button" onclick={() => go(i)}>
              <span class="n">{i + 1}</span>
              <span class="text">{snippet(q.body, t('editor.imageOnly')) || '…'}</span>
              <span class="answer-state" class:missing={!isAnswered(q.id)}>
                {isAnswered(q.id) ? t('student.answered') : t('student.notAnswered')}
              </span>
            </button>
          </li>
        {/each}
      </ol>
      <p class="muted small">{t('student.submitWarning')}</p>
      <button type="button" class="btn btn-primary btn-block big" disabled={busy || timeUp} onclick={submit}>
        {t('student.submit')}
      </button>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">{t(error)}</p>
  {/if}
</div>

<style>
  .attempt {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .status {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--bg);
  }

  .time-up {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    font-weight: 700;
    color: var(--danger);
    background: var(--danger-bg);
    border-radius: 8px;
  }

  .save-state {
    min-height: 1.2em;
    margin-top: -0.4rem;
    font-size: 0.8rem;
    text-align: right;
    color: var(--muted);
  }

  .steps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  .center {
    text-align: center;
  }

  .dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem;
  }

  .dots button {
    width: 2.2rem;
    height: 2.2rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 50%;
    cursor: pointer;
  }

  .dots button.answered {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .dots button[aria-current='step'] {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }

  .review {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .review button {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.55rem 0.6rem;
    font: inherit;
    text-align: left;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }

  .n {
    font-weight: 700;
    color: var(--muted);
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .answer-state {
    flex: none;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--success);
  }

  .answer-state.missing {
    color: var(--warning);
  }
</style>
