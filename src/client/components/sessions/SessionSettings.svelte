<script lang="ts">
  // A session's settings. For self-paced sessions the dates and score visibility
  // can still change; a live session has nothing to adjust.
  import type { AsyncSettings, EmailMode, SessionDetail } from '../../../shared/session.ts';
  import { fromLocalInput, toLocalInput } from '../../lib/format.ts';
  import { formatDateTime, t, type MessageKey } from '../../lib/i18n.svelte.ts';

  type Changes = Partial<Pick<AsyncSettings, 'opensAt' | 'closesAt' | 'showScore'>>;

  let { session, onsave }: { session: SessionDetail; onsave: (changes: Changes) => Promise<boolean> } = $props();

  const EMAIL: Record<EmailMode, MessageKey> = {
    hidden: 'sessions.email.hidden',
    optional: 'sessions.email.optional',
    required: 'sessions.email.required',
  };

  const settings = $derived(session.settings);
  const timerText = $derived(
    settings.timerMode === 'total'
      ? t('sessions.totalMinutes', { minutes: settings.totalMinutes ?? 0 })
      : settings.timerMode === 'perQuestion'
        ? t('sessions.timer.perQuestion')
        : t('sessions.timer.none'),
  );

  let editing = $state(false);
  let opensAt = $state('');
  let closesAt = $state('');
  let showScore = $state(true);
  let busy = $state(false);

  const datesValid = $derived(!opensAt || !closesAt || new Date(opensAt) < new Date(closesAt));

  function edit() {
    opensAt = toLocalInput(settings.opensAt);
    closesAt = toLocalInput(settings.closesAt);
    showScore = settings.showScore;
    editing = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!datesValid) return;
    busy = true;
    const saved = await onsave({ opensAt: fromLocalInput(opensAt), closesAt: fromLocalInput(closesAt), showScore });
    busy = false;
    if (saved) editing = false;
  }
</script>

<section class="card stack">
  <div class="head">
    <h2>{t('sessions.settings')}</h2>
    {#if session.mode === 'async' && !editing}
      <button type="button" class="btn" onclick={edit}>{t('sessions.edit')}</button>
    {/if}
  </div>

  {#if session.mode === 'sync'}
    <dl>
      <dt>{t('sessions.mode')}</dt>
      <dd>{t('sessions.live')}</dd>
      <dt>{t('sessions.email')}</dt>
      <dd>{t(EMAIL[settings.email])}</dd>
    </dl>
  {:else if editing}
    <form class="stack" onsubmit={save}>
      <div>
        <label for="edit-opens">{t('sessions.opensAt')}</label>
        <input id="edit-opens" type="datetime-local" bind:value={opensAt} />
      </div>
      <div>
        <label for="edit-closes">{t('sessions.closesAt')}</label>
        <input id="edit-closes" type="datetime-local" bind:value={closesAt} aria-invalid={!datesValid} />
        {#if !datesValid}
          <p class="field-error">{t('sessions.datesInvalid')}</p>
        {/if}
      </div>
      <label class="choice"><input type="checkbox" bind:checked={showScore} /> {t('sessions.showScore')}</label>
      <div class="buttons">
        <button type="submit" class="btn btn-primary" disabled={busy || !datesValid}>{t('sessions.save')}</button>
        <button type="button" class="btn" onclick={() => (editing = false)}>{t('sessions.cancel')}</button>
      </div>
    </form>
  {:else}
    <dl>
      <dt>{t('sessions.timer')}</dt>
      <dd>{timerText}</dd>
      <dt>{t('sessions.questionOrder')}</dt>
      <dd>{settings.shuffleQuestions ? t('sessions.shuffled') : t('sessions.fixed')}</dd>
      <dt>{t('sessions.opensAt')}</dt>
      <dd>{settings.opensAt ? formatDateTime(settings.opensAt) : t('sessions.opensNow')}</dd>
      <dt>{t('sessions.closesAt')}</dt>
      <dd>{settings.closesAt ? formatDateTime(settings.closesAt) : t('sessions.closesByHand')}</dd>
      <dt>{t('sessions.scoreShown')}</dt>
      <dd>{settings.showScore ? t('sessions.yes') : t('sessions.no')}</dd>
      <dt>{t('sessions.email')}</dt>
      <dd>{t(EMAIL[settings.email])}</dd>
    </dl>
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.45rem 1rem;
    margin: 0;
    font-size: 0.9rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
  }
</style>
