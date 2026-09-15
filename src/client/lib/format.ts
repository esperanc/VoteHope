/** "482913" → "482 913", easier to read aloud and to type. */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local time in the format of <input type="datetime-local">, e.g. "2026-09-15T14:05". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a datetime-local input (local time) as an ISO timestamp, or null if empty. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "2026-09-15 14:05" in local time, which spreadsheets recognize as a date. */
export function spreadsheetTime(iso: string | null): string {
  return iso ? toLocalInput(iso).replace('T', ' ') : '';
}
