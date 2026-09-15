<script lang="ts">
  // How the class answered each question. One series per question, so bars share
  // one color; for quiz questions the correct options stay in the accent color and
  // carry a check label, the others step back to gray.
  import type { SessionResults } from '../../../shared/session.ts';
  import { t, tn } from '../../lib/i18n.svelte.ts';
  import { LETTERS, percent, questionStats } from '../../lib/results.ts';
  import Icon from '../Icon.svelte';
  import Markdown from '../Markdown.svelte';

  let { results }: { results: SessionResults } = $props();
</script>

<ol class="questions">
  {#each results.questions as question, i (question.id)}
    {@const stats = questionStats(question, results.participants)}
    <li class="question">
      <div class="q-head">
        <span class="number">{i + 1}</span>
        {#if question.kind === 'poll'}<span class="tag">{t('editor.pollTag')}</span>{/if}
        <span class="muted small">
          {tn('results.responses', stats.responses)}
          {#if question.kind === 'quiz' && stats.responses > 0}
            · {t('results.correctRate', { percent: percent(stats.correct, stats.responses) })}
          {/if}
        </span>
      </div>
      <div class="q-body"><Markdown source={question.body} /></div>
      <ul class="options">
        {#each question.options as option, j (option.id)}
          {@const count = stats.counts.get(option.id) ?? 0}
          {@const share = percent(count, stats.responses)}
          <li class:dim={question.kind === 'quiz' && !option.correct} title={`${LETTERS[j]}: ${count} (${share}%)`}>
            <div class="label">
              <span class="letter">{LETTERS[j]}</span>
              <div class="text"><Markdown source={option.body} /></div>
              {#if option.correct}
                <span class="correct"><Icon name="check" size={14} />{t('results.correctOption')}</span>
              {/if}
            </div>
            <div class="track">
              <span class="bar" style:width={`calc((100% - 6.5rem) * ${share / 100})`}></span>
              <span class="value">{count} · {share}%</span>
            </div>
          </li>
        {/each}
      </ul>
    </li>
  {/each}
</ol>

<style>
  .questions {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .question {
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .question:last-child {
    border-bottom: 0;
  }

  .q-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .number {
    font-weight: 700;
  }

  .q-body {
    margin-bottom: 0.8rem;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .letter {
    flex: none;
    width: 1.4rem;
    font-weight: 700;
    color: var(--muted);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .correct {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .correct :global(svg) {
    color: var(--accent);
  }

  .track {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.3rem;
    padding-left: 1.9rem;
  }

  /* Square at the baseline, rounded at the data end, thin. */
  .bar {
    flex: none;
    height: 12px;
    background: var(--accent);
    border-radius: 0 4px 4px 0;
  }

  .dim .bar {
    background: var(--chart-muted);
  }

  .value {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--muted);
  }
</style>
