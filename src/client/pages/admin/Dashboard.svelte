<script lang="ts">
  import AdminHeader from '../../components/AdminHeader.svelte';
  import { t } from '../../lib/i18n.svelte.ts';
</script>

<AdminHeader />

<main class="container stack">
  <h1>{t('admin.quizzes')}</h1>
  <div class="card">
    <p class="muted">{t('admin.noQuizzes')}</p>
  </div>
</main>
