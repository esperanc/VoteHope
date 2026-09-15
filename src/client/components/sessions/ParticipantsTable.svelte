<script lang="ts">
  import type { SessionResults } from '../../../shared/session.ts';
  import { formatDateTime, i18n, t } from '../../lib/i18n.svelte.ts';
  import { attemptLabel, scoredTotal, sortedByName } from '../../lib/results.ts';
  import Icon from '../Icon.svelte';

  let {
    results,
    ondelete,
  }: { results: SessionResults; ondelete: (participantId: number, name: string) => void } = $props();

  const total = $derived(scoredTotal(results.questions));
  const showEmail = $derived(results.participants.some((p) => p.email));
  const rows = $derived(sortedByName(results.participants, i18n.locale));
</script>

<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>{t('results.name')}</th>
        {#if showEmail}<th>{t('results.email')}</th>{/if}
        <th class="num">{t('results.score')}</th>
        <th class="num">{t('results.answered')}</th>
        <th>{t('results.status')}</th>
        <th>{t('results.finished')}</th>
        <th><span class="visually-hidden">{t('dashboard.delete')}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as participant (participant.id)}
        <tr>
          <td class="name">{participant.name}</td>
          {#if showEmail}<td>{participant.email ?? ''}</td>{/if}
          <td class="num">{total > 0 ? `${participant.correct} / ${total}` : '–'}</td>
          <td class="num">{participant.answered} / {results.questions.length}</td>
          <td><span class="status" data-status={participant.status}>{t(attemptLabel(participant))}</span></td>
          <td>{participant.submittedAt ? formatDateTime(participant.submittedAt) : ''}</td>
          <td class="actions">
            <button
              type="button"
              class="icon-btn danger"
              title={t('results.deleteAttempt', { name: participant.name })}
              aria-label={t('results.deleteAttempt', { name: participant.name })}
              onclick={() => ondelete(participant.id, participant.name)}
            >
              <Icon name="trash" size={16} />
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .name {
    font-weight: 600;
  }

  .status[data-status='in_progress'] {
    color: var(--accent);
    font-weight: 600;
  }

  .status[data-status='ready'] {
    color: var(--muted);
  }

  .actions {
    width: 1%;
    padding-top: 0.2rem;
    padding-bottom: 0.2rem;
  }
</style>
