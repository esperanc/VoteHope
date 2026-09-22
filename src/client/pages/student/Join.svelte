<script lang="ts">
  // The student's side of a session: join, then either take a self-paced quiz
  // or follow a live one.
  import type { JoinInfo, PlayState } from '../../../shared/session.ts';
  import LanguageSwitch from '../../components/LanguageSwitch.svelte';
  import Attempt from '../../components/student/Attempt.svelte';
  import Finished from '../../components/student/Finished.svelte';
  import Intro from '../../components/student/Intro.svelte';
  import JoinForm from '../../components/student/JoinForm.svelte';
  import Live, { type LeaveReason } from '../../components/student/Live.svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { forgetToken, playApi, savedToken, saveToken } from '../../lib/play.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  let info = $state<JoinInfo | null>(null);
  let play = $state<PlayState | null>(null);
  /** Following a live session (joined, with a token). */
  let live = $state(false);
  /** Server clock minus this device's clock (self-paced). */
  let offset = $state(0);
  let error = $state<MessageKey | null>(null);
  let notice = $state<MessageKey | null>(null);

  const code = () => params.code ?? '';
  const errorFor = (err: unknown): MessageKey =>
    err instanceof ApiError && err.status === 404 ? 'student.notFound' : 'error.network';

  function show(state: PlayState) {
    offset = state.serverNow - Date.now();
    play = state;
  }

  async function load() {
    try {
      info = await api<JoinInfo>('GET', `/api/join/${code()}`);
    } catch (err) {
      error = errorFor(err);
      return;
    }
    if (!savedToken(code())) return;
    if (info.mode === 'sync') {
      live = true;
      return;
    }
    try {
      show(await playApi('GET', code()));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) forgetToken(code()); // e.g. the presenter deleted this attempt
      else error = errorFor(err);
    }
  }
  load();

  async function joined(token: string) {
    saveToken(code(), token);
    notice = null;
    if (info?.mode === 'sync') live = true;
    else show(await playApi('GET', code()));
  }

  function left(reason: LeaveReason) {
    forgetToken(code());
    live = false;
    if (reason === 'not_found') error = 'student.notFound';
    else if (reason === 'removed') notice = 'live.removed';
  }
</script>

<div class="student">
  <header class="top">
    <span class="brand">Vote<span>Hope</span></span>
    <LanguageSwitch />
  </header>
  <main>
    {#if error}
      <div class="card stack">
        <p>{t(error)}</p>
        <a href="/">{t('student.backHome')}</a>
      </div>
    {:else if live}
      <Live code={code()} onleave={left} />
    {:else if play}
      {#if play.status === 'finished'}
        <Finished {play} />
      {:else if play.status === 'in_progress'}
        <Attempt {play} {offset} code={code()} onstate={show} />
      {:else}
        <Intro {play} onstate={show} />
      {/if}
    {:else if info}
      {#if notice}
        <p class="notice" role="status">{t(notice)}</p>
      {/if}
      <JoinForm {info} onjoined={joined} />
    {:else}
      <p class="muted">{t('common.loading')}</p>
    {/if}
  </main>
</div>

<style>
  .student {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
  }

  main {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 0.25rem 1rem 2.5rem;
  }

  .notice {
    margin-bottom: 0.9rem;
    padding: 0.7rem 0.9rem;
    font-weight: 600;
    color: var(--warning);
    background: var(--warning-bg);
    border-radius: 8px;
  }
</style>
