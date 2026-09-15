<script lang="ts">
  import type { SessionResults } from '../../../shared/session.ts';
  import { i18n, t } from '../../lib/i18n.svelte.ts';
  import { lettersOf, scoredTotal, sortedByName } from '../../lib/results.ts';
  import { snippet } from '../../lib/text.ts';

  let { results }: { results: SessionResults } = $props();

  const total = $derived(scoredTotal(results.questions));
  const rows = $derived(sortedByName(results.participants, i18n.locale));
</script>

<p class="muted small legend">{t('results.gridLegend')}</p>
<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th class="sticky">{t('results.name')}</th>
        {#each results.questions as question, i (question.id)}
          <th class="cell" title={snippet(question.body, t('editor.imageOnly'))}>{t('results.question', { n: i + 1 })}</th>
        {/each}
        <th class="num">{t('results.score')}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as participant (participant.id)}
        <tr>
          <th class="sticky" scope="row">{participant.name}</th>
          {#each results.questions as question (question.id)}
            {@const answer = participant.answers[question.id]}
            {@const result = !answer ? 'none' : answer.correct === null ? 'poll' : answer.correct ? 'right' : 'wrong'}
            <td class="cell" data-result={result}>
              {#if answer}
                {result === 'right' ? '✓ ' : result === 'wrong' ? '✗ ' : ''}{lettersOf(question, answer.optionIds)}
              {:else}
                –
              {/if}
            </td>
          {/each}
          <td class="num">{total > 0 ? `${participant.correct}/${total}` : '–'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .legend {
    margin-bottom: 0.6rem;
  }

  .sticky {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--surface);
  }

  tbody .sticky {
    font-weight: 600;
  }

  .cell {
    text-align: center;
  }

  td.cell {
    font-weight: 600;
  }

  [data-result='right'] {
    color: var(--success);
    background: var(--success-bg);
  }

  [data-result='wrong'] {
    color: var(--danger);
    background: var(--danger-bg);
  }

  [data-result='none'] {
    color: var(--muted);
  }
</style>
