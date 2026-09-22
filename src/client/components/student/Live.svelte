<script lang="ts">
  // A student's phone during a live session: it shows whatever the server says the
  // session is doing, and sends one final answer per question.
  import { onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import type { LiveAck, LiveStudentView } from '../../../shared/live.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { connectLive, measureOffset } from '../../lib/live.ts';
  import { savedToken } from '../../lib/play.ts';
  import Icon from '../Icon.svelte';
  import QuestionView from '../QuestionView.svelte';
  import Countdown from './Countdown.svelte';

  export type LeaveReason = 'removed' | 'invalid_token' | 'not_found';

  let { code, onleave }: { code: string; onleave: (reason: LeaveReason) => void } = $props();

  let view = $state<LiveStudentView | null>(null);
  let connected = $state(false);
  let offset = $state(0);
  let selected = $state<string[]>([]);
  let timeUp = $state(false);
  let sending = $state(false);
  let error = $state<MessageKey | null>(null);
  let socket: Socket | undefined;
  let measured = false;
  let questionId: string | null = null;

  onMount(() => {
    const s = connectLive({ role: 'student', code, token: savedToken(code) });
    socket = s;
    const leave = (reason: LeaveReason) => {
      s.disconnect();
      onleave(reason);
    };
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
      if (err.message === 'invalid_token' || err.message === 'not_found') leave(err.message);
    });
    s.on('removed', () => leave('removed'));
    s.on('session_deleted', () => leave('not_found'));
    s.on('state', (next: LiveStudentView) => {
      const id = next.question?.id ?? null;
      if (id !== questionId) {
        questionId = id;
        selected = [];
        timeUp = false;
        error = null;
      }
      if (!measured) offset = next.serverNow - Date.now();
      view = next;
    });
    return () => s.disconnect();
  });

  async function submit() {
    if (!socket || !view?.question || selected.length === 0) return;
    sending = true;
    error = null;
    try {
      const result: LiveAck = await socket
        .timeout(5000)
        .emitWithAck('answer', { questionId: view.question.id, optionIds: $state.snapshot(selected) });
      if ('error' in result) {
        if (result.error === 'time_up' || result.error === 'not_open') timeUp = true;
        else if (result.error !== 'already_answered') error = 'live.sendFailed';
      }
      // On success the server sends the new state (answered).
    } catch {
      error = 'live.sendFailed';
    } finally {
      sending = false;
    }
  }
</script>

<div class="live">
  {#if view && !connected}
    <p class="banner" role="status">{t('present.reconnecting')}</p>
  {/if}

  {#if !view}
    <p class="muted">{t('common.loading')}</p>
  {:else if view.phase === 'lobby'}
    <div class="card stack center">
      <span class="pulse" aria-hidden="true"></span>
      <h1>{t('live.youreIn', { name: view.name })}</h1>
      <p class="muted">{t('live.waitingStart')}</p>
    </div>
  {:else if view.phase === 'finished'}
    <div class="card stack center">
      <span class="icon done" aria-hidden="true"><Icon name="check" size={30} /></span>
      <h1>{t('live.finished', { name: view.name })}</h1>
    </div>
  {:else if view.question && !view.answered && !timeUp}
    {@const question = view.question}
    <div class="status">
      <span>{t('student.questionOf', { n: view.questionIndex + 1, total: view.questionCount })}</span>
      {#if view.deadline !== null}
        {#key view.deadline}
          <Countdown deadline={view.deadline} {offset} onexpire={() => (timeUp = true)} />
        {/key}
      {/if}
    </div>
    {#key question.id}
      <div class="card">
        <QuestionView {question} bind:selected disabled={sending} />
      </div>
    {/key}
    <button type="button" class="btn btn-primary btn-block big" disabled={sending || selected.length === 0} onclick={submit}>
      {t('live.submit')}
    </button>
    {#if error}
      <p class="error" role="alert">{t(error)}</p>
    {/if}
  {:else}
    <div class="card stack center">
      {#if view.answered}
        <span class="icon done" aria-hidden="true"><Icon name="check" size={30} /></span>
        <h2>{t('live.received')}</h2>
      {:else}
        <span class="icon late" aria-hidden="true"><Icon name="clock" size={30} /></span>
        <h2>{t('student.timeUp')}</h2>
      {/if}
      <p class="muted">{view.phase === 'open' ? t('live.waitingOthers') : t('live.waitingNext')}</p>
    </div>
  {/if}
</div>

<style>
  .live {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .banner {
    padding: 0.5rem 0.8rem;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    color: var(--warning);
    background: var(--warning-bg);
    border-radius: 8px;
  }

  .center {
    align-items: center;
    text-align: center;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted);
  }

  .icon {
    display: inline-grid;
    place-items: center;
    width: 3.75rem;
    height: 3.75rem;
    margin: 0 auto;
    border-radius: 50%;
  }

  .icon.done {
    color: var(--accent-text);
    background: var(--accent);
  }

  .icon.late {
    color: var(--danger);
    background: var(--danger-bg);
  }

  .pulse {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0.5rem auto;
    background: var(--accent);
    border-radius: 50%;
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.8);
    }

    50% {
      opacity: 1;
      transform: scale(1.15);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
