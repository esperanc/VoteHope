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

type Params = Record<string, string | number>;

/** Translates a key; `{name}` placeholders are replaced from `params`. */
export function t(key: MessageKey, params?: Params): string {
  const text = dictionaries[i18n.locale][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Keys that have `.one` and `.other` variants. */
type PluralKey = { [K in MessageKey]: K extends `${infer Base}.one` ? Base : never }[MessageKey];

/** Translates a count: `{base}.one` for 1, `{base}.other` otherwise; `{count}` is filled in. */
export function tn(base: PluralKey, count: number, params?: Params): string {
  return t(`${base}.${count === 1 ? 'one' : 'other'}` as MessageKey, { count, ...params });
}

const intlLocale = () => (i18n.locale === 'pt' ? 'pt-BR' : 'en');

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(intlLocale(), { timeStyle: 'medium' }).format(date);
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(value);
}
