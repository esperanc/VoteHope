<script lang="ts">
  import { LIMITS, newOption, type Issue, type Question, type QuestionKind } from '../../../shared/quiz.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import Icon from '../Icon.svelte';
  import FormattingHelp from './FormattingHelp.svelte';
  import MarkdownField from './MarkdownField.svelte';
  import SecondsInput from './SecondsInput.svelte';

  let {
    question = $bindable(),
    index,
    total,
    defaultTimeLimitS,
    issues,
    onmove,
    onduplicate,
    ondelete,
  }: {
    question: Question;
    index: number;
    total: number;
    defaultTimeLimitS: number;
    issues: Issue[];
    onmove: (delta: number) => void;
    onduplicate: () => void;
    ondelete: () => void;
  } = $props();

  const LETTERS = 'ABCDEFGHIJ';
  const isQuiz = $derived(question.kind === 'quiz');
  const issueCodes = $derived([...new Set(issues.map((issue) => issue.code))]);
  const flaggedOptions = $derived(new Set(issues.flatMap((issue) => (issue.optionId ? [issue.optionId] : []))));

  function setKind(kind: QuestionKind) {
    question.kind = kind;
    if (kind === 'poll') for (const option of question.options) option.correct = false;
  }

  function toggleCorrect(i: number) {
    if (question.selection === 'single') {
      question.options.forEach((option, j) => (option.correct = j === i));
    } else {
      question.options[i]!.correct = !question.options[i]!.correct;
    }
  }

  function moveOption(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= question.options.length) return;
    const [option] = question.options.splice(i, 1);
    question.options.splice(j, 0, option!);
  }
</script>

<section class="card editor" aria-label={t('editor.questionNumber', { n: index + 1 })}>
  <header class="head">
    <h2>{t('editor.questionNumber', { n: index + 1 })}</h2>
    <div class="actions">
      <button type="button" class="icon-btn" title={t('editor.moveUp')} aria-label={t('editor.moveUp')} disabled={index === 0} onclick={() => onmove(-1)}>
        <Icon name="arrowUp" />
      </button>
      <button type="button" class="icon-btn" title={t('editor.moveDown')} aria-label={t('editor.moveDown')} disabled={index === total - 1} onclick={() => onmove(1)}>
        <Icon name="arrowDown" />
      </button>
      <button type="button" class="icon-btn" title={t('editor.duplicate')} aria-label={t('editor.duplicate')} onclick={onduplicate}>
        <Icon name="copy" />
      </button>
      <button type="button" class="icon-btn danger" title={t('editor.delete')} aria-label={t('editor.delete')} onclick={ondelete}>
        <Icon name="trash" />
      </button>
    </div>
  </header>

  <div class="settings">
    <fieldset>
      <legend>{t('editor.type')}</legend>
      <label class="choice">
        <input type="radio" name="kind" checked={question.kind === 'quiz'} onchange={() => setKind('quiz')} />
        {t('editor.kind.quiz')}
      </label>
      <label class="choice">
        <input type="radio" name="kind" checked={question.kind === 'poll'} onchange={() => setKind('poll')} />
        {t('editor.kind.poll')}
      </label>
    </fieldset>
    <fieldset>
      <legend>{t('editor.answers')}</legend>
      <label class="choice">
        <input type="radio" name="selection" value="single" bind:group={question.selection} />
        {t('editor.selection.single')}
      </label>
      <label class="choice">
        <input type="radio" name="selection" value="multiple" bind:group={question.selection} />
        {t('editor.selection.multiple')}
      </label>
    </fieldset>
    <div>
      <label for="time-limit">{t('editor.timeLimit')}</label>
      <SecondsInput
        id="time-limit"
        allowEmpty
        value={question.timeLimitS}
        onchange={(seconds) => (question.timeLimitS = seconds)}
        placeholder={t('editor.timeLimitDefault', { seconds: defaultTimeLimitS })}
      />
    </div>
  </div>

  <div class="stack-tight">
    <MarkdownField
      id="question-body"
      label={t('editor.body')}
      bind:value={question.body}
      rows={4}
      maxlength={LIMITS.bodyLength}
      placeholder={t('editor.bodyPlaceholder')}
    />
    <FormattingHelp />
  </div>

  <div class="stack-tight">
    <div class="options-head">
      <h3>{t('editor.options')}</h3>
      {#if isQuiz}
        <span class="muted small">
          {question.selection === 'single' ? t('editor.markOneCorrect') : t('editor.markAllCorrect')}
        </span>
      {/if}
    </div>

    <ul class="options" class:multiple={question.selection === 'multiple'}>
      {#each question.options as option, i (option.id)}
        {@const letter = LETTERS[i] ?? '?'}
        <li class:flagged={flaggedOptions.has(option.id)}>
          {#if isQuiz}
            <button
              type="button"
              class="correct"
              aria-pressed={option.correct}
              title={t('editor.markCorrect', { letter })}
              aria-label={t('editor.markCorrect', { letter })}
              onclick={() => toggleCorrect(i)}
            >
              <Icon name="check" size={16} />
            </button>
          {/if}
          <span class="letter" aria-hidden="true">{letter}</span>
          <div class="grow">
            <MarkdownField
              compact
              bind:value={option.body}
              maxlength={LIMITS.optionLength}
              placeholder={t('editor.optionPlaceholder', { letter })}
            />
          </div>
          <div class="row-actions">
            <button type="button" class="icon-btn" aria-label={t('editor.moveOptionUp', { letter })} title={t('editor.moveUp')} disabled={i === 0} onclick={() => moveOption(i, -1)}>
              <Icon name="arrowUp" size={16} />
            </button>
            <button type="button" class="icon-btn" aria-label={t('editor.moveOptionDown', { letter })} title={t('editor.moveDown')} disabled={i === question.options.length - 1} onclick={() => moveOption(i, 1)}>
              <Icon name="arrowDown" size={16} />
            </button>
            <button type="button" class="icon-btn danger" aria-label={t('editor.removeOption', { letter })} title={t('editor.delete')} onclick={() => question.options.splice(i, 1)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </li>
      {/each}
    </ul>

    {#if question.options.length < LIMITS.maxOptions}
      <button type="button" class="btn add-option" onclick={() => question.options.push(newOption())}>
        <Icon name="plus" />
        {t('editor.addOption')}
      </button>
    {/if}
  </div>

  {#if issueCodes.length > 0}
    <ul class="issues">
      {#each issueCodes as code (code)}
        <li><Icon name="alert" size={15} /> {t(`issue.${code}` as MessageKey)}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h2 {
    font-size: 1.15rem;
  }

  h3 {
    font-size: 1rem;
  }

  .actions,
  .row-actions {
    display: flex;
    flex: none;
  }

  .settings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem 1.5rem;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.3rem;
    font-weight: normal;
    cursor: pointer;
  }

  .stack-tight {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .options-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem 0.75rem;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .options li {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .letter {
    flex: none;
    width: 1.2rem;
    padding-top: 0.5rem;
    font-weight: 700;
    text-align: center;
    color: var(--muted);
  }

  .correct {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    color: transparent;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 50%;
    cursor: pointer;
  }

  .multiple .correct {
    border-radius: 8px;
  }

  .correct:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .correct[aria-pressed='true'] {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .flagged :global(textarea) {
    border-color: var(--warning);
  }

  .add-option {
    align-self: flex-start;
  }

  .issues {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0;
    padding: 0.7rem 0.9rem;
    font-size: 0.9rem;
    color: var(--warning);
    background: var(--warning-bg);
    border-radius: 8px;
    list-style: none;
  }

  .issues li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
</style>
