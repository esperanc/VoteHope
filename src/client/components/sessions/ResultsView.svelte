<script lang="ts">
  import type { SessionResults } from '../../../shared/session.ts';
  import { downloadFile } from '../../lib/csv.ts';
  import { formatNumber, i18n, t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { resultsCsv, scoredTotal } from '../../lib/results.ts';
  import Icon from '../Icon.svelte';
  import AnswerGrid from './AnswerGrid.svelte';
  import ParticipantsTable from './ParticipantsTable.svelte';
  import QuestionStats from './QuestionStats.svelte';

  let {
    results,
    ondelete,
  }: { results: SessionResults; ondelete: (participantId: number, name: string) => void } = $props();

  type Tab = 'students' | 'questions' | 'grid';
  const TABS: [Tab, MessageKey][] = [
    ['students', 'results.tab.students'],
    ['questions', 'results.tab.questions'],
    ['grid', 'results.tab.grid'],
  ];
  let tab = $state<Tab>('students');

  const total = $derived(scoredTotal(results.questions));
  const finished = $derived(results.participants.filter((p) => p.status === 'finished'));
  const average = $derived(
    finished.length > 0 && total > 0 ? finished.reduce((sum, p) => sum + p.correct, 0) / finished.length : null,
  );

  function exportCsv() {
    // Spreadsheets set to Portuguese expect ";" between columns.
    const separator = i18n.locale === 'pt' ? ';' : ',';
    const filename = `${results.session.title.trim() || 'quiz'} - ${results.session.code}.csv`;
    downloadFile(filename, resultsCsv(results, { separator, t, locale: i18n.locale }), 'text/csv;charset=utf-8');
  }
</script>

<section class="card stack">
  <div class="head">
    <h2>{t('results.title')}</h2>
    <button type="button" class="btn" disabled={results.participants.length === 0} onclick={exportCsv}>
      <Icon name="download" size={16} />
      {t('results.exportCsv')}
    </button>
  </div>

  <div class="tiles">
    <div class="tile">
      <span class="label">{t('results.participants')}</span>
      <span class="value">{results.participants.length}</span>
    </div>
    <div class="tile">
      <span class="label">{t('results.submitted')}</span>
      <span class="value">{finished.length}</span>
    </div>
    {#if average !== null}
      <div class="tile">
        <span class="label">{t('results.average')}</span>
        <span class="value">{formatNumber(average)} <span class="of">/ {total}</span></span>
      </div>
    {/if}
  </div>

  {#if results.participants.length === 0}
    <p class="muted">{t('results.none')}</p>
  {:else}
    <div class="tabs" role="tablist">
      {#each TABS as [id, label] (id)}
        <button type="button" role="tab" aria-selected={tab === id} onclick={() => (tab = id)}>{t(label)}</button>
      {/each}
    </div>
    <div role="tabpanel">
      {#if tab === 'students'}
        <ParticipantsTable {results} {ondelete} />
      {:else if tab === 'questions'}
        <QuestionStats {results} />
      {:else}
        <AnswerGrid {results} />
      {/if}
    </div>
  {/if}
</section>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .tile {
    display: flex;
    flex-direction: column;
    min-width: 9rem;
    padding: 0.7rem 1rem;
    background: var(--bg);
    border-radius: 8px;
  }

  .label {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .value {
    font-size: 1.6rem;
    font-weight: 600;
  }

  .of {
    font-size: 1rem;
    font-weight: 400;
    color: var(--muted);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
  }

  .tabs button {
    margin-bottom: -1px;
    padding: 0.5rem 0.9rem;
    font: inherit;
    font-weight: 600;
    color: var(--muted);
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
</style>
