import { describe, expect, it } from 'vitest';
import { calculateQuotation } from '@/lib/quotation-calculator';

/**
 * Le moteur de calcul est la source unique de vérité des montants :
 * ces tests verrouillent les règles documentées dans docs/CALCULS.md.
 */
describe('calculateQuotation — prix saisis hors taxes', () => {
  it('calcule une ligne simple avec TVA', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 10, unitPrice: 1000, taxRate: 18 }],
      pricesIncludeTax: false,
    });

    expect(totals.subtotal.toFixed(2)).toBe('10000.00');
    expect(totals.netBeforeTax.toFixed(2)).toBe('10000.00');
    expect(totals.taxTotal.toFixed(2)).toBe('1800.00');
    expect(totals.total.toFixed(2)).toBe('11800.00');
  });

  it('applique une remise de ligne en pourcentage', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 4, unitPrice: 25000, discountType: 'PERCENTAGE', discountValue: 10, taxRate: 18 }],
      pricesIncludeTax: false,
    });

    expect(totals.lineDiscountTotal.toFixed(2)).toBe('10000.00');
    expect(totals.netBeforeTax.toFixed(2)).toBe('90000.00');
    expect(totals.taxTotal.toFixed(2)).toBe('16200.00');
    expect(totals.total.toFixed(2)).toBe('106200.00');
  });

  it('plafonne une remise fixe au montant de la ligne', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 1, unitPrice: 5000, discountType: 'FIXED', discountValue: 9000, taxRate: 18 }],
      pricesIncludeTax: false,
    });

    expect(totals.lineDiscountTotal.toFixed(2)).toBe('5000.00');
    expect(totals.total.toFixed(2)).toBe('0.00');
  });

  it('répartit une remise globale au prorata sans perte d’arrondi', () => {
    const totals = calculateQuotation({
      lines: [
        { quantity: 3, unitPrice: 3333.33, taxRate: 18 },
        { quantity: 1, unitPrice: 9999.99, taxRate: 18 },
        { quantity: 7, unitPrice: 1234.56, taxRate: 18 },
      ],
      globalDiscountType: 'PERCENTAGE',
      globalDiscountValue: 7.5,
      pricesIncludeTax: false,
    });

    const allocated = totals.lines.reduce((sum, line) => sum.plus(line.lineNet), totals.lines[0].lineNet.minus(totals.lines[0].lineNet));
    expect(allocated.plus(totals.globalDiscountTotal).toFixed(2)).toBe(totals.subtotal.minus(totals.lineDiscountTotal).toFixed(2));
    expect(totals.netBeforeTax.plus(totals.taxTotal).toFixed(2)).toBe(totals.total.toFixed(2));
  });

  it('ventile la TVA multi-taux', () => {
    const totals = calculateQuotation({
      lines: [
        { quantity: 1, unitPrice: 100000, taxRate: 18 },
        { quantity: 1, unitPrice: 50000, taxRate: 9 },
        { quantity: 1, unitPrice: 20000, taxRate: 0 },
      ],
      pricesIncludeTax: false,
    });

    expect(totals.taxBreakdown).toHaveLength(3);
    const eighteen = totals.taxBreakdown.find((entry) => entry.taxRate.toNumber() === 18);
    expect(eighteen?.amount.toFixed(2)).toBe('18000.00');
    expect(totals.taxTotal.toFixed(2)).toBe('22500.00');
    expect(totals.total.toFixed(2)).toBe('192500.00');
  });

  it('gère des quantités décimales (m², heures)', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 38.5, unitPrice: 18900, taxRate: 18 }],
      pricesIncludeTax: false,
    });

    expect(totals.subtotal.toFixed(2)).toBe('727650.00');
    expect(totals.total.toFixed(2)).toBe('858627.00');
  });
});

describe('calculateQuotation — prix saisis taxes comprises', () => {
  it('désimpose les montants pour retrouver la base HT', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 1, unitPrice: 118000, taxRate: 18 }],
      pricesIncludeTax: true,
    });

    expect(totals.total.toFixed(2)).toBe('118000.00');
    expect(totals.netBeforeTax.toFixed(2)).toBe('100000.00');
    expect(totals.taxTotal.toFixed(2)).toBe('18000.00');
    expect(totals.netBeforeTax.plus(totals.taxTotal).toFixed(2)).toBe(totals.total.toFixed(2));
  });

  it('applique la remise globale sur des montants TTC', () => {
    const totals = calculateQuotation({
      lines: [
        { quantity: 2, unitPrice: 59000, taxRate: 18 },
        { quantity: 1, unitPrice: 23600, taxRate: 18 },
      ],
      globalDiscountType: 'FIXED',
      globalDiscountValue: 10000,
      pricesIncludeTax: true,
    });

    expect(totals.globalDiscountTotal.toFixed(2)).toBe('10000.00');
    expect(totals.total.toFixed(2)).toBe('131600.00');
    expect(totals.netBeforeTax.plus(totals.taxTotal).toFixed(2)).toBe(totals.total.toFixed(2));
  });
});

describe('calculateQuotation — acompte et cohérence', () => {
  it('calcule le reste à payer', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 1, unitPrice: 1000000, taxRate: 18 }],
      depositAmount: 400000,
      pricesIncludeTax: false,
    });

    expect(totals.total.toFixed(2)).toBe('1180000.00');
    expect(totals.amountDue.toFixed(2)).toBe('780000.00');
  });

  it('ne produit jamais de montant négatif', () => {
    const totals = calculateQuotation({
      lines: [{ quantity: 1, unitPrice: 1000, taxRate: 18 }],
      depositAmount: 999999,
      pricesIncludeTax: false,
    });

    expect(totals.amountDue.toFixed(2)).toBe('0.00');
  });

  it('garantit total = base HT + TVA sur un jeu de valeurs complexe', () => {
    const totals = calculateQuotation({
      lines: Array.from({ length: 25 }, (_, index) => ({
        quantity: 1 + (index % 5) * 0.33,
        unitPrice: 1234.567 + index * 987.654,
        discountType: index % 3 === 0 ? ('PERCENTAGE' as const) : index % 3 === 1 ? ('FIXED' as const) : null,
        discountValue: index % 3 === 0 ? 7.25 : index % 3 === 1 ? 350.5 : 0,
        taxRate: [0, 9, 18][index % 3],
      })),
      globalDiscountType: 'PERCENTAGE',
      globalDiscountValue: 3.75,
      pricesIncludeTax: false,
    });

    const sumLines = totals.lines.reduce((sum, line) => sum.plus(line.lineNet), totals.netBeforeTax.minus(totals.netBeforeTax));
    expect(sumLines.toFixed(2)).toBe(totals.netBeforeTax.toFixed(2));
    expect(totals.netBeforeTax.plus(totals.taxTotal).toFixed(2)).toBe(totals.total.toFixed(2));
    expect(totals.lines.reduce((sum, line) => sum.plus(line.lineTotal), totals.total.minus(totals.total)).toFixed(2)).toBe(totals.total.toFixed(2));
  });

  it('renvoie des zéros pour un devis vide', () => {
    const totals = calculateQuotation({ lines: [], pricesIncludeTax: false });
    expect(totals.total.toFixed(2)).toBe('0.00');
    expect(totals.taxTotal.toFixed(2)).toBe('0.00');
    expect(totals.taxBreakdown).toHaveLength(0);
  });
});
