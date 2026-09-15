<script lang="ts">
  import type { Question } from '../../../shared/quiz.ts';
  import { t } from '../../lib/i18n.svelte.ts';
  import Icon from '../Icon.svelte';

  let {
    questions = $bindable(),
    selectedId = $bindable(),
    incomplete,
    onadd,
  }: {
    questions: Question[];
    selectedId: string | null;
    /** Ids of questions with issues. */
    incomplete: Set<string>;
    onadd: () => void;
  } = $props();

  let dragIndex = $state<number | null>(null);
  let overIndex = $state<number | null>(null);

  const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;

  function snippet(question: Question): string {
    const text = question.body
      .replace(IMAGE, ' ')
      .replace(/[*_`#>$\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
    return IMAGE.test(question.body) ? t('editor.imageOnly') : '';
  }

  function drop(to: number) {
    const from = dragIndex;
    dragIndex = overIndex = null;
    if (from === null || from === to) return;
    const [moved] = questions.splice(from, 1);
    questions.splice(to, 0, moved!);
  }
</script>

<nav class="list" aria-label={t('editor.questions')}>
  <div class="list-head">
    <h2>{t('editor.questions')}</h2>
    <span class="muted small">{questions.length}</span>
  </div>

  <ol>
    {#each questions as question, index (question.id)}
      {@const text = snippet(question)}
      <li
        class:selected={question.id === selectedId}
        class:dragging={dragIndex === index}
        class:drop-before={dragIndex !== null && overIndex === index && dragIndex > index}
        class:drop-after={dragIndex !== null && overIndex === index && dragIndex < index}
        draggable="true"
        title={t('editor.dragHint')}
        ondragstart={(event) => {
          dragIndex = index;
          event.dataTransfer?.setData('text/plain', question.id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        }}
        ondragover={(event) => {
          if (dragIndex === null) return;
          event.preventDefault();
          overIndex = index;
        }}
        ondrop={(event) => {
          event.preventDefault();
          drop(index);
        }}
        ondragend={() => (dragIndex = overIndex = null)}
      >
        <button type="button" onclick={() => (selectedId = question.id)} aria-current={question.id === selectedId}>
          <span class="grip" aria-hidden="true"><Icon name="grip" size={14} /></span>
          <span class="number">{index + 1}</span>
          <span class="snippet" class:empty={!text}>{text || t('editor.emptyQuestion')}</span>
          {#if question.kind === 'poll'}
            <span class="tag">{t('editor.pollTag')}</span>
          {/if}
          {#if incomplete.has(question.id)}
            <span class="warn" title={t('editor.incomplete')}>
              <Icon name="alert" size={15} />
              <span class="visually-hidden">{t('editor.incomplete')}</span>
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ol>

  <button type="button" class="btn btn-block" onclick={onadd}>
    <Icon name="plus" />
    {t('editor.addQuestion')}
  </button>
</nav>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .list-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  h2 {
    font-size: 1rem;
  }

  ol {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    border-radius: 8px;
  }

  li.dragging {
    opacity: 0.4;
  }

  li.drop-before::before,
  li.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--accent);
    border-radius: 2px;
  }

  li.drop-before::before {
    top: -2px;
  }

  li.drop-after::after {
    bottom: -2px;
  }

  button:not(.btn) {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    width: 100%;
    padding: 0.5rem 0.55rem 0.5rem 0.3rem;
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    color: var(--text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
  }

  button:not(.btn):hover {
    background: var(--hover);
  }

  .selected button:not(.btn) {
    background: var(--surface);
    border-color: var(--accent);
    box-shadow: var(--shadow);
  }

  .grip {
    flex: none;
    padding-top: 0.15rem;
    color: var(--border);
    cursor: grab;
  }

  li:hover .grip {
    color: var(--muted);
  }

  .number {
    flex: none;
    min-width: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .snippet {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .snippet.empty {
    font-style: italic;
    color: var(--muted);
  }

  .tag {
    flex: none;
    padding: 0 0.3rem;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .warn {
    flex: none;
    display: flex;
    color: var(--warning);
  }
</style>
