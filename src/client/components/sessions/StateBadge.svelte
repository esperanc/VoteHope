<script lang="ts">
  import type { SessionState } from '../../../shared/session.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';

  let { state }: { state: SessionState } = $props();

  const LABELS: Record<SessionState, MessageKey> = {
    open: 'sessions.state.open',
    scheduled: 'sessions.state.scheduled',
    closed: 'sessions.state.closed',
  };
</script>

<span class="badge" data-state={state}>
  <span class="dot" aria-hidden="true"></span>
  {t(LABELS[state])}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.05rem 0.55rem;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid var(--border);
    border-radius: 999px;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    background: var(--muted);
    border-radius: 50%;
  }

  [data-state='open'] .dot {
    background: var(--success);
  }

  [data-state='scheduled'] .dot {
    background: var(--warning);
  }
</style>
