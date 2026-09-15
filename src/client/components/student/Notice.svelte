<script lang="ts">
  // Why a session cannot be answered right now.
  import type { JoinInfo } from '../../../shared/session.ts';
  import { formatDateTime, t } from '../../lib/i18n.svelte.ts';

  let { info }: { info: JoinInfo } = $props();
</script>

<p class="notice">
  {#if info.state === 'scheduled' && info.opensAt}
    {t('student.notOpenYet', { date: formatDateTime(info.opensAt) })}
  {:else}
    {t('student.closed')}
  {/if}
</p>

<style>
  .notice {
    padding: 0.8rem 1rem;
    font-weight: 600;
    background: var(--hover);
    border-radius: 8px;
  }
</style>
