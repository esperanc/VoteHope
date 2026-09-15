<script lang="ts">
  import { SESSION_LIMITS, type JoinInfo } from '../../../shared/session.ts';
  import { api, ApiError } from '../../lib/api.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import Notice from './Notice.svelte';

  let { info, onjoined }: { info: JoinInfo; onjoined: (token: string) => Promise<void> } = $props();

  const ERRORS: Record<string, MessageKey> = {
    name_taken: 'student.nameTaken',
    invalid_name: 'student.invalidName',
    email_required: 'student.emailRequired',
    invalid_email: 'student.invalidEmail',
    closed: 'student.closed',
    not_open: 'student.closed',
  };

  let name = $state('');
  let email = $state('');
  let busy = $state(false);
  let error = $state<MessageKey | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      const { token } = await api<{ token: string }>('POST', `/api/join/${info.code}`, { name, email });
      await onjoined(token);
    } catch (err) {
      const known = err instanceof ApiError ? ERRORS[err.code] : undefined;
      error = known ?? (err instanceof ApiError && err.status === 0 ? 'error.network' : 'error.unexpected');
    } finally {
      busy = false;
    }
  }
</script>

<div class="card stack">
  <h1>{info.title.trim() || t('quiz.untitled')}</h1>
  {#if info.state === 'open'}
    <form class="stack" onsubmit={submit}>
      <div>
        <label for="name">{t('student.name')}</label>
        <input id="name" autocomplete="name" maxlength={SESSION_LIMITS.nameLength} required bind:value={name} />
      </div>
      {#if info.email !== 'hidden'}
        <div>
          <label for="email">{info.email === 'required' ? t('student.email') : t('student.emailOptional')}</label>
          <input
            id="email"
            type="email"
            autocomplete="email"
            maxlength={SESSION_LIMITS.emailLength}
            required={info.email === 'required'}
            bind:value={email}
          />
        </div>
      {/if}
      {#if error}
        <p class="error" role="alert">{t(error)}</p>
      {/if}
      <button class="btn btn-primary btn-block big" type="submit" disabled={busy}>{t('student.join')}</button>
    </form>
  {:else}
    <Notice {info} />
  {/if}
</div>
