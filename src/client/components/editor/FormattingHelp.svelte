<script lang="ts">
  import { t } from '../../lib/i18n.svelte.ts';
  import Markdown from '../Markdown.svelte';

  const examples = $derived([
    t('editor.help.bold'),
    t('editor.help.italic'),
    '$x^2 + \\sqrt{y}$',
    '$$\\int_0^1 x\\,dx = \\frac{1}{2}$$',
    t('editor.help.list'),
    '`f(x) = 2x`',
  ]);
</script>

<details class="help">
  <summary>{t('editor.formattingHelp')}</summary>
  <table>
    <thead>
      <tr>
        <th>{t('editor.help.youType')}</th>
        <th>{t('editor.help.studentsSee')}</th>
      </tr>
    </thead>
    <tbody>
      {#each examples as source (source)}
        <tr>
          <td><code>{source}</code></td>
          <td><Markdown {source} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="muted">{t('editor.help.images')}</p>
</details>

<style>
  .help {
    font-size: 0.85rem;
  }

  summary {
    width: fit-content;
    color: var(--accent);
    cursor: pointer;
  }

  table {
    width: 100%;
    margin: 0.6rem 0;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-weight: 600;
    color: var(--muted);
  }

  th,
  td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  code {
    white-space: pre;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
