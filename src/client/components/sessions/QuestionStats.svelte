<script lang="ts">
  // How the class answered each question.
  import type { SessionResults } from '../../../shared/session.ts';
  import { t, tn } from '../../lib/i18n.svelte.ts';
  import { percent, questionStats } from '../../lib/results.ts';
  import Markdown from '../Markdown.svelte';
  import AnswerBars from './AnswerBars.svelte';

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
      <AnswerBars
        options={question.options}
        counts={Object.fromEntries(stats.counts)}
        responses={stats.responses}
        correct={question.kind === 'quiz' ? new Set(question.options.filter((o) => o.correct).map((o) => o.id)) : undefined}
      />
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
</style>
