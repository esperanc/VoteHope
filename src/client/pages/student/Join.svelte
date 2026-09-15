<script lang="ts">
  // The student's side of a session: join, start, answer, finish.
  import type { JoinInfo, PlayState } from '../../../shared/session.ts';
  import LanguageSwitch from '../../components/LanguageSwitch.svelte';
  import Attempt from '../../components/student/Attempt.svelte';
  import Finished from '../../components/student/Finished.svelte';
  import Intro from '../../components/student/Intro.svelte';
  import JoinForm from '../../components/student/JoinForm.svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { t, type MessageKey } from '../../lib/i18n.svelte.ts';
  import { forgetToken, playApi, savedToken, saveToken } from '../../lib/play.ts';
  import type { PageParams } from '../../routes.ts';

  let { params }: { params: PageParams } = $props();

  let info = $state<JoinInfo | null>(null);
  let play = $state<PlayState | null>(null);
  /** Server clock minus this device's clock. */
  let offset = $state(0);
  let error = $state<MessageKey | null>(null);

  const code = () => params.code ?? '';
  const errorFor = (err: unknown): MessageKey =>
    err instanceof ApiError && err.status === 404 ? 'student.notFound' : 'error.network';

  function show(state: PlayState) {
    offset = state.serverNow - Date.now();
    play = state;
  }

  async function load() {
    if (savedToken(code())) {
      try {
        show(await playApi('GET', code()));
        return;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) {
          error = errorFor(err);
          return;
        }
        forgetToken(code()); // e.g. the presenter deleted this attempt
      }
    }
    try {
      info = await api<JoinInfo>('GET', `/api/join/${code()}`);
    } catch (err) {
      error = errorFor(err);
    }
  }
  load();

  async function joined(token: string) {
    saveToken(code(), token);
    show(await playApi('GET', code()));
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
    {:else if play}
      {#if play.status === 'finished'}
        <Finished {play} />
      {:else if play.status === 'in_progress'}
        <Attempt {play} {offset} code={code()} onstate={show} />
      {:else}
        <Intro {play} onstate={show} />
      {/if}
    {:else if info}
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
</style>
