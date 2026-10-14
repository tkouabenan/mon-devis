/**
 * Données de rendu d'une facture.
 *
 * Les générateurs PDF/DOCX/XLSX n'ont pas de variante « facture » : ils
 * consomment le même conteneur de données que les devis et adaptent seulement
 * les libellés (voir `DOCUMENT_LABELS`). Un seul moteur de mise en page à
 * maintenir, des documents visuellement cohérents pour l'utilisateur.
 */

import type { Invoice, InvoiceItem, InvoicePayment } from '@/db/schema';
import type { Quotation, QuotationItem } from '@/db/schema';
import {
  DOCUMENT_LABELS,
  type CompanySnapshot,
  type CustomerSnapshot,
  type QuotationDocumentData,
  type QuotationTerms,
} from '@/lib/quotation-document';
import { calculateQuotation } from '@/lib/quotation-calculator';
import { mergeTemplateStyle, type TemplateCustomization, type TemplateStyle } from '@/lib/templates';
import { INVOICE_PAYMENT_METHOD_LABELS } from '@/lib/constants';

export interface BuildInvoiceDocumentParams {
  invoice: Invoice;
  items: InvoiceItem[];
  payments?: InvoicePayment[];
  style?: TemplateStyle;
  watermark?: boolean;
  logoDataUri?: string | null;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatAmount(value: unknown, currency: string): string {
  const numeric = Number(value ?? 0);
  const digits = ['XOF', 'XAF', 'JPY'].includes(currency.toUpperCase()) ? 0 : 2;
  return `${(Number.isFinite(numeric) ? numeric : 0).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${currency}`;
}

/**
 * Adapte une facture au conteneur de rendu commun.
 *
 * Les totaux sont recalculés depuis les lignes stockées de la facture (jamais
 * depuis le devis d'origine) : le document exporté correspond exactement à la
 * facture émise, même si le devis a changé depuis.
 */
export function buildInvoiceDocumentData(params: BuildInvoiceDocumentParams): QuotationDocumentData {
  const { invoice, items, payments = [] } = params;

  const totals = calculateQuotation({
    lines: items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountType: item.discountType,
      discountValue: item.discountValue,
      taxRate: item.taxRate,
    })),
    globalDiscountType: invoice.globalDiscountType,
    globalDiscountValue: invoice.globalDiscountValue,
    pricesIncludeTax: invoice.pricesIncludeTax,
  });

  const amountPaid = payments.length > 0 ? payments.reduce((sum, payment) => sum + Number(payment.amount), 0) : Number(invoice.amountPaid);
  const balance = Math.max(0, Math.round((Number(totals.total) - amountPaid) * 100) / 100);

  const style =
    params.style ?? mergeTemplateStyle(invoice.templateKey, invoice.customization as unknown as TemplateCustomization | null);

  const metaRows: [string, string][] = [];
  if (invoice.sourceQuotationNumber) metaRows.push(['Devis d’origine', invoice.sourceQuotationNumber]);
  if (invoice.dueDate) metaRows.push(['Échéance', formatDate(invoice.dueDate)]);
  if (invoice.status === 'PAID' || amountPaid > 0) metaRows.push(['Reste dû', formatAmount(balance, invoice.currency)]);

  const totalRows: QuotationDocumentData['totalRows'] = [];
  if (amountPaid > 0) {
    totalRows.push({ label: 'Montant déjà réglé', amount: amountPaid, muted: true });
    totalRows.push({ label: 'Solde restant dû', amount: balance, emphasis: balance > 0 });
  }

  const extraSections: QuotationDocumentData['extraSections'] = [];
  if (payments.length > 0) {
    extraSections.push({
      title: 'Règlements enregistrés',
      body: payments
        .slice()
        .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
        .map((payment) => {
          const method = INVOICE_PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
          const reference = payment.reference ? ` — réf. ${payment.reference}` : '';
          return `${formatDate(payment.paidAt)} · ${method} · ${formatAmount(payment.amount, invoice.currency)}${reference}`;
        })
        .join('\n'),
    });
  }

  /**
   * Les générateurs consomment les champs communs aux devis et aux factures.
   * `validUntil` porte ici la date d'échéance de la facture.
   */
  const record = {
    id: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    createdById: invoice.createdById,
    number: invoice.number,
    title: invoice.title,
    status: invoice.status,
    reference: invoice.reference,
    customerReference: invoice.customerReference,
    currency: invoice.currency,
    locale: invoice.locale,
    issueDate: invoice.issueDate,
    validUntil: invoice.dueDate,
    sentAt: invoice.sentAt,
    decidedAt: invoice.paidAt,
    decisionSource: null,
    viewedAt: null,
    templateId: null,
    templateKey: invoice.templateKey,
    customization: invoice.customization,
    pricesIncludeTax: invoice.pricesIncludeTax,
    subtotal: invoice.subtotal,
    lineDiscountTotal: invoice.lineDiscountTotal,
    globalDiscountType: invoice.globalDiscountType,
    globalDiscountValue: invoice.globalDiscountValue,
    globalDiscountTotal: invoice.globalDiscountTotal,
    netBeforeTax: invoice.netBeforeTax,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    amountDue: String(balance),
    depositAmount: '0',
    companySnapshot: invoice.companySnapshot,
    customerSnapshot: invoice.customerSnapshot,
    terms: invoice.terms,
    notes: invoice.notes,
    internalNotes: null,
    isArchived: invoice.isArchived,
    deletedAt: invoice.deletedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  } as unknown as Quotation;

  return {
    quotation: record,
    items: items as unknown as QuotationItem[],
    company: invoice.companySnapshot as unknown as CompanySnapshot | null,
    customer: invoice.customerSnapshot as unknown as CustomerSnapshot | null,
    terms: (invoice.terms as unknown as QuotationTerms) ?? {},
    style,
    totals,
    watermark: params.watermark ?? false,
    logoDataUri: params.logoDataUri ?? null,
    kind: 'INVOICE',
    labels: DOCUMENT_LABELS.INVOICE,
    metaRows,
    totalRows,
    extraSections,
  };
}
