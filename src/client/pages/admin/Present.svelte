<script lang="ts">
  // The presenter's screen for a live session, meant for the projector: big type,
  // the join code always visible, and one main button (also on → / Page Down, so a
  // presentation clicker drives it).
  import { onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import type { LiveAck, LivePresenterView } from '../../../shared/live.ts';
  import type { SessionDetail } from '../../../shared/session.ts';
  import Icon from '../../components/Icon.svelte';
  import LanguageSwitch from '../../components/LanguageSwitch.svelte';
  import Markdown from '../../components/Markdown.svelte';
  import AnswerBars from '../../components/sessions/AnswerBars.svelte';
  import Countdown from '../../components/student/Countdown.svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { auth } from '../../lib/auth.svelte.ts';
  import { formatCode } from '../../lib/format.ts';
  import { t, tn, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { connectLive, measureOffset } from '../../lib/live.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  let session = $state<SessionDetail | null>(null);
  let view = $state<LivePresenterView | null>(null);
  let connected = $state(false);
  let offset = $state(0);
  let busy = $state(false);
  let error = $state<MessageKey | null>(null);
  let socket: Socket | undefined;
  let measured = false;

  const shortUrl = $derived(session ? session.joinUrl.replace(/^https?:\/\//, '') : '');
  const lastQuestion = $derived(view !== null && view.questionIndex >= view.questionCount - 1);
  const everyoneAnswered = $derived(
    view !== null && view.participants.length > 0 && view.answeredCount >= view.participants.length,
  );

  onMount(() => {
    void connect();
    return () => socket?.disconnect();
  });

  async function connect() {
    try {
      session = await api<SessionDetail>('GET', `/api/admin/sessions/${params.id}`);
    } catch (err) {
      error = err instanceof ApiError && err.status === 404 ? 'sessions.notFound' : 'error.network';
      return;
    }
    const s = connectLive({ role: 'presenter', sessionId: Number(params.id) });
    socket = s;
    s.on('connect', async () => {
      connected = true;
      try {
        offset = await measureOffset(s);
        measured = true;
      } catch {
        // Keep the estimate from the last state message.
      }
    });
    s.on('disconnect', () => (connected = false));
    s.on('connect_error', (err) => {
      if (err.message === 'unauthorized') {
        s.disconnect();
        auth.status = 'out'; // login expired: back to the login page
      } else if (err.message === 'not_found') {
        s.disconnect();
        error = 'sessions.notFound';
      }
    });
    s.on('state', (next: LivePresenterView) => {
      if (!measured) offset = next.serverNow - Date.now();
      view = next;
    });
  }

  async function send(action: 'start' | 'close' | 'next' | 'end') {
    if (!socket || busy) return;
    busy = true;
    error = null;
    try {
      const result: LiveAck = await socket.timeout(5000).emitWithAck(action);
      if ('error' in result && result.error !== 'wrong_phase') error = 'present.failed';
    } catch {
      error = 'error.network';
    } finally {
      busy = false;
    }
  }

  function primaryAction() {
    if (view?.phase === 'lobby') void send('start');
    else if (view?.phase === 'open') void send('close');
    else if (view?.phase === 'closed') void send('next');
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'PageDown') return;
    event.preventDefault();
    primaryAction();
  }

  function endQuiz() {
    if (confirm(t('present.confirmEnd'))) void send('end');
  }

  async function remove(participantId: number, name: string) {
    if (!confirm(t('present.confirmRemove', { name }))) return;
    try {
      await api('DELETE', `/api/admin/sessions/${params.id}/participants/${participantId}`);
    } catch {
      error = 'error.unexpected';
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="present">
  <header class="bar">
    <a class="back" href={`/admin/sessions/${params.id}`}>
      <Icon name="arrowLeft" size={16} />
      {t('present.back')}
    </a>
    <span class="title">{session?.title.trim() || t('quiz.untitled')}</span>
    {#if session && view && (view.phase === 'open' || view.phase === 'closed')}
      <span class="join-hint">{t('present.joinAt', { url: shortUrl })}</span>
    {/if}
    <LanguageSwitch />
    {#if view && view.phase !== 'finished'}
      <button type="button" class="btn" disabled={busy} onclick={endQuiz}>{t('present.end')}</button>
    {/if}
  </header>

  {#if view && !connected}
    <p class="banner" role="status">{t('present.reconnecting')}</p>
  {/if}
  {#if error}
    <p class="error center" role="alert">{t(error)}</p>
  {/if}

  <main>
    {#if !view || !session}
      {#if !error}<p class="muted">{t('common.loading')}</p>{/if}
    {:else if view.phase === 'lobby'}
      <section class="lobby">
        <div class="join-box">
          <img src={`/api/admin/sessions/${session.id}/qr.svg`} alt={t('share.qrAlt')} />
          <p class="join-url">{shortUrl}</p>
          <p class="big-code">{formatCode(session.code)}</p>
        </div>
        <div class="people">
          <h2>{tn('sessions.participants', view.participants.length)}</h2>
          {#if view.participants.length === 0}
            <p class="muted">{t('present.waitingStudents')}</p>
          {:else}
            <ul class="chips">
              {#each view.participants as participant (participant.id)}
                <li class:offline={!participant.online} title={participant.online ? undefined : t('present.offline')}>
                  {participant.name}
                  <button
                    type="button"
                    class="chip-x"
                    title={t('present.remove', { name: participant.name })}
                    aria-label={t('present.remove', { name: participant.name })}
                    onclick={() => remove(participant.id, participant.name)}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          <div>
            <button type="button" class="btn btn-primary huge" disabled={busy} onclick={() => send('start')}>
              <Icon name="play" />
              {t('present.start')}
            </button>
          </div>
          <p class="muted small">{t('present.keysHint')}</p>
        </div>
      </section>
    {:else if view.phase === 'open' || view.phase === 'closed'}
      <section class="question-screen">
        <div class="q-top">
          <span>{t('student.questionOf', { n: view.questionIndex + 1, total: view.questionCount })}</span>
          {#if view.phase === 'open' && view.deadline !== null}
            <span class="timer">
              {#key view.deadline}
                <Countdown deadline={view.deadline} {offset} />
              {/key}
            </span>
          {/if}
          <span class="answered" class:all={everyoneAnswered}>
            {t('present.answered', { count: view.answeredCount, total: view.participants.length })}
          </span>
        </div>

        {#if view.question}
          <!-- Once closed the question shrinks, leaving room for the chart. -->
          <div class="q-body" class:compact={view.phase === 'closed'}><Markdown source={view.question.body} /></div>
          {#if view.phase === 'open'}
            <ul class="q-options">
              {#each view.question.options as option (option.id)}
                <li><Markdown source={option.body} /></li>
              {/each}
            </ul>
          {:else}
            <p class="muted responses">{tn('results.responses', view.answeredCount)}</p>
            <AnswerBars
              options={view.question.options}
              counts={view.counts ?? {}}
              responses={view.answeredCount}
              letters={false}
              large
            />
          {/if}
        {/if}

        <div class="controls">
          {#if view.phase === 'open'}
            <button type="button" class="btn huge" disabled={busy} onclick={() => send('close')}>{t('present.closeNow')}</button>
          {:else}
            <button type="button" class="btn btn-primary huge" disabled={busy} onclick={() => send('next')}>
              {lastQuestion ? t('present.finish') : t('present.next')}
            </button>
          {/if}
        </div>
      </section>
    {:else}
      <section class="done">
        <span class="check" aria-hidden="true"><Icon name="check" size={40} /></span>
        <h1>{t('present.finished')}</h1>
        <p class="muted">{tn('present.tookPart', view.participants.length)}</p>
        <a class="btn btn-primary huge" href={`/admin/sessions/${params.id}`}>{t('present.seeResults')}</a>
      </section>
    {/if}
  </main>
</div>

<style>
  .present {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.25rem;
    padding: 0.6rem 1.25rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .join-hint {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .banner {
    padding: 0.5rem;
    font-weight: 600;
    text-align: center;
    color: var(--warning);
    background: var(--warning-bg);
  }

  .center {
    margin: 1rem auto 0;
    width: fit-content;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .huge {
    padding: 0.95rem 1.8rem;
    font-size: 1.3rem;
  }

  /* ---- Lobby ---- */

  .lobby {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    gap: 2.5rem;
  }

  .join-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    color: #101417;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 16px;
  }

  .join-box img {
    width: min(100%, 380px);
    aspect-ratio: 1;
  }

  .join-url {
    font-size: clamp(1.1rem, 2vw, 1.5rem);
    font-weight: 600;
    text-align: center;
    word-break: break-all;
  }

  .big-code {
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.08em;
  }

  .people {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .people h2 {
    font-size: 1.7rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chips li {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.3rem 0.35rem 0.3rem 0.85rem;
    font-size: 1.1rem;
    font-weight: 600;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
  }

  .chips li.offline {
    color: var(--muted);
    border-style: dashed;
  }

  .chip-x {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }

  .chip-x:hover {
    color: var(--danger);
    background: var(--hover);
  }

  /* ---- Question ---- */

  .question-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .q-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.5rem;
    margin-bottom: 1.5rem;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--muted);
  }

  .timer :global(.countdown) {
    padding: 0.3rem 0.9rem;
    font-size: 1.7rem;
  }

  .answered {
    margin-left: auto;
  }

  .answered.all {
    color: var(--success);
  }

  .q-body {
    margin-bottom: 1.75rem;
    font-size: clamp(1.5rem, 2.6vw, 2.4rem);
    line-height: 1.35;
  }

  .q-body :global(img) {
    max-height: 42vh;
  }

  .q-body.compact {
    margin-bottom: 1rem;
    font-size: clamp(1.15rem, 1.8vw, 1.6rem);
  }

  .q-body.compact :global(img) {
    max-height: 20vh;
  }

  .q-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .q-options li {
    padding: 1.1rem 1.4rem;
    font-size: clamp(1.2rem, 2vw, 1.8rem);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 14px;
  }

  .responses {
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  /* Always reachable, even when a long question and its chart need scrolling. */
  .controls {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: auto;
    padding: 1.5rem 0 1rem;
    background: linear-gradient(to bottom, transparent, var(--bg) 35%);
  }

  /* ---- Finished ---- */

  .done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin: auto;
    text-align: center;
  }

  .done h1 {
    font-size: 3rem;
  }

  .check {
    display: grid;
    place-items: center;
    width: 5rem;
    height: 5rem;
    color: var(--accent-text);
    background: var(--accent);
    border-radius: 50%;
  }

  @media (max-width: 800px) {
    .lobby {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
