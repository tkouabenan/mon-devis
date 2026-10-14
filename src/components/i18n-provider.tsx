'use client';

import * as React from 'react';
import { DEFAULT_LOCALE, intlLocale, type Locale } from '@/lib/i18n';
import { translate } from '@/lib/i18n/dictionaries';

interface I18nContextValue {
  locale: Locale;
  intlLocale: string;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const I18nContext = React.createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  intlLocale: 'fr-FR',
  t: (key) => translate(DEFAULT_LOCALE, key),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      intlLocale: intlLocale(locale),
      t: (key, variables) => translate(locale, key, variables),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook de traduction côté client. */
export function useT() {
  const context = React.useContext(I18nContext);
  return { t: context.t, locale: context.locale, intlLocale: context.intlLocale };
}
