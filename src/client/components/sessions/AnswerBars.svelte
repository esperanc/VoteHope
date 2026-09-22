<script lang="ts">
  // How many chose each option. It is a single series, so every bar shares the
  // accent color; with `correct`, the correct options keep it (plus a check label)
  // while the others turn gray. Values sit at the bar tips, in text colors.
  import { t } from '../../lib/i18n.svelte.ts';
  import { LETTERS, percent } from '../../lib/results.ts';
  import Icon from '../Icon.svelte';
  import Markdown from '../Markdown.svelte';

  let {
    options,
    counts,
    responses,
    correct,
    letters = true,
    large = false,
  }: {
    options: { id: string; body: string }[];
    counts: Record<string, number>;
    /** Students who answered; percentages are of these. */
    responses: number;
    correct?: Set<string>;
    letters?: boolean;
    /** Sizes for the projector. */
    large?: boolean;
  } = $props();
</script>

<ul class="bars" class:large>
  {#each options as option, i (option.id)}
    {@const count = counts[option.id] ?? 0}
    {@const share = percent(count, responses)}
    <li class:dim={correct !== undefined && !correct.has(option.id)} title={`${letters ? `${LETTERS[i]}: ` : ''}${count} (${share}%)`}>
      <div class="label">
        {#if letters}<span class="letter">{LETTERS[i]}</span>{/if}
        <div class="text"><Markdown source={option.body} /></div>
        {#if correct?.has(option.id)}
          <span class="correct"><Icon name="check" size={14} />{t('results.correctOption')}</span>
        {/if}
      </div>
      <div class="track" class:indent={letters}>
        <span class="bar" style:width={`calc((100% - 6.5rem) * ${share / 100})`}></span>
        <span class="value">{count} · {share}%</span>
      </div>
    </li>
  {/each}
</ul>

<style>
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .letter {
    flex: none;
    width: 1.4rem;
    font-weight: 700;
    color: var(--muted);
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .correct {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .correct :global(svg) {
    color: var(--accent);
  }

  .track {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  .track.indent {
    padding-left: 1.9rem;
  }

  /* Thin, square at the baseline, rounded at the data end. */
  .bar {
    flex: none;
    height: 12px;
    background: var(--accent);
    border-radius: 0 4px 4px 0;
  }

  .dim .bar {
    background: var(--chart-muted);
  }

  .value {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--muted);
  }

  .large {
    gap: 1.2rem;
  }

  .large .label {
    font-size: clamp(1.1rem, 1.9vw, 1.6rem);
  }

  .large .bar {
    height: 22px;
  }

  .large .value {
    font-size: clamp(1rem, 1.5vw, 1.25rem);
    font-weight: 600;
    color: var(--text);
  }

  /* The counts are written beside every bar, so nothing is lost if the bars go;
     in Windows high contrast they need a system color to stay visible at all. */
  @media (forced-colors: active) {
    .bar {
      background: CanvasText;
    }

    .dim .bar {
      background: GrayText;
    }
  }
</style>
