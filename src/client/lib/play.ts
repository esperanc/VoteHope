// A student's secret token for a session is kept in this browser, so reloading
// the page or reopening it later continues the same attempt.
import type { PlayState } from '../../shared/session.ts';
import { api } from './api.ts';

// Fallback when storage is unavailable; then the token lasts until the page closes.
const memory = new Map<string, string>();
const storageKey = (code: string) => `votehope.participant.${code}`;

export function savedToken(code: string): string | null {
  try {
    return localStorage.getItem(storageKey(code)) ?? memory.get(code) ?? null;
  } catch {
    return memory.get(code) ?? null;
  }
}

export function saveToken(code: string, token: string): void {
  memory.set(code, token);
  try {
    localStorage.setItem(storageKey(code), token);
  } catch {
    // Kept in memory only.
  }
}

export function forgetToken(code: string): void {
  memory.delete(code);
  try {
    localStorage.removeItem(storageKey(code));
  } catch {
    // Nothing stored.
  }
}

/** Calls a student endpoint of this session with the stored token. */
export function playApi<T = PlayState>(method: 'GET' | 'POST' | 'PUT', code: string, path = '', body?: unknown): Promise<T> {
  return api<T>(method, `/api/play/${code}${path}`, body, { authorization: `Bearer ${savedToken(code) ?? ''}` });
}
