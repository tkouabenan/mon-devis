/**
 * Architecture multilingue.
 *
 * Le français est la langue par défaut de la plateforme. Les textes sont
 * centralisés dans des dictionnaires indexés par clé (« nav.dashboard ») :
 * ajouter une langue consiste à fournir un nouveau fichier de traduction,
 * sans modifier les composants.
 *
 * La résolution de la locale suit cet ordre : préférence utilisateur (base de
 * données) → cookie → en-tête `Accept-Language` → français.
 */

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && (SUPPORTED_LOCALES as readonly string[]).includes(value));
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const base = value.toLowerCase().split('-')[0]!;
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

/** Résout la locale à partir de l'en-tête HTTP Accept-Language. */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(',')
    .map((part) => part.split(';')[0]!.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (isSupportedLocale(normalizeLocale(candidate))) {
      const normalized = normalizeLocale(candidate);
      if (normalized !== DEFAULT_LOCALE) return normalized;
      return DEFAULT_LOCALE;
    }
  }
  return DEFAULT_LOCALE;
}

/** Formate une date selon la locale (locale ICU complète). */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : 'fr-FR';
}
