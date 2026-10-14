'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '@/components/ui/display';
import { Input, Select, Textarea } from '@/components/ui/form';
import { calculateQuotation } from '@/lib/quotation-calculator';
import { formatCurrency } from '@/lib/currency';
import { DEFAULT_UNITS } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Éditeur de lignes partagé par le générateur de devis et le formulaire de facture.
 *
 * Les totaux sont calculés avec le moteur unique (`@/lib/quotation-calculator`),
 * le même que celui utilisé par le serveur et les exports : l'aperçu affiché,
 * les montants enregistrés et les documents exportés sont donc toujours
 * strictement identiques.
 */

export interface EditorItem {
  /** Identifiant local stable (React key), jamais envoyé au serveur. */
  key: string;
  id?: string | null;
  productId?: string | null;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountType: '' | 'PERCENTAGE' | 'FIXED';
  discountValue: string;
  taxRate: string;
}

export interface EditorProduct {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  unitPrice: string;
  taxRate: string;
  category: string | null;
  code: string | null;
}

export function newEditorItem(overrides: Partial<EditorItem> = {}): EditorItem {
  return {
    key: `line-${Math.random().toString(36).slice(2, 10)}`,
    id: null,
    productId: null,
    name: '',
    description: '',
    unit: 'unité',
    quantity: '1',
    unitPrice: '',
    discountType: '',
    discountValue: '',
    taxRate: '18',
    ...overrides,
  };
}

export function itemsToPayload(items: EditorItem[]) {
  return items.map((item, index) => ({
    id: item.id ?? null,
    productId: item.productId ?? null,
    name: item.name.trim() || `Ligne ${index + 1}`,
    description: item.description.trim() || null,
    unit: item.unit || null,
    quantity: item.quantity || '0',
    unitPrice: item.unitPrice || '0',
    discountType: item.discountType || null,
    discountValue: item.discountValue || '0',
    taxRate: item.taxRate || '0',
  }));
}

export function payloadToItems(
  rows: { id?: string | null; productId?: string | null; name: string; description?: string | null; unit?: string | null; quantity: string; unitPrice: string; discountType?: string | null; discountValue?: string | null; taxRate?: string | null }[],
): EditorItem[] {
  return rows.map((row) =>
    newEditorItem({
      id: row.id ?? null,
      productId: row.productId ?? null,
      name: row.name,
      description: row.description ?? '',
      unit: row.unit ?? 'unité',
      quantity: String(row.quantity ?? '1'),
      unitPrice: String(row.unitPrice ?? ''),
      discountType: (row.discountType as EditorItem['discountType']) ?? '',
      discountValue: row.discountValue && Number(row.discountValue) > 0 ? String(row.discountValue) : '',
      taxRate: row.taxRate === null || row.taxRate === undefined ? '0' : String(row.taxRate),
    }),
  );
}

export function computeEditorTotals(
  items: EditorItem[],
  options: { globalDiscountType: '' | 'PERCENTAGE' | 'FIXED'; globalDiscountValue: string; pricesIncludeTax: boolean; depositAmount?: string },
) {
  return calculateQuotation({
    lines: items.map((item) => ({
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || 0,
      discountType: item.discountType || null,
      discountValue: item.discountValue || 0,
      taxRate: item.taxRate || 0,
    })),
    globalDiscountType: options.globalDiscountType || null,
    globalDiscountValue: options.globalDiscountValue || 0,
    pricesIncludeTax: options.pricesIncludeTax,
    depositAmount: options.depositAmount || 0,
  });
}

const numberInputClass = 'h-9 text-right tabular-nums';

