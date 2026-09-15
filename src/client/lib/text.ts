const IMAGES = /!\[[^\]]*\]\([^)]*\)/g;

/** Question text reduced to plain words, for one-line previews. */
export function plainText(markdown: string): string {
  return markdown
    .replace(IMAGES, ' ')
    .replace(/[*_`#>$\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A short label for a question in lists: its words, or `imageLabel` if it is only an image. */
export function snippet(markdown: string, imageLabel: string): string {
  return plainText(markdown) || (/!\[[^\]]*\]\([^)]*\)/.test(markdown) ? imageLabel : '');
}
