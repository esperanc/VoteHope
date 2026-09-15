<script lang="ts">
  import { logout } from '../lib/auth.svelte.ts';
  import { t } from '../lib/i18n.svelte.ts';
  import { router } from '../lib/router.svelte.ts';
  import LanguageSwitch from './LanguageSwitch.svelte';

  const inSessions = $derived(router.path.startsWith('/admin/sessions') || router.path.endsWith('/sessions'));
</script>

<header class="topbar">
  <div class="left">
    <a class="brand" href="/admin">Vote<span>Hope</span></a>
    <nav>
      <a href="/admin" aria-current={inSessions ? undefined : 'page'}>{t('admin.quizzes')}</a>
      <a href="/admin/sessions" aria-current={inSessions ? 'page' : undefined}>{t('admin.sessions')}</a>
    </nav>
  </div>
  <div class="actions">
    <LanguageSwitch />
    <button type="button" class="btn" onclick={logout}>{t('admin.logout')}</button>
  </div>
</header>

<style>
  .left,
  .actions,
  nav {
    display: flex;
    align-items: center;
  }

  .left {
    gap: 1.5rem;
  }

  .actions {
    gap: 0.75rem;
  }

  nav {
    gap: 0.25rem;
  }

  nav a {
    padding: 0.35rem 0.6rem;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
    border-radius: 6px;
  }

  nav a:hover {
    color: var(--text);
    background: var(--hover);
  }

  nav a[aria-current='page'] {
    color: var(--text);
    background: var(--hover);
  }

  @media (max-width: 560px) {
    .left {
      gap: 0.5rem;
    }

    .brand {
      display: none;
    }
  }
</style>
