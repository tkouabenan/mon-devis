/**
 * Moteur de calcul des devis — source unique de vérité.
 *
 * Le même module est utilisé par :
 *  - l'éditeur de devis (aperçu temps réel côté client) ;
 *  - les actions serveur (enregistrement en base) ;
 *  - les exports PDF / DOCX / XLSX ;
 *  - les statistiques.
 *
 * Ainsi, les montants affichés, stockés et exportés sont toujours identiques.
 *
 * Règles (voir docs/CALCULS.md) :
 *  1. brut de ligne       = quantité × prix unitaire
 *  2. remise de ligne     = pourcentage du brut, ou montant fixe (plafonné au brut)
 *  3. net de ligne        = brut − remise de ligne
 *  4. sous-total          = Σ brut des lignes
 *  5. remise globale      = pourcentage du net total, ou montant fixe (plafonné)
 *  6. remise globale répartie au prorata du net de chaque ligne
 *  7. mode HT (prix saisis hors taxes) : base imposable = net − quote-part remise globale
 *     mode TTC (prix saisis taxes comprises) : le net TTC est désimposé pour retrouver la base HT
 *  8. total               = base imposable + TVA
 *  9. acompte             = montant demandé à la commande ; reste à payer = total − acompte (min. 0)
 */

import { Decimal, dec, money, rate, safeDivide } from './money';

export type DiscountKind = 'PERCENTAGE' | 'FIXED';

export interface QuotationLineInput {
  id?: string;
  name?: string;
  description?: string | null;
  unit?: string | null;
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  discountType?: DiscountKind | null;
  discountValue?: Decimal.Value | null;
  taxRate?: Decimal.Value | null;
}

export interface QuotationCalculationInput {
  lines: QuotationLineInput[];
  globalDiscountType?: DiscountKind | null;
  globalDiscountValue?: Decimal.Value | null;
  pricesIncludeTax?: boolean;
  depositAmount?: Decimal.Value | null;
}

export interface QuotationLineTotals {
  /** Brut : quantité × prix unitaire. */
  lineGross: Decimal;
  /** Remise appliquée sur la ligne. */
  lineDiscount: Decimal;
  /** Net de la ligne avant remise globale (base de répartition). */
  lineNetBeforeGlobal: Decimal;
  /** Base imposable HT de la ligne (après répartition de la remise globale). */
  lineNet: Decimal;
  /** TVA de la ligne. */
  lineTax: Decimal;
  /** Total TTC de la ligne. */
  lineTotal: Decimal;
  /** Taux de TVA appliqué. */
  taxRate: Decimal;
}

export interface QuotationTotals {
  /** Σ brut des lignes (avant toute remise). */
  subtotal: Decimal;
  /** Σ remises de ligne. */
  lineDiscountTotal: Decimal;
  /** Remise globale montant. */
  globalDiscountTotal: Decimal;
  /** Base imposable HT (après remises). */
  netBeforeTax: Decimal;
  /** Σ TVA. */
  taxTotal: Decimal;
  /** Total TTC. */
  total: Decimal;
  /** Acompte demandé. */
  depositAmount: Decimal;
  /** Reste à payer. */
  amountDue: Decimal;
  /** Total des remises (lignes + globale). */
  totalDiscount: Decimal;
  /** Prix saisis taxes comprises ? */
  pricesIncludeTax: boolean;
  /** Détail par ligne. */
  lines: QuotationLineTotals[];
  /** Ventilation de la TVA par taux. */
  taxBreakdown: { taxRate: Decimal; base: Decimal; amount: Decimal }[];
}

/**
 * Calcule l'ensemble des totaux d'un devis.
 * Fonction pure : mêmes entrées ⇒ mêmes sorties (utilisable côté client et serveur).
 */
