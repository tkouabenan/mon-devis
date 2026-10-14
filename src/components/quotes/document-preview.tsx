'use client';

import * as React from 'react';
import type { TemplateStyle } from '@/lib/templates';
import type { QuotationTotals } from '@/lib/quotation-calculator';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { EditorItem } from '@/components/documents/items-editor';

/**
 * Aperçu temps réel du document (devis ou facture).
 *
 * Reproduit fidèlement la mise en page des exports (PDF/Word/Excel) : mêmes
 * couleurs de modèle, mêmes blocs, mêmes libellés via `DOCUMENT_LABELS`.
 * Chaque modification du formulaire se reflète instantanément ici.
 */

export interface PreviewCompany {
  name: string;
  logoUrl?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  bankDetails?: string | null;
  paymentInfo?: string | null;
}

export interface PreviewCustomer {
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  taxId?: string | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

export function DocumentPreview({
  kind = 'QUOTATION',
  company,
  customer,
  items,
  totals,
  style,
  currency,
  number,
  title,
  statusLabel,
  issueDate,
  validUntil,
  validityLabel,
  terms,
  notes,
  watermark,
  metaRows = [],
}: {
  kind?: 'QUOTATION' | 'INVOICE';
  company: PreviewCompany | null;
  customer: PreviewCustomer | null;
  items: EditorItem[];
  totals: QuotationTotals;
  style: TemplateStyle;
  currency: string;
  number: string;
  title: string;
  statusLabel?: string;
  issueDate: string;
  validUntil?: string | null;
  validityLabel: string;
  terms: Record<string, string | null | undefined>;
  notes: string;
  watermark: boolean;
  metaRows?: [string, string][];
}) {
  const badge = kind === 'INVOICE' ? 'FACTURE' : 'DEVIS';
  const documentTitle = kind === 'INVOICE' ? 'Facture' : 'Devis';
  const primary = style.colors.primary;

  const hasDiscount = items.some((item) => Number(item.discountValue) > 0);
  const hasTax = items.some((item) => Number(item.taxRate) > 0);

  const companyLines = company
    ? [
        company.addressLine1,
        [company.postalCode, company.city].filter(Boolean).join(' '),
        company.country,
        company.phone,
        company.email,
        company.website,
        [company.taxId ? `N° fiscal : ${company.taxId}` : null, company.registrationNumber ? `RCCM : ${company.registrationNumber}` : null]
          .filter(Boolean)
          .join(' · '),
      ].filter((line): line is string => Boolean(line && String(line).trim()))
    : [];

  const customerLines = customer
    ? [
        customer.companyName ? customer.name : null,
        customer.addressLine1,
        [customer.postalCode, customer.city].filter(Boolean).join(' '),
        customer.country,
        customer.email,
        customer.phone,
        customer.taxId ? `N° fiscal : ${customer.taxId}` : null,
      ].filter((line): line is string => Boolean(line && String(line).trim()))
    : [];

  return (
    <div className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-border bg-white text-slate-800 shadow-card">
      {watermark ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <span className="rotate-[-32deg] text-6xl font-bold text-slate-900/[0.06]">MON DEVIS</span>
        </div>
      ) : null}

      <div className="relative px-10 py-9">
        {/* En-tête */}
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-6',
            style.layout.header === 'banner' && '-mx-10 -mt-9 mb-6 px-10 py-8',
          )}
          style={
            style.layout.header === 'banner'
              ? { backgroundColor: style.colors.headerBackground, color: style.colors.headerText }
              : undefined
          }
        >
          <div className="min-w-[180px] flex-1 space-y-2">
            {company?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt={company.name} className="max-h-12 max-w-[180px] object-contain" />
            ) : null}
            <p className="text-base font-bold" style={{ color: style.layout.header === 'banner' ? style.colors.headerText : style.colors.text }}>
              {company?.name || 'Votre entreprise'}
            </p>
            <div className="space-y-0.5 text-[11px] leading-relaxed" style={{ color: style.colors.muted }}>
              {companyLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <div className="min-w-[200px] text-right">
            <p
              className="font-display text-2xl font-bold tracking-tight"
              style={{ color: style.layout.header === 'banner' ? style.colors.headerText : primary, letterSpacing: style.typography.letterSpacing }}
            >
              {badge}
            </p>
            <p className="mt-1 text-sm font-semibold" style={{ color: style.colors.text }}>
              {number || '—'}
            </p>
            <p className="text-[11px]" style={{ color: style.colors.muted }}>
              Émis le {formatDate(issueDate)}
            </p>
            {validUntil ? (
              <p className="text-[11px]" style={{ color: style.colors.muted }}>
                {validityLabel} {formatDate(validUntil)}
              </p>
            ) : null}
          </div>
        </header>

        {/* Client + méta */}
        <section className="mt-7 flex flex-wrap gap-6">
          <div className="min-w-[52%] flex-1 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: primary }}>
              Client
            </p>
            <p className="text-sm font-semibold">{customer?.companyName || customer?.name || 'Client à sélectionner'}</p>
            <div className="space-y-0.5 text-[11px] leading-relaxed" style={{ color: style.colors.muted }}>
              {customerLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <div className="min-w-[200px] space-y-1 rounded-lg p-3" style={{ backgroundColor: `${primary}0f` }}>
            {[
              ['Numéro', number || '—'],
              ['Date d’émission', formatDate(issueDate)],
              ...(validUntil ? [[validityLabel, formatDate(validUntil)] as [string, string]] : []),
              ['Devise', currency],
              ...(statusLabel ? [['Statut', statusLabel] as [string, string]] : []),
              ...metaRows,
            ].map(([label, value]) => (
              <div key={`${label}-${value}`} className="flex items-baseline justify-between gap-3 text-[11px]">
                <span style={{ color: style.colors.muted }}>{label}</span>
                <span className="font-semibold" style={{ color: style.colors.text }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Titre */}
        {title && title.trim() && title.trim() !== documentTitle ? (
          <h2 className="mt-6 text-sm font-semibold" style={{ color: style.colors.text }}>
            {title}
          </h2>
        ) : null}

        {/* Tableau des lignes */}
        <section className="mt-5">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ backgroundColor: style.colors.tableHeaderBackground, color: style.colors.tableHeaderText }}>
                <th className="px-2 py-2 text-left font-semibold">Désignation</th>
                {style.visibility.unitColumn ? <th className="px-2 py-2 text-left font-semibold">Unité</th> : null}
                <th className="px-2 py-2 text-right font-semibold">Qté</th>
                <th className="px-2 py-2 text-right font-semibold">P.U. {totals.pricesIncludeTax ? 'TTC' : 'HT'}</th>
                {hasDiscount && style.visibility.discountColumn ? <th className="px-2 py-2 text-right font-semibold">Remise</th> : null}
                {hasTax ? <th className="px-2 py-2 text-right font-semibold">TVA</th> : null}
                <th className="px-2 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center" style={{ color: style.colors.muted }}>
                    Les lignes saisies apparaîtront ici.
                  </td>
                </tr>
              ) : null}
              {items.map((item, index) => {
                const line = totals.lines[index];
                return (
                  <tr
                    key={item.key}
                    style={{
                      borderBottom: `1px solid ${style.colors.border}`,
                      backgroundColor: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined,
                    }}
                  >
                    <td className="px-2 py-2 align-top">
                      <span className="font-medium">{item.name || `Ligne ${index + 1}`}</span>
                      {style.visibility.itemDescriptions && item.description ? (
                        <span className="block text-[10px]" style={{ color: style.colors.muted }}>
                          {item.description}
                        </span>
                      ) : null}
                    </td>
                    {style.visibility.unitColumn ? <td className="px-2 py-2 align-top">{item.unit}</td> : null}
                    <td className="px-2 py-2 text-right align-top tabular-nums">{Number(item.quantity || 0).toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-right align-top tabular-nums">
                      {formatCurrency(Number(item.unitPrice || 0), currency, 'fr-FR')}
                    </td>
                    {hasDiscount && style.visibility.discountColumn ? (
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {Number(item.discountValue) > 0
                          ? item.discountType === 'FIXED'
                            ? formatCurrency(Number(item.discountValue), currency, 'fr-FR')
                            : `${Number(item.discountValue)} %`
                          : '—'}
                      </td>
                    ) : null}
                    {hasTax ? (
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {Number(item.taxRate) > 0 ? `${Number(item.taxRate)} %` : '—'}
                      </td>
                    ) : null}
                    <td className="px-2 py-2 text-right align-top font-semibold tabular-nums">
                      {formatCurrency(line ? line.lineTotal.toNumber() : 0, currency, 'fr-FR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Totaux */}
        <section className="mt-5 flex justify-end">
          <div className="w-full max-w-[300px] space-y-1 rounded-lg p-3 text-[11px]" style={{ backgroundColor: `${primary}0a` }}>
            {[
              ['Sous-total', formatCurrency(totals.subtotal.toNumber(), currency, 'fr-FR')],
              ...(totals.lineDiscountTotal.toNumber() > 0
                ? [['Remises sur lignes', `- ${formatCurrency(totals.lineDiscountTotal.toNumber(), currency, 'fr-FR')}`] as [string, string]]
                : []),
              ...(totals.globalDiscountTotal.toNumber() > 0
                ? [['Remise globale', `- ${formatCurrency(totals.globalDiscountTotal.toNumber(), currency, 'fr-FR')}`] as [string, string]]
                : []),
              ['Total HT', formatCurrency(totals.netBeforeTax.toNumber(), currency, 'fr-FR')],
              ...totals.taxBreakdown.map(
                (entry) => [`TVA ${entry.taxRate.toNumber()} %`, formatCurrency(entry.amount.toNumber(), currency, 'fr-FR')] as [string, string],
              ),
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span style={{ color: style.colors.muted }}>{label}</span>
                <span className="tabular-nums">{value}</span>
              </div>
            ))}
            <div
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold"
              style={{ backgroundColor: primary, color: '#FFFFFF' }}
            >
              <span>Total TTC</span>
              <span className="tabular-nums">{formatCurrency(totals.total.toNumber(), currency, 'fr-FR')}</span>
            </div>
            {totals.depositAmount.toNumber() > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span style={{ color: style.colors.muted }}>Acompte</span>
                  <span className="tabular-nums">{formatCurrency(totals.depositAmount.toNumber(), currency, 'fr-FR')}</span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span>Reste à payer</span>
                  <span className="tabular-nums">{formatCurrency(totals.amountDue.toNumber(), currency, 'fr-FR')}</span>
                </div>
              </>
            ) : null}
          </div>
        </section>

        {/* Conditions */}
        <section className="mt-6 space-y-3 text-[11px]">
          {style.visibility.terms && terms.validityPeriod ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                {kind === 'INVOICE' ? 'Conditions de règlement' : 'Validité du devis'}
              </p>
              <p style={{ color: style.colors.muted }}>{terms.validityPeriod}</p>
            </div>
          ) : null}
          {terms.paymentTerms ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Conditions de paiement
              </p>
              <p style={{ color: style.colors.muted }}>{terms.paymentTerms}</p>
            </div>
          ) : null}
          {terms.deliveryTime ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Délai de livraison / exécution
              </p>
              <p style={{ color: style.colors.muted }}>{terms.deliveryTime}</p>
            </div>
          ) : null}
          {terms.warranty ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Garantie
              </p>
              <p style={{ color: style.colors.muted }}>{terms.warranty}</p>
            </div>
          ) : null}
          {terms.specialConditions ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Conditions particulières
              </p>
              <p style={{ color: style.colors.muted }}>{terms.specialConditions}</p>
            </div>
          ) : null}
          {notes ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Notes
              </p>
              <p style={{ color: style.colors.muted }}>{notes}</p>
            </div>
          ) : null}
          {terms.paymentInstructions || company?.paymentInfo ? (
            <div className="rounded-md p-3" style={{ backgroundColor: `${style.colors.accent}14` }}>
              <p className="font-semibold">MODALITÉS DE RÈGLEMENT</p>
              <p style={{ color: style.colors.muted }}>{terms.paymentInstructions || company?.paymentInfo}</p>
            </div>
          ) : null}
          {company?.bankDetails ? (
            <div>
              <p className="font-semibold uppercase tracking-wide" style={{ color: primary }}>
                Coordonnées bancaires
              </p>
              <p style={{ color: style.colors.muted }}>{company.bankDetails}</p>
            </div>
          ) : null}
          {terms.legalMentions ? (
            <p className="text-[10px]" style={{ color: style.colors.muted }}>
              {terms.legalMentions}
            </p>
          ) : null}
        </section>

        {/* Signatures */}
        {style.visibility.signature ? (
          <section className="mt-8 grid grid-cols-2 gap-8 text-[10px]" style={{ color: style.colors.muted }}>
            <div>
              <p>{kind === 'INVOICE' ? 'Signature et cachet du client' : 'Bon pour accord — signature du client'}</p>
              <div className="mt-10 border-t" style={{ borderColor: style.colors.border }} />
              <p className="mt-1">Nom, date et signature</p>
            </div>
            <div>
              <p>Pour l’entreprise</p>
              <div className="mt-10 border-t" style={{ borderColor: style.colors.border }} />
              <p className="mt-1">Nom, date et signature</p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