export function ItemsEditor({
  items,
  onChange,
  products = [],
  currency,
  pricesIncludeTax,
  onPricesIncludeTaxChange,
  globalDiscountType,
  globalDiscountValue,
  onGlobalDiscountChange,
  depositAmount,
  onDepositChange,
  showDeposit = false,
  defaultTaxRate = 18,
  disabled = false,
  idPrefix = 'items',
}: {
  items: EditorItem[];
  onChange: (items: EditorItem[]) => void;
  products?: EditorProduct[];
  currency: string;
  pricesIncludeTax: boolean;
  onPricesIncludeTaxChange?: (value: boolean) => void;
  globalDiscountType: '' | 'PERCENTAGE' | 'FIXED';
  globalDiscountValue: string;
  onGlobalDiscountChange?: (type: '' | 'PERCENTAGE' | 'FIXED', value: string) => void;
  depositAmount?: string;
  onDepositChange?: (value: string) => void;
  showDeposit?: boolean;
  defaultTaxRate?: number;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const [openProducts, setOpenProducts] = React.useState<number | null>(null);

  const totals = computeEditorTotals(items, { globalDiscountType, globalDiscountValue, pricesIncludeTax, depositAmount });

  const update = (index: number, patch: Partial<EditorItem>) => {
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  };

  const remove = (index: number) => onChange(items.filter((_, position) => position !== index));

  const duplicate = (index: number) => {
    const copy = { ...items[index], key: `line-${Math.random().toString(36).slice(2, 10)}`, id: null };
    const next = [...items];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addRow = () => onChange([...items, newEditorItem({ taxRate: String(defaultTaxRate) })]);

  const applyProduct = (index: number, product: EditorProduct) => {
    update(index, {
      productId: product.id,
      name: product.name,
      description: product.description ?? '',
      unit: product.unit,
      unitPrice: String(product.unitPrice),
      taxRate: String(product.taxRate),
    });
    setOpenProducts(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Lignes du document</p>
          <Badge variant="outline">{items.length} ligne(s)</Badge>
        </div>
        <div className="flex items-center gap-2">
          {onPricesIncludeTaxChange ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={pricesIncludeTax}
                onChange={(event) => onPricesIncludeTaxChange(event.target.checked)}
                disabled={disabled}
              />
              Prix saisis TTC
            </label>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
            <Plus className="size-4" aria-hidden />
            Ajouter une ligne
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            Aucune ligne. Ajoutez vos prestations ou sélectionnez un produit de votre catalogue.
          </div>
        ) : null}

        {items.map((item, index) => {
          const totalsLine = totals.lines[index];
          const lineTotal = totalsLine ? totalsLine.lineTotal.toNumber() : 0;
          const lineGross = totalsLine ? totalsLine.lineGross.toNumber() : 0;
          const lineDiscount = totalsLine ? totalsLine.lineDiscount.toNumber() : 0;

          return (
            <div key={item.key} className="rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/25">
              <div className="flex items-start gap-2">
                <span className="mt-2 hidden text-muted-foreground sm:block" aria-hidden>
                  <GripVertical className="size-4" />
                </span>

                <div className="flex-1 space-y-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="space-y-1.5">
                      <label className="sr-only" htmlFor={`${idPrefix}-name-${index}`}>
                        Désignation
                      </label>
                      <Input
                        id={`${idPrefix}-name-${index}`}
                        value={item.name}
                        onChange={(event) => update(index, { name: event.target.value })}
                        placeholder="Prestation ou produit (ex. Travaux de maçonnerie)"
                        disabled={disabled}
                      />
                      {products.length > 0 ? (
                        <div className="relative">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => setOpenProducts(openProducts === index ? null : index)}
                            disabled={disabled}
                          >
                            <Wand2 className="size-3.5" aria-hidden />
                            Choisir dans le catalogue
                          </button>
                          {openProducts === index ? (
                            <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[280px] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-elevated">
                              {products.map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                                  onClick={() => applyProduct(index, product)}
                                >
                                  <span>
                                    <span className="block font-medium">{product.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {product.category ?? 'Sans catégorie'} · TVA {Number(product.taxRate)} %
                                    </span>
                                  </span>
                                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                    {formatCurrency(Number(product.unitPrice), currency, 'fr-FR')}/{product.unit}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <label className="sr-only" htmlFor={`${idPrefix}-description-${index}`}>
                        Description
                      </label>
                      <Textarea
                        id={`${idPrefix}-description-${index}`}
                        value={item.description}
                        onChange={(event) => update(index, { description: event.target.value })}
                        placeholder="Détail de la prestation (optionnel)"
                        rows={1}
                        className="min-h-10"
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <div className="space-y-1">
                      <span className="label-caps">Unité</span>
                      <Select
                        value={item.unit}
                        onChange={(event) => update(index, { unit: event.target.value })}
                        disabled={disabled}
                        className="h-9"
                        aria-label="Unité"
                      >
                        {DEFAULT_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                        {!DEFAULT_UNITS.includes(item.unit) && item.unit ? <option value={item.unit}>{item.unit}</option> : null}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <span className="label-caps">Quantité</span>
                      <Input
                        value={item.quantity}
                        onChange={(event) => update(index, { quantity: event.target.value })}
                        inputMode="decimal"
                        className={numberInputClass}
                        disabled={disabled}
                        aria-label="Quantité"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="label-caps">{pricesIncludeTax ? 'P.U. TTC' : 'P.U. HT'}</span>
                      <Input
                        value={item.unitPrice}
                        onChange={(event) => update(index, { unitPrice: event.target.value })}
                        inputMode="decimal"
                        className={numberInputClass}
                        disabled={disabled}
                        aria-label="Prix unitaire"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="label-caps">Remise</span>
                      <div className="flex gap-1">
                        <Input
                          value={item.discountValue}
                          onChange={(event) => update(index, { discountValue: event.target.value, discountType: item.discountType || 'PERCENTAGE' })}
                          inputMode="decimal"
                          className={numberInputClass}
                          disabled={disabled}
                          aria-label="Valeur de la remise"
                        />
                        <Select
                          value={item.discountType || 'PERCENTAGE'}
                          onChange={(event) =>
                            update(index, {
                              discountType: event.target.value as EditorItem['discountType'],
                              discountValue: event.target.value === '' ? '' : item.discountValue,
                            })
                          }
                          className="h-9 w-16"
                          disabled={disabled}
                          aria-label="Type de remise"
                        >
                          <option value="PERCENTAGE">%</option>
                          <option value="FIXED">fixe</option>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="label-caps">TVA %</span>
                      <Input
                        value={item.taxRate}
                        onChange={(event) => update(index, { taxRate: event.target.value })}
                        inputMode="decimal"
                        className={numberInputClass}
                        disabled={disabled}
                        aria-label="Taux de TVA"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="label-caps">Total ligne</span>
                      <div className="flex h-9 items-center justify-end rounded-lg border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                        {formatCurrency(lineTotal, currency, 'fr-FR')}
                      </div>
                    </div>
                  </div>

                  {lineDiscount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Brut {formatCurrency(lineGross, currency, 'fr-FR')} − remise {formatCurrency(lineDiscount, currency, 'fr-FR')}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Monter la ligne"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Descendre la ligne"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === items.length - 1}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Dupliquer la ligne"
                    onClick={() => duplicate(index)}
                    disabled={disabled}
                  >
                    <Copy className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Supprimer la ligne"
                    onClick={() => remove(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="size-3.5 text-destructive" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bloc de totaux */}
      <Card className={cn('bg-muted/30')}>
        <CardHeader className="border-b-0 pb-0">
          <CardTitle className="text-sm">Récapitulatif financier</CardTitle>
          <CardDescription>Calculé automatiquement ; le serveur recalcule les totaux avant l’enregistrement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="label-caps">Remise globale</span>
                <div className="flex gap-2">
                  <Input
                    value={globalDiscountValue}
                    onChange={(event) => onGlobalDiscountChange?.(globalDiscountType || 'PERCENTAGE', event.target.value)}
                    inputMode="decimal"
                    className="h-9 text-right tabular-nums"
                    placeholder="0"
                    disabled={disabled || !onGlobalDiscountChange}
                    aria-label="Valeur de la remise globale"
                  />
                  <Select
                    value={globalDiscountType || 'PERCENTAGE'}
                    onChange={(event) => onGlobalDiscountChange?.(event.target.value as 'PERCENTAGE' | 'FIXED', globalDiscountValue)}
                    className="h-9 w-24"
                    disabled={disabled || !onGlobalDiscountChange}
                    aria-label="Type de remise globale"
                  >
                    <option value="PERCENTAGE">%</option>
                    <option value="FIXED">Montant</option>
                  </Select>
                </div>
              </div>

              {showDeposit ? (
                <div className="space-y-1.5">
                  <span className="label-caps">Acompte demandé</span>
                  <Input
                    value={depositAmount ?? ''}
                    onChange={(event) => onDepositChange?.(event.target.value)}
                    inputMode="decimal"
                    className="h-9 text-right tabular-nums"
                    placeholder="0"
                    disabled={disabled || !onDepositChange}
                    aria-label="Acompte"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="tabular-nums">{formatCurrency(totals.subtotal.toNumber(), currency, 'fr-FR')}</dd>
            </div>
            {totals.lineDiscountTotal.toNumber() > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Remises sur lignes</dt>
                <dd className="tabular-nums">- {formatCurrency(totals.lineDiscountTotal.toNumber(), currency, 'fr-FR')}</dd>
              </div>
            ) : null}
            {totals.globalDiscountTotal.toNumber() > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Remise globale</dt>
                <dd className="tabular-nums">- {formatCurrency(totals.globalDiscountTotal.toNumber(), currency, 'fr-FR')}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Total HT</dt>
              <dd className="tabular-nums">{formatCurrency(totals.netBeforeTax.toNumber(), currency, 'fr-FR')}</dd>
            </div>
            {totals.taxBreakdown.map((entry) => (
              <div key={entry.taxRate.toString()} className="flex items-center justify-between">
                <dt className="text-muted-foreground">TVA {entry.taxRate.toNumber()} %</dt>
                <dd className="tabular-nums">{formatCurrency(entry.amount.toNumber(), currency, 'fr-FR')}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
              <dt>Total TTC</dt>
              <dd className="tabular-nums">{formatCurrency(totals.total.toNumber(), currency, 'fr-FR')}</dd>
            </div>
            {totals.depositAmount.toNumber() > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Acompte</dt>
                  <dd className="tabular-nums">{formatCurrency(totals.depositAmount.toNumber(), currency, 'fr-FR')}</dd>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <dt>Reste à payer</dt>
                  <dd className="tabular-nums">{formatCurrency(totals.amountDue.toNumber(), currency, 'fr-FR')}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
