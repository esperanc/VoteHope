<script lang="ts">
  import { logout } from '../lib/auth.svelte.ts';
  import { t } from '../lib/i18n.svelte.ts';
  import LanguageSwitch from './LanguageSwitch.svelte';
</script>

<header class="topbar">
  <a class="brand" href="/admin">Vote<span>Hope</span></a>
  <div class="actions">
    <LanguageSwitch />
    <button type="button" class="btn" onclick={logout}>{t('admin.logout')}</button>
  </div>
</header>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
</style>
