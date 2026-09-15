<script lang="ts">
  // Settings for a new self-paced session.
  import {
    DEFAULT_ASYNC_SETTINGS,
    SESSION_LIMITS,
    type AsyncSettings,
    type EmailMode,
    type SessionDetail,
    type TimerMode,
  } from '../../../shared/session.ts';
  import { api, ApiError } from '../../lib/api.ts';
  import { fromLocalInput } from '../../lib/format.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { navigate } from '../../lib/router.svelte.ts';

  let { quizId }: { quizId: number } = $props();

  const TIMERS: [TimerMode, MessageKey][] = [
    ['none', 'sessions.timer.none'],
    ['total', 'sessions.timer.total'],
    ['perQuestion', 'sessions.timer.perQuestion'],
  ];
  const EMAILS: [EmailMode, MessageKey][] = [
    ['hidden', 'sessions.email.hidden'],
    ['optional', 'sessions.email.optional'],
    ['required', 'sessions.email.required'],
  ];

  let timerMode = $state<TimerMode>(DEFAULT_ASYNC_SETTINGS.timerMode);
  let minutes = $state('20');
  let shuffleQuestions = $state(DEFAULT_ASYNC_SETTINGS.shuffleQuestions);
  let opensAt = $state('');
  let closesAt = $state('');
  let showScore = $state(DEFAULT_ASYNC_SETTINGS.showScore);
  let email = $state<EmailMode>(DEFAULT_ASYNC_SETTINGS.email);
  let busy = $state(false);
  let error = $state<MessageKey | null>(null);

  const minutesValid = $derived.by(() => {
    if (timerMode !== 'total') return true;
    const value = Number(minutes.trim());
    return minutes.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= SESSION_LIMITS.maxTotalMinutes;
  });
  const datesValid = $derived(!opensAt || !closesAt || new Date(opensAt) < new Date(closesAt));

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!minutesValid || !datesValid) return;
    busy = true;
    error = null;
    const settings: AsyncSettings = {
      timerMode,
      totalMinutes: timerMode === 'total' ? Number(minutes) : null,
      shuffleQuestions,
      opensAt: fromLocalInput(opensAt),
      closesAt: fromLocalInput(closesAt),
      showScore,
      email,
    };
    try {
      const session = await api<SessionDetail>('POST', '/api/admin/sessions', { quizId, mode: 'async', settings });
      navigate(`/admin/sessions/${session.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'quiz_incomplete') error = 'sessions.quizIncomplete';
      else error = err instanceof ApiError && err.status === 0 ? 'error.network' : 'error.unexpected';
    } finally {
      busy = false;
    }
  }
</script>

<form class="stack" onsubmit={submit}>
  <fieldset>
    <legend>{t('sessions.timer')}</legend>
    {#each TIMERS as [mode, label] (mode)}
      <label class="choice"><input type="radio" name="timer" value={mode} bind:group={timerMode} /> {t(label)}</label>
    {/each}
    {#if timerMode === 'total'}
      <div class="indent">
        <label for="minutes">{t('sessions.minutes')}</label>
        <input id="minutes" class="short" inputmode="numeric" bind:value={minutes} aria-invalid={!minutesValid} />
        {#if !minutesValid}
          <p class="field-error">{t('sessions.minutesInvalid', { max: SESSION_LIMITS.maxTotalMinutes })}</p>
        {/if}
      </div>
    {/if}
  </fieldset>

  <div>
    <label class="choice"><input type="checkbox" bind:checked={shuffleQuestions} /> {t('sessions.shuffleQuestions')}</label>
    <p class="muted small indent">{t('sessions.shuffleNote')}</p>
  </div>

  <div>
    <div class="dates">
      <div>
        <label for="opens-at">{t('sessions.opensAt')}</label>
        <input id="opens-at" type="datetime-local" bind:value={opensAt} />
      </div>
      <div>
        <label for="closes-at">{t('sessions.closesAt')}</label>
        <input id="closes-at" type="datetime-local" bind:value={closesAt} aria-invalid={!datesValid} />
      </div>
    </div>
    <p class="muted small">{t('sessions.dateHint')}</p>
    {#if !datesValid}
      <p class="field-error">{t('sessions.datesInvalid')}</p>
    {/if}
  </div>

  <label class="choice"><input type="checkbox" bind:checked={showScore} /> {t('sessions.showScore')}</label>

  <div>
    <label for="email-mode">{t('sessions.email')}</label>
    <select id="email-mode" class="short" bind:value={email}>
      {#each EMAILS as [mode, label] (mode)}
        <option value={mode}>{t(label)}</option>
      {/each}
    </select>
  </div>

  {#if error}
    <p class="error" role="alert">{t(error)}</p>
  {/if}

  <div>
    <button type="submit" class="btn btn-primary" disabled={busy || !minutesValid || !datesValid}>
      {t('sessions.create')}
    </button>
  </div>
</form>

<style>
  .indent {
    margin-left: 1.6rem;
  }

  .short {
    max-width: 12rem;
  }

  .dates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.75rem 1rem;
    margin-bottom: 0.35rem;
  }
</style>
