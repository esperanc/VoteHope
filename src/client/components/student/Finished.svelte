<script lang="ts">
  import type { PlayState } from '../../../shared/session.ts';
  import { t, tn } from '../../lib/i18n.svelte.ts';
  import Icon from '../Icon.svelte';

  let { play }: { play: PlayState } = $props();

  const reason = $derived(
    play.endReason === 'time'
      ? t('student.endedByTime')
      : play.endReason === 'closed'
        ? t('student.endedByClose')
        : t('student.submitted'),
  );
</script>

<div class="card stack done">
  <span class="check" aria-hidden="true"><Icon name="check" size={34} /></span>
  <h1>{t('student.allDone', { name: play.name })}</h1>
  <p>{reason}</p>
  {#if play.score && play.score.total > 0}
    <p class="score">
      <span class="value">{play.score.correct}</span>
      <span class="of">/ {play.score.total}</span>
    </p>
    <p>{tn('student.score', play.score.total, { correct: play.score.correct })}</p>
  {/if}
</div>

<style>
  .done {
    text-align: center;
  }

  .check {
    display: inline-grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    margin: 0 auto;
    color: var(--accent-text);
    background: var(--accent);
    border-radius: 50%;
  }

  .score {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.4rem;
  }

  .value {
    font-size: 3.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .of {
    font-size: 1.4rem;
    color: var(--muted);
  }
</style>
