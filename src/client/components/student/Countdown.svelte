<script lang="ts">
  // Time left until a server-clock deadline. `offset` is server time minus this
  // device's time, so a phone with a wrong clock still counts down correctly.
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n.svelte.ts';
  import Icon from '../Icon.svelte';

  let { deadline, offset, onexpire }: { deadline: number; offset: number; onexpire?: () => void } = $props();

  let now = $state(Date.now());
  const ticker = setInterval(() => (now = Date.now()), 250);
  onDestroy(() => clearInterval(ticker));

  const seconds = $derived(Math.max(0, Math.ceil((deadline - (now + offset)) / 1000)));
  const label = $derived.by(() => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  });

  let expired = false;
  $effect(() => {
    if (seconds === 0 && !expired) {
      expired = true;
      onexpire?.();
    }
  });
</script>

<span class="countdown" class:urgent={seconds <= 10} role="timer" aria-label={`${t('student.timeLeft')}: ${label}`}>
  <Icon name="clock" size={16} />
  {label}
</span>

<style>
  .countdown {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.55rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
  }

  .urgent {
    color: var(--danger);
    border-color: var(--danger);
  }
</style>
