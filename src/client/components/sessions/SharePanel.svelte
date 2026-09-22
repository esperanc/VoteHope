<script lang="ts">
  // How students get in: QR code, code and link, plus a full-screen view for the projector.
  import type { SessionDetail } from '../../../shared/session.ts';
  import { formatCode } from '../../lib/format.ts';
  import { t } from '../../lib/i18n.svelte.ts';
  import Icon from '../Icon.svelte';

  let { session }: { session: SessionDetail } = $props();

  let large = $state(false);
  let copied = $state(false);
  let linkInput: HTMLInputElement;
  let overlay = $state<HTMLButtonElement | undefined>(undefined);
  /** Where the keyboard goes back to once the large view closes. */
  let opener: HTMLElement | null = null;

  const qrUrl = $derived(`/api/admin/sessions/${session.id}/qr.svg`);
  const unreachable = $derived(/^https?:\/\/(localhost|127\.|\[::1\])/.test(session.joinUrl));

  async function copy() {
    try {
      await navigator.clipboard.writeText(session.joinUrl);
    } catch {
      // The clipboard API needs HTTPS; plain-HTTP pages (e.g. a LAN address) fall back to this.
      linkInput.select();
      document.execCommand('copy');
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function showLarge(event: MouseEvent) {
    opener = event.currentTarget as HTMLElement;
    large = true;
  }

  function closeLarge() {
    large = false;
    opener?.focus();
    opener = null;
  }

  function onkeydown(event: KeyboardEvent) {
    if (large && event.key === 'Escape') closeLarge();
  }

  // The large view is itself the button that closes it, so focusing it puts the
  // keyboard where Enter, Space and Esc all do the expected thing.
  $effect(() => {
    if (large) overlay?.focus();
  });
</script>

<svelte:window {onkeydown} />

<section class="card stack">
  <h2>{t('share.title')}</h2>
  <div class="content">
    <button type="button" class="qr" title={t('share.showLarge')} onclick={showLarge}>
      <img src={qrUrl} alt={t('share.qrAlt')} />
    </button>
    <div class="details">
      <p class="muted small">{t('share.instructions')}</p>
      <p class="code"><span class="label">{t('share.code')}</span> {formatCode(session.code)}</p>
      <div class="link">
        <input bind:this={linkInput} readonly value={session.joinUrl} aria-label={t('share.copy')} onfocus={(event) => event.currentTarget.select()} />
        <button type="button" class="btn" onclick={copy}>
          <Icon name="copy" size={16} />
          {copied ? t('share.copied') : t('share.copy')}
        </button>
      </div>
      <button type="button" class="btn" onclick={showLarge}>
        <Icon name="maximize" size={16} />
        {t('share.showLarge')}
      </button>
    </div>
  </div>
  {#if unreachable}
    <p class="warning small">{t('share.localhostWarning')}</p>
  {/if}
</section>

{#if large}
  <button type="button" class="overlay" bind:this={overlay} aria-label={t('share.closeLarge')} onclick={closeLarge}>
    <img src={qrUrl} alt="" />
    <span class="big-code">{formatCode(session.code)}</span>
    <span class="big-url">{session.joinUrl}</span>
    <span class="hint">{t('share.closeLarge')}</span>
  </button>
{/if}

<style>
  .content {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
  }

  .qr {
    flex: none;
    padding: 0.5rem;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: zoom-in;
  }

  .qr img {
    display: block;
    width: 170px;
    height: 170px;
  }

  .details {
    flex: 1 1 15rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .code {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .label {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .link {
    display: flex;
    gap: 0.4rem;
    width: 100%;
  }

  .link input {
    flex: 1;
    min-width: 0;
    font-size: 0.9rem;
  }

  .warning {
    padding: 0.6rem 0.8rem;
    color: var(--warning);
    background: var(--warning-bg);
    border-radius: 8px;
  }

  /* Full-screen view for the projector: always dark on white, like the QR code itself. */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    width: 100%;
    padding: 2rem;
    font: inherit;
    color: #101417;
    background: #fff;
    border: 0;
    cursor: zoom-out;
  }

  .overlay img {
    width: min(62vh, 85vw);
    height: min(62vh, 85vw);
  }

  .big-code {
    font-size: clamp(2.5rem, 9vh, 6rem);
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
  }

  .big-url {
    font-size: clamp(1rem, 3vh, 1.8rem);
  }

  .hint {
    font-size: 0.85rem;
    color: #5d6873;
  }
</style>
