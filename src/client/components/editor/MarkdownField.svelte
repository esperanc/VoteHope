<script lang="ts">
  // Text box for Markdown + formulas, with image upload by button, paste or drag-and-drop.
  import { tick } from 'svelte';
  import { upload } from '../../lib/api.ts';
  import { t } from '../../lib/i18n.svelte.ts';
  import Icon from '../Icon.svelte';

  let {
    value = $bindable(''),
    id,
    label,
    placeholder = '',
    rows = 3,
    maxlength,
    compact = false,
  }: {
    value: string;
    id?: string;
    label?: string;
    placeholder?: string;
    rows?: number;
    maxlength?: number;
    /** Small icon buttons beside the box instead of a toolbar (used for options). */
    compact?: boolean;
  } = $props();

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let uploading = $state(0);
  let uploadFailed = $state(false);
  let dragging = $state(false);

  async function select(start: number, end = start) {
    await tick();
    textarea.focus();
    textarea.setSelectionRange(start, end);
  }

  function insertFormula() {
    const { selectionStart: start, selectionEnd: end } = textarea;
    const selected = value.slice(start, end);
    value = `${value.slice(0, start)}$${selected}$${value.slice(end)}`;
    select(start + 1, start + 1 + selected.length);
  }

  async function uploadImages(files: File[], at = textarea.selectionEnd) {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    uploadFailed = false;
    uploading++;
    let position = at;
    try {
      for (const file of images) {
        const { url } = await upload<{ url: string }>('/api/admin/images', file);
        const alt = file.name.replace(/\.[^.]*$/, '').replace(/[[\]]/g, '') || 'image';
        position = Math.min(position, value.length);
        // In question text an image gets its own line; options stay on one line.
        const before = !compact && position > 0 && value[position - 1] !== '\n' ? '\n' : '';
        const after = !compact && position < value.length && value[position] !== '\n' ? '\n' : '';
        const markdown = `${before}![${alt}](${url})${after}`;
        value = value.slice(0, position) + markdown + value.slice(position);
        position += markdown.length;
      }
      select(position);
    } catch {
      uploadFailed = true;
    } finally {
      uploading--;
    }
  }

  function onpaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault();
      uploadImages(files);
    }
  }

  function ondragover(event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragging = true;
  }

  function ondrop(event: DragEvent) {
    dragging = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    uploadImages(files);
  }

  function onfilechange() {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    uploadImages(files);
  }
</script>

<div class="field" class:compact class:dragging>
  {#if !compact}
    <div class="head">
      {#if label}<label for={id}>{label}</label>{/if}
      <div class="tools">
        <button type="button" class="tool" onclick={() => fileInput.click()}>
          <Icon name="image" size={15} />
          {t('editor.image')}
        </button>
        <button type="button" class="tool" onclick={insertFormula}>
          <Icon name="sigma" size={15} />
          {t('editor.formula')}
        </button>
      </div>
    </div>
  {/if}
  <div class="box">
    <textarea
      bind:this={textarea}
      bind:value
      {id}
      {placeholder}
      {maxlength}
      rows={compact ? 1 : rows}
      style:min-height={compact ? undefined : `${rows * 1.45 + 1.4}em`}
      {onpaste}
      {ondragover}
      ondragleave={() => (dragging = false)}
      {ondrop}
    ></textarea>
    {#if compact}
      <button type="button" class="icon-btn" title={t('editor.insertImage')} aria-label={t('editor.insertImage')} onclick={() => fileInput.click()}>
        <Icon name="image" size={16} />
      </button>
      <button type="button" class="icon-btn" title={t('editor.insertFormula')} aria-label={t('editor.insertFormula')} onclick={insertFormula}>
        <Icon name="sigma" size={16} />
      </button>
    {/if}
  </div>
  <input type="file" accept="image/*" multiple hidden bind:this={fileInput} onchange={onfilechange} />
  {#if uploading > 0}
    <p class="status" aria-live="polite">{t('editor.uploading')}</p>
  {/if}
  {#if uploadFailed}
    <p class="error small" role="alert">{t('editor.uploadFailed')}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .head label {
    margin: 0;
  }

  .tools {
    display: flex;
    gap: 0.3rem;
  }

  .tool {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.55rem;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .tool:hover {
    color: var(--text);
    border-color: var(--muted);
  }

  .box {
    display: flex;
    align-items: flex-start;
    gap: 0.15rem;
  }

  textarea {
    flex: 1;
    min-width: 0;
    line-height: 1.45;
    resize: vertical;
    field-sizing: content;
    max-height: 40rem;
  }

  .compact textarea {
    padding: 0.5rem 0.7rem;
    resize: none;
  }

  .dragging textarea {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .status {
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