export function calculateQuotation(input: QuotationCalculationInput): QuotationTotals {
  const pricesIncludeTax = Boolean(input.pricesIncludeTax);

  // --- 1. Calcul ligne à ligne -------------------------------------------
  const prepared = input.lines.map((line) => {
    const quantity = rate(dec(line.quantity));
    const unitPrice = rate(dec(line.unitPrice));
    const taxRate = rate(dec(line.taxRate ?? 0));

    const lineGross = money(quantity.times(unitPrice));

    let lineDiscount = new Decimal(0);
    if (line.discountType && line.discountValue) {
      const raw =
        line.discountType === 'PERCENTAGE'
          ? lineGross.times(dec(line.discountValue)).dividedBy(100)
          : dec(line.discountValue);
      lineDiscount = money(Decimal.min(Decimal.max(raw, 0), lineGross));
    }

    const lineNetBeforeGlobal = money(lineGross.minus(lineDiscount));
    return { quantity, unitPrice, taxRate, lineGross, lineDiscount, lineNetBeforeGlobal };
  });

  const subtotal = money(prepared.reduce((acc, line) => acc.plus(line.lineGross), new Decimal(0)));
  const lineDiscountTotal = money(prepared.reduce((acc, line) => acc.plus(line.lineDiscount), new Decimal(0)));
  const netBeforeGlobalTotal = money(subtotal.minus(lineDiscountTotal));

  // --- 2. Remise globale -------------------------------------------------
  let globalDiscountTotal = new Decimal(0);
  if (input.globalDiscountType && input.globalDiscountValue) {
    const raw =
      input.globalDiscountType === 'PERCENTAGE'
        ? netBeforeGlobalTotal.times(dec(input.globalDiscountValue)).dividedBy(100)
        : dec(input.globalDiscountValue);
    globalDiscountTotal = money(Decimal.min(Decimal.max(raw, 0), netBeforeGlobalTotal));
  }

  // --- 3. Répartition de la remise globale et fiscalité ------------------
  const lines: QuotationLineTotals[] = [];
  let allocatedGlobal = new Decimal(0);

  prepared.forEach((line, index) => {
    const isLast = index === prepared.length - 1;
    const share = safeDivide(line.lineNetBeforeGlobal, netBeforeGlobalTotal, 0);
    // La dernière ligne absorbe le résidu d'arrondi : la somme des remises réparties
    // est ainsi toujours exactement égale à la remise globale.
    const lineGlobalDiscount = isLast
      ? money(globalDiscountTotal.minus(allocatedGlobal))
      : money(globalDiscountTotal.times(share));
    allocatedGlobal = allocatedGlobal.plus(lineGlobalDiscount);

    let lineNet: Decimal;
    let lineTax: Decimal;
    let lineTotal: Decimal;

    if (pricesIncludeTax) {
      // Prix saisis TTC : on désimpose pour obtenir la base HT.
      lineTotal = money(line.lineNetBeforeGlobal.minus(lineGlobalDiscount));
      const divisor = new Decimal(1).plus(line.taxRate.dividedBy(100));
      lineNet = money(safeDivide(lineTotal, divisor, lineTotal));
      lineTax = money(lineTotal.minus(lineNet));
    } else {
      // Prix saisis HT : la TVA s'ajoute.
      lineNet = money(line.lineNetBeforeGlobal.minus(lineGlobalDiscount));
      lineTax = money(lineNet.times(line.taxRate).dividedBy(100));
      lineTotal = money(lineNet.plus(lineTax));
    }

    lines.push({
      lineGross: line.lineGross,
      lineDiscount: line.lineDiscount,
      lineNetBeforeGlobal: line.lineNetBeforeGlobal,
      lineNet,
      lineTax,
      lineTotal,
      taxRate: line.taxRate,
    });
  });

  const netBeforeTax = money(lines.reduce((acc, line) => acc.plus(line.lineNet), new Decimal(0)));
  const taxTotal = money(lines.reduce((acc, line) => acc.plus(line.lineTax), new Decimal(0)));
  const total = money(lines.reduce((acc, line) => acc.plus(line.lineTotal), new Decimal(0)));

  // --- 4. Ventilation TVA par taux ---------------------------------------
  const breakdownMap = new Map<string, { taxRate: Decimal; base: Decimal; amount: Decimal }>();
  lines.forEach((line) => {
    const key = line.taxRate.toFixed(4);
    const entry = breakdownMap.get(key) ?? { taxRate: line.taxRate, base: new Decimal(0), amount: new Decimal(0) };
    entry.base = entry.base.plus(line.lineNet);
    entry.amount = entry.amount.plus(line.lineTax);
    breakdownMap.set(key, entry);
  });

  const depositAmount = money(Decimal.max(dec(input.depositAmount ?? 0), 0));
  const amountDue = money(Decimal.max(total.minus(depositAmount), 0));

  return {
    subtotal,
    lineDiscountTotal,
    globalDiscountTotal,
    netBeforeTax,
    taxTotal,
    total,
    depositAmount,
    amountDue,
    totalDiscount: money(lineDiscountTotal.plus(globalDiscountTotal)),
    pricesIncludeTax,
    lines,
    taxBreakdown: Array.from(breakdownMap.values())
      .map((entry) => ({ taxRate: entry.taxRate, base: money(entry.base), amount: money(entry.amount) }))
      .sort((a, b) => a.taxRate.comparedTo(b.taxRate)),
  };
}

/** Arrondi d'affichage arrondi au plus proche (utile pour les graphiques). */
export function toChartNumber(value: Decimal.Value): number {
  return money(dec(value)).toNumber();
}
