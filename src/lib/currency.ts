/**
 * Devises supportées par MON DEVIS.
 * Les taux de change ne sont jamais appliqués automatiquement : les statistiques
 * sont toujours regroupées par devise (voir docs/CALCULS.md).
 */

export interface CurrencyDefinition {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Devise par défaut pour ces pays (ISO 3166-1 alpha-2). */
  countries?: string[];
}

export const CURRENCIES: CurrencyDefinition[] = [
  { code: 'XOF', name: 'Franc CFA (UEMOA)', symbol: 'FCFA', decimals: 0, countries: ['CI', 'SN', 'BF', 'ML', 'NE', 'TG', 'BJ', 'GW'] },
  { code: 'XAF', name: 'Franc CFA (CEMAC)', symbol: 'FCFA', decimals: 0, countries: ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'] },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, countries: ['FR', 'BE', 'LU', 'DE', 'ES', 'IT', 'PT', 'NL', 'IE', 'AT', 'FI', 'GR'] },
  { code: 'USD', name: 'Dollar américain', symbol: '$', decimals: 2, countries: ['US'] },
  { code: 'GBP', name: 'Livre sterling', symbol: '£', decimals: 2, countries: ['GB'] },
  { code: 'CAD', name: 'Dollar canadien', symbol: 'CA$', decimals: 2, countries: ['CA'] },
  { code: 'CHF', name: 'Franc suisse', symbol: 'CHF', decimals: 2, countries: ['CH'] },
  { code: 'MAD', name: 'Dirham marocain', symbol: 'MAD', decimals: 2, countries: ['MA'] },
  { code: 'DZD', name: 'Dinar algérien', symbol: 'DZD', decimals: 2, countries: ['DZ'] },
  { code: 'TND', name: 'Dinar tunisien', symbol: 'TND', decimals: 3, countries: ['TN'] },
  { code: 'NGN', name: 'Naira nigérian', symbol: '₦', decimals: 2, countries: ['NG'] },
  { code: 'GHS', name: 'Cedi ghanéen', symbol: 'GH₵', decimals: 2, countries: ['GH'] },
  { code: 'CDF', name: 'Franc congolais', symbol: 'FC', decimals: 2, countries: ['CD'] },
  { code: 'AED', name: 'Dirham des Émirats', symbol: 'AED', decimals: 2, countries: ['AE'] },
  { code: 'SAR', name: 'Riyal saoudien', symbol: 'SAR', decimals: 2, countries: ['SA'] },
  { code: 'ZAR', name: 'Rand sud-africain', symbol: 'R', decimals: 2, countries: ['ZA'] },
  { code: 'JPY', name: 'Yen japonais', symbol: '¥', decimals: 0, countries: ['JP'] },
  { code: 'CNY', name: 'Yuan chinois', symbol: 'CN¥', decimals: 2, countries: ['CN'] },
  { code: 'BRL', name: 'Réal brésilien', symbol: 'R$', decimals: 2, countries: ['BR'] },
  { code: 'INR', name: 'Roupie indienne', symbol: '₹', decimals: 2, countries: ['IN'] },
];

export const DEFAULT_CURRENCY = 'XOF';

const currencyMap = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function getCurrency(code: string | null | undefined): CurrencyDefinition {
  if (!code) return currencyMap.get(DEFAULT_CURRENCY)!;
  return currencyMap.get(code.toUpperCase()) ?? { code: code.toUpperCase(), name: code.toUpperCase(), symbol: code.toUpperCase(), decimals: 2 };
}

export function currencyDecimals(code: string | null | undefined): number {
  return getCurrency(code).decimals;
}

/** Devise recommandée pour un pays donné (XOF par défaut en Côte d'Ivoire). */
export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return DEFAULT_CURRENCY;
  const normalized = countryCode.toUpperCase();
  const match = CURRENCIES.find((currency) => currency.countries?.includes(normalized));
  return match?.code ?? 'USD';
}

/**
 * Formate un montant avec la devise et la locale demandées.
 * Exemple : formatCurrency(1250000, 'XOF', 'fr-FR') → « 1 250 000 FCFA ».
 */
export function formatCurrency(
  amount: number | string,
  currencyCode = DEFAULT_CURRENCY,
  locale = 'fr-FR',
  options: { compact?: boolean; showSymbol?: boolean } = {},
): string {
  const currency = getCurrency(currencyCode);
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const decimals = options.compact ? 0 : currency.decimals;

  try {
    const formatted = new Intl.NumberFormat(options.compact ? `${locale}-u-nu-latn` : locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: options.compact ? 'compact' : 'standard',
      compactDisplay: 'short',
    }).format(safe);
    if (options.compact) return `${formatted} ${currency.symbol}`;
    if (options.showSymbol === false) return formatted;
    // Normalise l'affichage du franc CFA : « F CFA » → « FCFA ».
    return `${formatted} ${currency.symbol}`.replace(/\s?F\s?CFA/g, ' FCFA');
  } catch {
    return `${safe.toFixed(decimals)} ${currency.symbol}`;
  }
}

/** Formate un nombre (quantités, taux) sans devise. */
export function formatNumber(value: number | string, locale = 'fr-FR', decimals = 2): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function formatPercent(value: number | string, locale = 'fr-FR', decimals = 1): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    style: 'percent',
  }).format(safe / 100);
}
