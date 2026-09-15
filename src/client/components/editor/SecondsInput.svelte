<script lang="ts">
  // Time-limit input that only reports whole numbers within the allowed range, so an
  // out-of-range value being typed never reaches the (auto-saved) quiz.
  import { untrack } from 'svelte';
  import { LIMITS } from '../../../shared/quiz.ts';
  import { t } from '../../lib/i18n.svelte.ts';

  let {
    value,
    onchange,
    id,
    placeholder = '',
    allowEmpty = false,
  }: {
    value: number | null;
    onchange: (value: number | null) => void;
    id?: string;
    placeholder?: string;
    /** Empty means "use the default" (reported as null). */
    allowEmpty?: boolean;
  } = $props();

  const format = (v: number | null) => (v === null ? '' : String(v));
  let text = $state(untrack(() => format(value)));
  let invalid = $state(false);

  function oninput() {
    const trimmed = text.trim();
    if (trimmed === '' && allowEmpty) {
      invalid = false;
      onchange(null);
      return;
    }
    const seconds = Number(trimmed);
    invalid = !(Number.isInteger(seconds) && seconds >= LIMITS.minTimeLimitS && seconds <= LIMITS.maxTimeLimitS);
    if (!invalid) onchange(seconds);
  }

  function onblur() {
    text = format(value);
    invalid = false;
  }
</script>

<input
  type="text"
  inputmode="numeric"
  {id}
  {placeholder}
  bind:value={text}
  {oninput}
  {onblur}
  aria-invalid={invalid}
  class:invalid
/>
{#if invalid}
  <p class="hint">{t('editor.timeLimitRange', { min: LIMITS.minTimeLimitS, max: LIMITS.maxTimeLimitS })}</p>
{/if}

<style>
  input {
    max-width: 10rem;
  }

  .invalid {
    border-color: var(--danger);
  }

  .hint {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
