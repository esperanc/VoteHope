<script lang="ts">
  import type { SessionSummary } from '../../../shared/session.ts';
  import { formatCode } from '../../lib/format.ts';
  import { formatDateTime, t, tn } from '../../lib/i18n.svelte.ts';
  import StateBadge from './StateBadge.svelte';

  let { sessions }: { sessions: SessionSummary[] } = $props();
</script>

{#if sessions.length === 0}
  <p class="muted">{t('sessions.none')}</p>
{:else}
  <ul class="sessions">
    {#each sessions as session (session.id)}
      <li>
        <a class="card row" href={`/admin/sessions/${session.id}`}>
          <span class="main">
            <span class="name">{session.title.trim() || t('quiz.untitled')}</span>
            <span class="meta">
              <span>{session.mode === 'async' ? t('sessions.selfPaced') : t('sessions.live')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('sessions.code', { code: formatCode(session.code) })}</span>
              <span aria-hidden="true">·</span>
              <span>{t('sessions.created', { date: formatDateTime(session.createdAt) })}</span>
            </span>
          </span>
          <span class="counts">
            <span>{tn('sessions.participants', session.participantCount)}</span>
            <span class="muted">{t('sessions.submitted', { count: session.submittedCount })}</span>
          </span>
          <StateBadge state={session.state} />
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .sessions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.2rem;
    color: inherit;
    text-decoration: none;
  }

  .row:hover .name {
    color: var(--accent);
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .name {
    overflow: hidden;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.45rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .counts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .counts {
      display: none;
    }
  }
</style>
