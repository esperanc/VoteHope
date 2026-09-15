<script lang="ts">
  import type { Quiz } from '../../../shared/quiz.ts';
  import AdminHeader from '../../components/AdminHeader.svelte';
  import Icon from '../../components/Icon.svelte';
  import QuestionView from '../../components/QuestionView.svelte';
  import { api } from '../../lib/api.ts';
  import { t } from '../../lib/i18n.svelte.ts';
  import { shuffled } from '../../../shared/random.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  let quiz = $state<Quiz | null>(null);
  let failed = $state(false);
  let index = $state(0);
  let order = $state<string[]>([]);
  let answer = $state<string[]>([]);
  let shuffles = $state(0);

  const question = $derived(quiz?.questions[index]);

  function show(i: number) {
    index = i;
    const current = quiz?.questions[i];
    order = current ? shuffled(current.options.map((option) => option.id)) : [];
    answer = [];
    shuffles++;
  }

  async function load() {
    try {
      quiz = await api<Quiz>('GET', `/api/admin/quizzes/${params.id}`);
      show(0);
    } catch {
      failed = true;
    }
  }
  load();
</script>

<AdminHeader />

<main class="container stack">
  <a class="back" href={`/admin/quizzes/${params.id}`}>
    <Icon name="arrowLeft" size={16} />
    {t('preview.backToEditor')}
  </a>

  {#if failed}
    <p class="error">{t('editor.loadFailed')}</p>
  {:else if !quiz}
    <p class="muted">{t('common.loading')}</p>
  {:else}
    <div class="intro">
      <h1>{quiz.title.trim() || t('quiz.untitled')}</h1>
      <p class="muted">{t('preview.note')}</p>
    </div>

    {#if question}
      <div class="phone">
        <div class="phone-top">
          <span>{t('preview.questionOf', { n: index + 1, total: quiz.questions.length })}</span>
          <span>{t('preview.seconds', { seconds: question.timeLimitS ?? quiz.defaultTimeLimitS })}</span>
        </div>
        {#key shuffles}
          <QuestionView {question} {order} bind:selected={answer} />
        {/key}
      </div>

      <div class="nav">
        <button type="button" class="btn" disabled={index === 0} onclick={() => show(index - 1)}>
          <Icon name="arrowLeft" size={16} />
          {t('preview.previous')}
        </button>
        <button type="button" class="btn" onclick={() => show(index)}>
          <Icon name="shuffle" size={16} />
          {t('preview.reshuffle')}
        </button>
        <button type="button" class="btn btn-primary" disabled={index === quiz.questions.length - 1} onclick={() => show(index + 1)}>
          {t('preview.next')}
        </button>
      </div>
    {:else}
      <p class="card muted">{t('issue.noQuestions')}</p>
    {/if}
  {/if}
</main>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: 600;
    text-decoration: none;
  }

  .intro {
    text-align: center;
  }

  .intro h1 {
    margin-bottom: 0.3rem;
  }

  .nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
