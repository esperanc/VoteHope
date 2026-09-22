<script lang="ts">
  // A question as students see it. Shared by the editor preview and the student screens.
  import type { StudentQuestion } from '../../shared/session.ts';
  import { t } from '../lib/i18n.svelte.ts';
  import Markdown from './Markdown.svelte';

  /** Quiz questions (editor) and student questions (without correct flags) both fit. */
  type ViewQuestion = Pick<StudentQuestion, 'id' | 'selection' | 'body' | 'options'>;

  let {
    question,
    order,
    selected = $bindable([]),
    disabled = false,
  }: {
    question: ViewQuestion;
    /** Option ids in display order. Defaults to the order of question.options. */
    order?: string[];
    selected?: string[];
    disabled?: boolean;
  } = $props();

  const multiple = $derived(question.selection === 'multiple');
  const options = $derived(
    order
      ? order.map((id) => question.options.find((option) => option.id === id)).filter((option) => option !== undefined)
      : question.options,
  );

  function choose(id: string) {
    if (disabled) return;
    if (!multiple) selected = [id];
    else selected = selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id];
  }
</script>

<div class="question" class:multiple>
  <div class="body"><Markdown source={question.body} /></div>
  {#if multiple}
    <p class="hint">{t('student.selectAll')}</p>
  {/if}
  <div class="options" role={multiple ? 'group' : 'radiogroup'}>
    {#each options as option (option.id)}
      {@const isSelected = selected.includes(option.id)}
      <label class="option" class:selected={isSelected} class:disabled>
        <input
          type={multiple ? 'checkbox' : 'radio'}
          name={`question-${question.id}`}
          checked={isSelected}
          {disabled}
          onchange={() => choose(option.id)}
        />
        <span class="mark" aria-hidden="true"></span>
        <span class="text"><Markdown source={option.body} /></span>
      </label>
    {/each}
  </div>
</div>

<style>
  .question {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .body {
    font-size: 1.1rem;
  }

  .hint {
    margin-top: -0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .option {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin: 0;
    padding: 0.8rem 0.9rem;
    font-weight: normal;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
  }

  .option.selected {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .option.disabled {
    cursor: default;
  }

  .option:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    margin-top: 0.1rem;
    border: 2px solid var(--muted);
    border-radius: 50%;
  }

  .multiple .mark {
    border-radius: 5px;
  }

  .selected .mark {
    background: var(--accent);
    border-color: var(--accent);
  }

  .selected .mark::after {
    content: '';
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--accent-text);
  }

  .multiple .selected .mark::after {
    width: 0.35rem;
    height: 0.65rem;
    border-radius: 0;
    background: none;
    border: solid var(--accent-text);
    border-width: 0 2px 2px 0;
    transform: translateY(-1px) rotate(45deg);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  /* Windows high contrast replaces our colors with the system palette, which would
     wipe out the fills that show which option is chosen. System colors survive. */
  @media (forced-colors: active) {
    .option.selected {
      outline: 3px solid Highlight;
      outline-offset: -3px;
    }

    .selected .mark {
      border-color: Highlight;
    }

    .selected .mark::after {
      background: Highlight;
    }

    .multiple .selected .mark::after {
      background: none;
      border-color: Highlight;
    }
  }
</style>
