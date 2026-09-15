/**
 * CSV text with a byte-order mark, so Excel reads accents correctly. Cells that a
 * spreadsheet would run as formulas (e.g. a name typed as "=HYPERLINK(…)") are
 * prefixed with an apostrophe.
 */
export function toCsv(rows: string[][], separator: ',' | ';'): string {
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",;\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return `﻿${rows.map((row) => row.map(cell).join(separator)).join('\r\n')}\r\n`;
}

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
