import Decimal from 'decimal.js';

/**
 * Arithmétique financière sûre.
 * Tous les calculs monétaires de MON DEVIS passent par Decimal.js afin d'éviter
 * les erreurs d'arrondi des nombres flottants (0.1 + 0.2 !== 0.3).
 *
 * Règles d'arrondi documentées (voir docs/CALCULS.md) :
 *  - arrondi commercial (half-up) à 2 décimales sur chaque montant monétaire ;
 *  - les quantités et prix unitaires conservent jusqu'à 4 décimales ;
 *  - les taux (remises, TVA) acceptent jusqu'à 4 décimales.
 */

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9, toExpPos: 20 });

export type DecimalInput = Decimal | Decimal.Value | null | undefined;

export const MONEY_SCALE = 2;
export const RATE_SCALE = 4;

/** Convertit une entrée quelconque en Decimal non-nul (0 par défaut). */
export function dec(value: DecimalInput): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    return new Decimal(value as Decimal.Value);
  } catch {
    return new Decimal(0);
  }
}

/** Arrondit un montant monétaire à 2 décimales (half-up). */
export function money(value: DecimalInput): Decimal {
  return dec(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Arrondit un taux ou une quantité à 4 décimales (half-up). */
export function rate(value: DecimalInput): Decimal {
  return dec(value).toDecimalPlaces(RATE_SCALE, Decimal.ROUND_HALF_UP);
}

/** Valeur numérique (number) sûre pour le stockage Prisma `Decimal`. */
export function toNumberString(value: DecimalInput, scale = MONEY_SCALE): string {
  return dec(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

export function toMoneyString(value: DecimalInput): string {
  return toNumberString(value, MONEY_SCALE);
}

export function toAmountNumber(value: DecimalInput): number {
  return money(value).toNumber();
}

/** Somme d'un ensemble de valeurs décimales. */
export function sum(values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.plus(dec(value)), new Decimal(0));
}

export function percentOf(base: DecimalInput, percentage: DecimalInput): Decimal {
  return dec(base).times(dec(percentage)).dividedBy(100);
}

/** Applique une remise (pourcentage ou montant fixe) sans jamais dépasser la base. */
export function applyDiscount(
  base: DecimalInput,
  type: 'PERCENTAGE' | 'FIXED' | null | undefined,
  value: DecimalInput,
): Decimal {
  const baseDecimal = dec(base);
  if (!type || baseDecimal.lte(0)) return new Decimal(0);
  const discount = type === 'PERCENTAGE' ? percentOf(baseDecimal, value) : dec(value);
  if (discount.lte(0)) return new Decimal(0);
  return money(Decimal.min(discount, baseDecimal));
}

/** Taux de conversion (quotient) protégé contre la division par zéro. */
export function safeDivide(numerator: DecimalInput, denominator: DecimalInput, fallback: DecimalInput = 0): Decimal {
  const den = dec(denominator);
  if (den.isZero()) return dec(fallback);
  return dec(numerator).dividedBy(den);
}

export function clampPercent(value: DecimalInput, min = 0, max = 100): Decimal {
  return Decimal.min(Decimal.max(dec(value), min), max);
}

export function isPositive(value: DecimalInput): boolean {
  return dec(value).gt(0);
}

export { Decimal };
