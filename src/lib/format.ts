/**
 * Helpers de formatage partagés (serveur et client).
 * Ce module ne dépend d'aucun module Node : il est importable partout.
 */
export { formatCurrency, formatNumber, formatPercent, getCurrency, CURRENCIES, currencyForCountry } from './currency';
export { formatDate, formatDateTime, formatDateShort, formatRelative, daysUntil, initials, truncate, slugify, cn } from './utils';
