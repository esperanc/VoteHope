import en from '../i18n/en.ts';
import pt from '../i18n/pt.ts';

export type MessageKey = keyof typeof en;
export const LOCALES = ['pt', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, pt };
const STORAGE_KEY = 'votehope.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export const i18n = $state<{ locale: Locale }>({ locale: initialLocale() });
document.documentElement.lang = i18n.locale;

export function setLocale(locale: Locale): void {
  i18n.locale = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not critical: the choice just won't be remembered.
  }
}

/** Translates a key; `{name}` placeholders are replaced from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = dictionaries[i18n.locale][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
