<script lang="ts">
  // After joining, before starting: what to expect. Timers start only on "Start".
  import type { PlayState } from '../../../shared/session.ts';
  import { ApiError } from '../../lib/api.ts';
  import { formatDateTime, t, tn, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { playApi } from '../../lib/play.ts';
  import Notice from './Notice.svelte';

  let { play, onstate }: { play: PlayState; onstate: (next: PlayState) => void } = $props();

  const info = $derived(play.info);
  let busy = $state(false);
  let error = $state<MessageKey | null>(null);

  async function begin() {
    busy = true;
    error = null;
    try {
      onstate(await playApi('POST', info.code, '/start'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) onstate(await playApi('GET', info.code));
      else error = err instanceof ApiError && err.status === 0 ? 'error.network' : 'error.unexpected';
    } finally {
      busy = false;
    }
  }
</script>

<div class="card stack">
  <p class="muted small">{t('student.joinedAs', { name: play.name })}</p>
  <h1>{info.title.trim() || t('quiz.untitled')}</h1>
  {#if info.description.trim()}
    <p class="description">{info.description}</p>
  {/if}
  <ul class="facts">
    <li>{tn('student.questionCount', info.questionCount)}</li>
    <li>
      {#if info.timerMode === 'total'}
        {t('student.totalTime', { minutes: info.totalMinutes ?? 0 })}
      {:else if info.timerMode === 'perQuestion'}
        {t('student.timePerQuestion')}
      {:else}
        {t('student.noTimeLimit')}
      {/if}
    </li>
    {#if info.closesAt}
      <li>{t('student.openUntil', { date: formatDateTime(info.closesAt) })}</li>
    {/if}
  </ul>
  {#if info.state === 'open'}
    <button class="btn btn-primary btn-block big" type="button" disabled={busy} onclick={begin}>{t('student.start')}</button>
  {:else}
    <Notice {info} />
  {/if}
  {#if error}
    <p class="error" role="alert">{t(error)}</p>
  {/if}
</div>

<style>
  .description {
    white-space: pre-line;
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding-left: 1.2rem;
  }
</style>
