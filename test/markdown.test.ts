// @vitest-environment jsdom
// (DOMPurify silently disables itself under happy-dom, which would hide sanitizing bugs.)
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/client/lib/markdown.ts';

describe('renderMarkdown', () => {
  it('renders inline and display formulas with KaTeX', () => {
    const html = renderMarkdown('Solve $x^2 = 4$.\n\n$$\\int_0^1 x\\,dx$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
  });

  it('shows a formula error instead of failing', () => {
    expect(renderMarkdown('$\\frac{1}{$')).toContain('katex-error');
  });

  it('escapes raw HTML', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses javascript: links', () => {
    expect(renderMarkdown('[click](javascript:alert(1))')).not.toMatch(/href="javascript/i);
  });

  it('keeps images and opens links in a new tab', () => {
    const html = renderMarkdown('![graph](/media/abc.webp) see https://example.org');
    expect(html).toContain('<img src="/media/abc.webp" alt="graph">');
    expect(html).toMatch(/<a href="https:\/\/example.org"[^>]*target="_blank"/);
  });

  it('keeps single line breaks', () => {
    expect(renderMarkdown('line one\nline two')).toContain('<br>');
  });
});
