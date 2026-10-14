import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  invoiceItems,
  invoicePayments,
  invoiceStatusHistory,
  invoices,
  organizationSettings,
  quotationItems,
  quotations,
  type DiscountKind,
  type Invoice,
  type InvoiceItem,
  type InvoicePayment,
  type InvoicePaymentMethod,
  type InvoiceStatus,
} from '@/db/schema';
import { calculateQuotation, type QuotationTotals } from '@/lib/quotation-calculator';
import { renderQuotationNumber } from '@/lib/numbering';
import { toAmountNumber, toMoneyString, toNumberString } from '@/lib/money';
import { AuthorizationError, NotFoundError } from '@/lib/auth/guards';
import { buildCompanySnapshot } from '@/lib/services/quotations';
import { ALLOWED_INVOICE_TRANSITIONS } from '@/lib/constants';
import type { CompanySnapshot, CustomerSnapshot, QuotationTerms } from '@/lib/quotation-document';

/**
 * Service métier des factures.
 *
 * Principes :
 *  - une facture est un document **autonome** : elle conserve sa propre copie
 *    des coordonnées, des lignes et des totaux. Modifier ou supprimer le devis
 *    d'origine ne change jamais une facture émise (cohérence historique) ;
 *  - les totaux sont recalculés par le moteur unique de calcul (`quotation-calculator`) ;
 *  - le statut de règlement découle des règlements enregistrés, jamais saisi à la main ;
 *  - toutes les requêtes sont filtrées par `organizationId` (isolation multi-tenant).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceItemInput {
  id?: string | null;
  productId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: string | number;
  unitPrice: string | number;
  discountType?: DiscountKind | null;
  discountValue?: string | number | null;
  taxRate?: string | number | null;
  position?: number;
}

export interface InvoiceInput {
  title?: string;
  customerId?: string | null;
  customerSnapshot?: CustomerSnapshot | null;
  /**
   * Instantané de l'entreprise émettrice au moment de l'émission.
   * S'il n'est pas fourni, il est construit depuis la fiche entreprise courante :
   * une facture ne doit jamais être générée sans le bloc émetteur.
   */
  companySnapshot?: CompanySnapshot | null;
  reference?: string | null;
  customerReference?: string | null;
  currency?: string;
  locale?: string;
  issueDate?: Date | string;
  dueDate?: Date | string | null;
  status?: InvoiceStatus;
  templateKey?: string;
  customization?: Record<string, unknown> | null;
  pricesIncludeTax?: boolean;
  globalDiscountType?: DiscountKind | null;
  globalDiscountValue?: string | number | null;
  notes?: string | null;
  terms?: QuotationTerms | null;
  items: InvoiceItemInput[];
  sourceQuotationNumber?: string | null;
  sourceQuotationId?: string | null;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

export interface InvoicePaymentSummary {
  amountPaid: number;
  balance: number;
  total: number;
  status: InvoiceStatus;
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// Numérotation et échéance
// ---------------------------------------------------------------------------

export const DEFAULT_INVOICE_NUMBERING_FORMAT = 'FAC-{YYYY}-{SEQ:4}';

/**
 * Génère le prochain numéro de facture (séquence indépendante de celle des devis).
 * La ligne de réglages est verrouillée : deux créations simultanées ne peuvent
 * pas produire le même numéro.
 */
export async function nextInvoiceNumber(organizationId: string, issueDate = new Date()): Promise<string> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT * FROM organization_settings WHERE organization_id = ${organizationId} FOR UPDATE`);
    let settings = locked.rows[0] as
      | {
          invoice_numbering_format: string | null;
          invoice_numbering_next_value: number | null;
          invoice_numbering_year: number | null;
          numbering_reset_yearly: boolean | null;
        }
      | undefined;

    if (!settings) {
      await tx.insert(organizationSettings).values({ organizationId }).onConflictDoNothing();
      const created = await tx.execute(sql`SELECT * FROM organization_settings WHERE organization_id = ${organizationId} FOR UPDATE`);
      settings = created.rows[0] as unknown as typeof settings;
    }

    const year = issueDate.getFullYear();
    const resetYearly = settings?.numbering_reset_yearly ?? true;
    const storedYear = settings?.invoice_numbering_year ?? null;
    const sequence = resetYearly && storedYear !== year ? 1 : settings?.invoice_numbering_next_value ?? 1;
    const format = settings?.invoice_numbering_format ?? DEFAULT_INVOICE_NUMBERING_FORMAT;

    const number = renderQuotationNumber(format, { year, month: issueDate.getMonth() + 1, sequence });

    await tx
      .update(organizationSettings)
      .set({ invoiceNumberingNextValue: sequence + 1, invoiceNumberingYear: year, updatedAt: new Date() })
      .where(eq(organizationSettings.organizationId, organizationId));

    return number;
  });
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function getInvoiceSettings(organizationId: string) {
  const [settings] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  if (settings) return settings;
  const [created] = await db.insert(organizationSettings).values({ organizationId }).onConflictDoNothing().returning();
  if (created) return created;
  const [fallback] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  return fallback;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface ListInvoicesFilters {
  search?: string;
  status?: InvoiceStatus[];
  customerId?: string;
  from?: Date;
  to?: Date;
  archived?: boolean;
  deleted?: boolean;
  overdueOnly?: boolean;
  sort?: 'recent' | 'oldest' | 'amount_desc' | 'amount_asc' | 'due_date' | 'number';
  page?: number;
  pageSize?: number;
}

export async function listInvoices(organizationId: string, filters: ListInvoicesFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);

  const conditions = [eq(invoices.organizationId, organizationId)];
  if (filters.deleted) {
    conditions.push(sql`${invoices.deletedAt} is not null`);
  } else {
    conditions.push(isNull(invoices.deletedAt));
  }
  if (filters.archived !== undefined) conditions.push(eq(invoices.isArchived, filters.archived));
  if (filters.status && filters.status.length > 0) conditions.push(inArray(invoices.status, filters.status));
  if (filters.customerId) conditions.push(eq(invoices.customerId, filters.customerId));
  if (filters.from) conditions.push(gte(invoices.issueDate, filters.from));
  if (filters.to) conditions.push(lte(invoices.issueDate, filters.to));
  if (filters.overdueOnly) {
    conditions.push(sql`${invoices.dueDate} < now()`);
    conditions.push(sql`${invoices.status} not in ('PAID','CANCELLED')`);
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${invoices.number}) like ${term}`,
        sql`lower(${invoices.title}) like ${term}`,
        sql`lower(coalesce(${invoices.sourceQuotationNumber}, '')) like ${term}`,
        sql`lower(coalesce(${invoices.customerSnapshot} ->> 'name', '')) like ${term}`,
        sql`lower(coalesce(${invoices.customerSnapshot} ->> 'companyName', '')) like ${term}`,
      )!,
    );
  }

  const where = and(...conditions);

  const orderBy = (() => {
    switch (filters.sort) {
      case 'oldest':
        return [asc(invoices.issueDate)];
      case 'amount_desc':
        return [desc(invoices.total)];
      case 'amount_asc':
        return [asc(invoices.total)];
      case 'due_date':
        return [asc(invoices.dueDate)];
      case 'number':
        return [desc(invoices.number)];
      default:
        return [desc(invoices.issueDate), desc(invoices.createdAt)];
    }
  })();

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)::int` }).from(invoices).where(where),
  ]);

  const total = Number(countRows[0]?.value ?? 0);
  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getInvoiceOrThrow(organizationId: string, invoiceId: string): Promise<Invoice> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId), isNull(invoices.deletedAt)))
    .limit(1);
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  return invoice;
}

export async function listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  return db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.position), asc(invoiceItems.id));
}

export async function listInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  return db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, invoiceId))
    .orderBy(desc(invoicePayments.paidAt), desc(invoicePayments.createdAt));
}

export async function getInvoiceWithDetails(organizationId: string, invoiceId: string) {
  const invoice = await getInvoiceOrThrow(organizationId, invoiceId);
  const [items, payments] = await Promise.all([listInvoiceItems(invoiceId), listInvoicePayments(invoiceId)]);
  return { invoice, items, payments, summary: summarizePayments(invoice, payments) };
}

export async function listInvoiceStatusHistory(invoiceId: string) {
  return db
    .select()
    .from(invoiceStatusHistory)
    .where(eq(invoiceStatusHistory.invoiceId, invoiceId))
    .orderBy(desc(invoiceStatusHistory.createdAt));
}

/** Factures issues d'un devis donné (traçabilité dans la vue devis). */
export async function listInvoicesForQuotation(organizationId: string, quotationId: string) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.quotationId, quotationId), isNull(invoices.deletedAt)))
    .orderBy(desc(invoices.issueDate));
}

export async function listCustomerInvoices(organizationId: string, customerId: string, limit = 50) {
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.customerId, customerId), isNull(invoices.deletedAt)))
    .orderBy(desc(invoices.issueDate))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

/** Recalcule les totaux d'une facture à partir de ses lignes (source unique de vérité). */
export function computeInvoiceTotals(
  invoice: Pick<Invoice, 'globalDiscountType' | 'globalDiscountValue' | 'pricesIncludeTax'>,
  items: Pick<InvoiceItem, 'quantity' | 'unitPrice' | 'discountType' | 'discountValue' | 'taxRate'>[],
): QuotationTotals {
  return calculateQuotation({
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
}

export function summarizePayments(
  invoice: Pick<Invoice, 'total' | 'amountPaid' | 'dueDate' | 'status'>,
  payments: Pick<InvoicePayment, 'amount'>[] = [],
): InvoicePaymentSummary {
  const total = toAmountNumber(invoice.total);
  const paid =
    payments.length > 0
      ? payments.reduce((sum, payment) => sum + toAmountNumber(payment.amount), 0)
      : toAmountNumber(invoice.amountPaid);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const isOverdue = Boolean(invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now()) && balance > 0 && invoice.status !== 'CANCELLED';
  return { total, amountPaid: Math.round(paid * 100) / 100, balance, status: invoice.status, isOverdue };
}

/** Statut de règlement déduit des montants (jamais saisi manuellement). */
export function deriveSettlementStatus(
  current: InvoiceStatus,
  input: { total: number; paid: number; dueDate: Date | null },
): InvoiceStatus {
  if (current === 'CANCELLED' || current === 'DRAFT') return current;
  if (input.paid <= 0) {
    if (input.dueDate && input.dueDate.getTime() < Date.now()) return 'OVERDUE';
    return 'SENT';
  }
  if (input.paid + 0.005 >= input.total) return 'PAID';
  return 'PARTIALLY_PAID';
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

interface PersistContext {
  organizationId: string;
  userId: string;
}

async function persistItems(tx: typeof db, invoiceId: string, items: InvoiceItemInput[], totals: QuotationTotals) {
  if (items.length === 0) return;
  await tx.insert(invoiceItems).values(
    items.map((item, index) => {
      const line = totals.lines[index];
      return {
        invoiceId,
        productId: item.productId ?? null,
        position: item.position ?? index,
        name: item.name,
        description: item.description ?? null,
        unit: item.unit ?? 'unité',
        quantity: toNumberString(item.quantity),
        unitPrice: toNumberString(item.unitPrice),
        discountType: item.discountType ?? null,
        discountValue: toNumberString(item.discountValue ?? 0),
        taxRate: toNumberString(item.taxRate ?? 0),
        lineGross: toMoneyString(line?.lineGross ?? 0),
        lineDiscount: toMoneyString(line?.lineDiscount ?? 0),
        lineNet: toMoneyString(line?.lineNet ?? 0),
        lineTax: toMoneyString(line?.lineTax ?? 0),
        lineTotal: toMoneyString(line?.lineTotal ?? 0),
      };
    }),
  );
}

async function recordHistory(
  tx: typeof db,
  invoiceId: string,
  fromStatus: InvoiceStatus | null,
  toStatus: InvoiceStatus,
  actorUserId: string | null,
  note?: string | null,
) {
  await tx.insert(invoiceStatusHistory).values({
    invoiceId,
    fromStatus,
    toStatus,
    actorUserId,
    note: note ?? null,
  });
}

/** Création d'une facture (manuelle ou depuis un devis). */
export async function createInvoice({
  organizationId,
  userId,
  input,
}: PersistContext & { input: InvoiceInput }): Promise<InvoiceWithItems> {
  const settings = await getInvoiceSettings(organizationId);
  const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
  const dueDays = settings?.invoiceDueDays ?? 30;
  const dueDate = input.dueDate ? new Date(input.dueDate) : addDays(issueDate, dueDays);
  const currency = input.currency ?? settings?.defaultCurrency ?? 'XOF';

  const pricing = { globalDiscountType: input.globalDiscountType ?? null, globalDiscountValue: input.globalDiscountValue ?? 0, pricesIncludeTax: Boolean(input.pricesIncludeTax) };
  const totals = computeInvoiceTotals(
    { globalDiscountType: pricing.globalDiscountType, globalDiscountValue: String(pricing.globalDiscountValue), pricesIncludeTax: pricing.pricesIncludeTax },
    input.items.map((item) => ({
      quantity: toNumberString(item.quantity),
      unitPrice: toNumberString(item.unitPrice),
      discountType: item.discountType ?? null,
      discountValue: toNumberString(item.discountValue ?? 0),
      taxRate: toNumberString(item.taxRate ?? 0),
    })),
  );

  // Instantané de l'entreprise : copie figée des mentions légales et coordonnées
  // de paiement, pour que la facture reste conforme même si la fiche change ensuite.
  const companySnapshot = input.companySnapshot ?? (await buildCompanySnapshot(organizationId));

  const document = await db.transaction(async (tx) => {
    const number = await nextInvoiceNumber(organizationId, issueDate);

    const [created] = await tx
      .insert(invoices)
      .values({
        organizationId,
        customerId: input.customerId ?? null,
        quotationId: input.sourceQuotationId ?? null,
        createdById: userId,
        number,
        title: input.title?.trim() || 'Facture',
        status: input.status ?? 'DRAFT',
        currency,
        locale: input.locale ?? settings?.locale ?? 'fr-FR',
        issueDate,
        dueDate,
        sourceQuotationNumber: input.sourceQuotationNumber ?? null,
        reference: input.reference ?? null,
        customerReference: input.customerReference ?? null,
        templateKey: input.templateKey ?? settings?.defaultTemplateKey ?? 'minimaliste',
        customization: input.customization ?? null,
        pricesIncludeTax: pricing.pricesIncludeTax,
        subtotal: toMoneyString(totals.subtotal),
        lineDiscountTotal: toMoneyString(totals.lineDiscountTotal),
        globalDiscountType: pricing.globalDiscountType,
        globalDiscountValue: toNumberString(pricing.globalDiscountValue),
        globalDiscountTotal: toMoneyString(totals.globalDiscountTotal),
        netBeforeTax: toMoneyString(totals.netBeforeTax),
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        customerSnapshot: (input.customerSnapshot ?? null) as unknown as Record<string, unknown> | null,
        companySnapshot: (companySnapshot ?? null) as unknown as Record<string, unknown> | null,
        terms: (input.terms ?? null) as unknown as Record<string, unknown> | null,
        notes: input.notes ?? null,
      })
      .returning();

    await persistItems(tx as unknown as typeof db, created.id, input.items, totals);
    await recordHistory(tx as unknown as typeof db, created.id, null, created.status, userId, 'Création de la facture');

    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, created.id)).orderBy(asc(invoiceItems.position));
    return { ...created, items } as InvoiceWithItems;
  });

  return document;
}

export interface ConvertQuotationOptions {
  /** Autorise la conversion d'un devis qui n'est pas encore accepté (décision explicite du propriétaire). */
  allowNonAccepted?: boolean;
  dueDays?: number;
  title?: string;
}

/**
 * Convertit un devis en facture.
 * La facture copie intégralement le devis (instantanés entreprise/client, lignes,
 * remises, TVA, conditions) : elle reste valable même si le devis est ensuite modifié.
 */
export async function createInvoiceFromQuotation({
  organizationId,
  userId,
  quotationId,
  options = {},
}: PersistContext & { quotationId: string; options?: ConvertQuotationOptions }): Promise<InvoiceWithItems> {
  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId), isNull(quotations.deletedAt)))
    .limit(1);

  if (!quotation) throw new NotFoundError('Devis introuvable.');
  if (quotation.status !== 'ACCEPTED' && !options.allowNonAccepted) {
    throw new AuthorizationError(
      'Seul un devis accepté peut être converti en facture. Marquez d’abord le devis comme accepté, ou confirmez la conversion exceptionnelle.',
    );
  }
  if (quotation.status === 'CANCELLED') {
    throw new AuthorizationError('Un devis annulé ne peut pas être converti en facture.');
  }

  const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId)).orderBy(asc(quotationItems.position));

  if (items.length === 0) {
    throw new AuthorizationError('Ce devis ne contient aucune ligne : ajoutez au moins une prestation avant de facturer.');
  }

  const settings = await getInvoiceSettings(organizationId);
  const issueDate = new Date();
  const dueDays = options.dueDays ?? settings?.invoiceDueDays ?? 30;

  return createInvoice({
    organizationId,
    userId,
    input: {
      title: options.title ?? quotation.title,
      customerId: quotation.customerId,
      customerSnapshot: quotation.customerSnapshot as unknown as CustomerSnapshot | null,
      companySnapshot: quotation.companySnapshot as unknown as CompanySnapshot | null,
      reference: quotation.reference,
      customerReference: quotation.customerReference,
      currency: quotation.currency,
      locale: quotation.locale,
      issueDate,
      dueDate: addDays(issueDate, dueDays),
      templateKey: quotation.templateKey,
      customization: quotation.customization as Record<string, unknown> | null,
      pricesIncludeTax: quotation.pricesIncludeTax,
      globalDiscountType: quotation.globalDiscountType,
      globalDiscountValue: quotation.globalDiscountValue,
      notes: quotation.notes,
      terms: quotation.terms as unknown as QuotationTerms | null,
      sourceQuotationNumber: quotation.number,
      sourceQuotationId: quotation.id,
      items: items.map((item) => ({
        productId: item.productId,
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRate: item.taxRate,
        position: item.position,
      })),
    },
  });
}

/** Mise à jour d'une facture (uniquement tant qu'elle est en brouillon). */
export async function updateInvoice({
  organizationId,
  userId,
  invoiceId,
  input,
}: PersistContext & { invoiceId: string; input: InvoiceInput }): Promise<InvoiceWithItems> {
  const existing = await getInvoiceOrThrow(organizationId, invoiceId);
  if (existing.status !== 'DRAFT') {
    throw new AuthorizationError(
      'Une facture émise ne peut plus être modifiée (cohérence comptable). Créez un avoir ou annulez la facture, puis émettez-en une nouvelle.',
    );
  }

  const totals = computeInvoiceTotals(
    {
      globalDiscountType: input.globalDiscountType ?? existing.globalDiscountType,
      globalDiscountValue: toNumberString(input.globalDiscountValue ?? existing.globalDiscountValue),
      pricesIncludeTax: input.pricesIncludeTax ?? existing.pricesIncludeTax,
    },
    input.items.map((item) => ({
      quantity: toNumberString(item.quantity),
      unitPrice: toNumberString(item.unitPrice),
      discountType: item.discountType ?? null,
      discountValue: toNumberString(item.discountValue ?? 0),
      taxRate: toNumberString(item.taxRate ?? 0),
    })),
  );

  return db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        customerId: input.customerId === undefined ? existing.customerId : input.customerId,
        title: input.title?.trim() || existing.title,
        currency: input.currency ?? existing.currency,
        issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        dueDate: input.dueDate === undefined ? existing.dueDate : input.dueDate ? new Date(input.dueDate) : null,
        reference: input.reference === undefined ? existing.reference : input.reference,
        customerReference: input.customerReference === undefined ? existing.customerReference : input.customerReference,
        templateKey: input.templateKey ?? existing.templateKey,
        customization: (input.customization ?? existing.customization) as unknown as Record<string, unknown> | null,
        pricesIncludeTax: input.pricesIncludeTax ?? existing.pricesIncludeTax,
        globalDiscountType: input.globalDiscountType ?? existing.globalDiscountType,
        globalDiscountValue: toNumberString(input.globalDiscountValue ?? existing.globalDiscountValue),
        subtotal: toMoneyString(totals.subtotal),
        lineDiscountTotal: toMoneyString(totals.lineDiscountTotal),
        globalDiscountTotal: toMoneyString(totals.globalDiscountTotal),
        netBeforeTax: toMoneyString(totals.netBeforeTax),
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        customerSnapshot: (input.customerSnapshot ?? existing.customerSnapshot) as unknown as Record<string, unknown> | null,
        terms: (input.terms ?? existing.terms) as unknown as Record<string, unknown> | null,
        notes: input.notes === undefined ? existing.notes : input.notes,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    await persistItems(tx as unknown as typeof db, invoiceId, input.items, totals);

    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).orderBy(asc(invoiceItems.position));
    const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    void userId;
    return { ...updated, items } as InvoiceWithItems;
  });
}

/** Changement de statut manuel (envoi, annulation, correction). */
export async function changeInvoiceStatus({
  organizationId,
  invoiceId,
  userId,
  status,
  note,
}: PersistContext & { invoiceId: string; status: InvoiceStatus; note?: string | null }): Promise<Invoice> {
  const existing = await getInvoiceOrThrow(organizationId, invoiceId);
  if (existing.status === status) return existing;

  const allowed = ALLOWED_INVOICE_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(status)) {
    throw new AuthorizationError(`Transition impossible : ${existing.status} → ${status}.`);
  }
  if (status === 'PAID') {
    const payments = await listInvoicePayments(invoiceId);
    const summary = summarizePayments(existing, payments);
    if (summary.balance > 0) {
      throw new AuthorizationError(
        'Le solde de la facture n’est pas nul : enregistrez les règlements reçus avant de la marquer payée.',
      );
    }
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(invoices)
      .set({
        status,
        sentAt: status === 'SENT' && !existing.sentAt ? new Date() : existing.sentAt,
        paidAt: status === 'PAID' ? existing.paidAt ?? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await recordHistory(tx as unknown as typeof db, invoiceId, existing.status, status, userId, note ?? null);
    return updated;
  });
}

export interface RecordPaymentInput {
  organizationId: string;
  invoiceId: string;
  userId: string;
  amount: string | number;
  method?: InvoicePaymentMethod;
  paidAt?: Date | string;
  reference?: string | null;
  note?: string | null;
}

/** Enregistre un règlement et met à jour l'état de la facture (transaction atomique). */
export async function recordInvoicePayment(input: RecordPaymentInput) {
  const amount = toAmountNumber(input.amount);
  if (amount <= 0) {
    throw new AuthorizationError('Le montant du règlement doit être supérieur à zéro.');
  }

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT * FROM invoices WHERE id = ${input.invoiceId} AND organization_id = ${input.organizationId} FOR UPDATE`);
    const row = locked.rows[0] as unknown as Invoice | undefined;
    if (!row) throw new NotFoundError('Facture introuvable.');
    if (row.status === 'CANCELLED') {
      throw new AuthorizationError('Impossible d’enregistrer un règlement sur une facture annulée.');
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    await tx.insert(invoicePayments).values({
      invoiceId: input.invoiceId,
      organizationId: input.organizationId,
      amount: toMoneyString(amount),
      method: input.method ?? 'BANK_TRANSFER',
      reference: input.reference ?? null,
      note: input.note ?? null,
      paidAt,
      recordedById: input.userId,
    });

    const totals = await tx
      .select({ value: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)::text` })
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, input.invoiceId));

    const totalPaid = Number(totals[0]?.value ?? 0);
    const invoiceTotal = toAmountNumber(row.total);
    const nextStatus = deriveSettlementStatus(row.status, {
      total: invoiceTotal,
      paid: totalPaid,
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
    });

    const [updated] = await tx
      .update(invoices)
      .set({
        amountPaid: toMoneyString(totalPaid),
        status: nextStatus,
        paidAt: nextStatus === 'PAID' ? paidAt : null,
        sentAt: row.sentAt ?? (nextStatus !== 'DRAFT' ? paidAt : null),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, input.invoiceId))
      .returning();

    if (nextStatus !== row.status) {
      await recordHistory(tx as unknown as typeof db, input.invoiceId, row.status, nextStatus, input.userId, 'Mise à jour automatique par règlement');
    }

    return { invoice: updated, statusChanged: nextStatus !== row.status, paymentsTotal: totalPaid };
  });
}

export async function deleteInvoicePayment({
  organizationId,
  invoiceId,
  paymentId,
  userId,
}: PersistContext & { invoiceId: string; paymentId: string }) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT * FROM invoices WHERE id = ${invoiceId} AND organization_id = ${organizationId} FOR UPDATE`);
    const row = locked.rows[0] as unknown as Invoice | undefined;
    if (!row) throw new NotFoundError('Facture introuvable.');

    const [payment] = await tx
      .select()
      .from(invoicePayments)
      .where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId), eq(invoicePayments.organizationId, organizationId)))
      .limit(1);
    if (!payment) throw new NotFoundError('Règlement introuvable.');

    await tx.delete(invoicePayments).where(eq(invoicePayments.id, paymentId));

    const totals = await tx
      .select({ value: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)::text` })
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, invoiceId));
    const totalPaid = Number(totals[0]?.value ?? 0);

    const nextStatus = deriveSettlementStatus(row.status === 'PAID' ? 'SENT' : row.status, {
      total: toAmountNumber(row.total),
      paid: totalPaid,
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
    });

    const [updated] = await tx
      .update(invoices)
      .set({
        amountPaid: toMoneyString(totalPaid),
        status: row.status === 'CANCELLED' ? 'CANCELLED' : nextStatus,
        paidAt: nextStatus === 'PAID' ? row.paidAt : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (updated.status !== row.status) {
      await recordHistory(tx as unknown as typeof db, invoiceId, row.status, updated.status, userId, 'Suppression d’un règlement');
    }

    return updated;
  });
}

export async function archiveInvoice(organizationId: string, invoiceId: string, archived = true): Promise<void> {
  await getInvoiceOrThrow(organizationId, invoiceId);
  await db.update(invoices).set({ isArchived: archived, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
}

export async function softDeleteInvoice(organizationId: string, invoiceId: string): Promise<void> {
  await getInvoiceOrThrow(organizationId, invoiceId);
  await db.update(invoices).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
}

export async function restoreInvoice(organizationId: string, invoiceId: string): Promise<void> {
  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  await db.update(invoices).set({ deletedAt: null, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
}

/**
 * Marque comme « en retard » les factures dont l'échéance est dépassée et dont
 * le solde n'est pas nul. Retourne le nombre de factures mises à jour.
 */
export async function markOverdueInvoices(organizationId?: string): Promise<number> {
  const conditions = [
    sql`${invoices.deletedAt} is null`,
    sql`${invoices.dueDate} is not null`,
    sql`${invoices.dueDate} < now()`,
    sql`${invoices.status} in ('SENT','PARTIALLY_PAID')`,
  ];
  if (organizationId) conditions.push(eq(invoices.organizationId, organizationId));

  const rows = await db
    .select({ id: invoices.id, status: invoices.status, organizationId: invoices.organizationId })
    .from(invoices)
    .where(and(...conditions))
    .limit(500);

  if (rows.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.update(invoices).set({ status: 'OVERDUE', updatedAt: new Date() }).where(eq(invoices.id, row.id));
      await recordHistory(tx as unknown as typeof db, row.id, row.status, 'OVERDUE', null, 'Échéance dépassée (contrôle automatique)');
    }
  });

  return rows.length;
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------

export interface InvoiceStats {
  count: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
  currency: string;
  statusBreakdown: { status: InvoiceStatus; count: number; amount: number }[];
  monthly: { month: string; label: string; billed: number; paid: number }[];
  aging: { bucket: string; label: string; amount: number; count: number }[];
  paymentMethods: { method: InvoicePaymentMethod; label: string; amount: number; count: number }[];
}

/**
 * Agrège l'activité de facturation d'une organisation pour une période.
 * Les montants d'une devise ne sont jamais additionnés à ceux d'une autre.
 */
export async function getInvoiceStats(
  organizationId: string,
  period: { from: Date; to: Date },
  currency: string,
): Promise<InvoiceStats> {
  const [statusRows, monthlyRows, agingRows, methodRows, paymentRows] = await Promise.all([
    db.execute<{ status: InvoiceStatus; count: number; amount: string; paid: string }>(sql`
      select status, count(*)::int as count,
             coalesce(sum(total), 0)::text as amount,
             coalesce(sum(amount_paid), 0)::text as paid
      from invoices
      where organization_id = ${organizationId}
        and deleted_at is null
        and is_archived = false
        and currency = ${currency}
        and issue_date >= ${period.from}
        and issue_date <= ${period.to}
      group by status
    `),
    db.execute<{ month: string; billed: string; paid: string }>(sql`
      select to_char(date_trunc('month', issue_date), 'YYYY-MM') as month,
             coalesce(sum(total), 0)::text as billed,
             coalesce(sum(amount_paid), 0)::text as paid
      from invoices
      where organization_id = ${organizationId}
        and deleted_at is null
        and currency = ${currency}
        and issue_date >= ${period.from}
        and issue_date <= ${period.to}
      group by 1
      order by 1
    `),
    db.execute<{ bucket: string; amount: string; count: number }>(sql`
      select case
               when due_date is null then 'no_due'
               when due_date >= now() then 'not_due'
               when due_date >= now() - interval '30 days' then 'd1_30'
               when due_date >= now() - interval '60 days' then 'd31_60'
               else 'd60_plus'
             end as bucket,
             coalesce(sum(total - amount_paid), 0)::text as amount,
             count(*)::int as count
      from invoices
      where organization_id = ${organizationId}
        and deleted_at is null
        and status not in ('PAID','CANCELLED','DRAFT')
        and currency = ${currency}
      group by 1
    `),
    db.execute<{ method: InvoicePaymentMethod; amount: string; count: number }>(sql`
      select method, coalesce(sum(amount), 0)::text as amount, count(*)::int as count
      from invoice_payments
      where organization_id = ${organizationId}
        and paid_at >= ${period.from}
        and paid_at <= ${period.to}
      group by 1
      order by 2 desc
    `),
    db.execute<{ total: string }>(sql`
      select coalesce(sum(amount), 0)::text as total
      from invoice_payments
      where organization_id = ${organizationId}
        and paid_at >= ${period.from}
        and paid_at <= ${period.to}
    `),
  ]);

  const statusBreakdown = statusRows.rows.map((row) => ({
    status: row.status,
    count: Number(row.count),
    amount: Number(row.amount),
  }));

  const count = statusBreakdown.reduce((sum, row) => sum + row.count, 0);
  const totalBilled = statusBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const totalPaid = Number(paymentRows.rows[0]?.total ?? 0);
  const outstanding = statusBreakdown
    .filter((row) => !['PAID', 'CANCELLED'].includes(row.status))
    .reduce((sum, row) => sum + (row.amount - Number(statusRows.rows.find((entry) => entry.status === row.status)?.paid ?? 0)), 0);

  const agingLabels: Record<string, string> = {
    not_due: 'Non échu',
    d1_30: '1 à 30 jours de retard',
    d31_60: '31 à 60 jours de retard',
    d60_plus: 'Plus de 60 jours de retard',
    no_due: 'Sans échéance',
  };
  const agingOrder = ['not_due', 'd1_30', 'd31_60', 'd60_plus', 'no_due'];

  const monthLabels = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
  const monthly = monthlyRows.rows.map((row) => {
    const [year, month] = row.month.split('-').map(Number);
    return {
      month: row.month,
      label: monthLabels.format(new Date(year, (month ?? 1) - 1, 1)).replace('.', ''),
      billed: Number(row.billed),
      paid: Number(row.paid),
    };
  });

  const overdueStatus = statusBreakdown.find((row) => row.status === 'OVERDUE');

  return {
    count,
    totalBilled,
    totalPaid,
    outstanding: Math.round(outstanding * 100) / 100,
    overdueCount: overdueStatus?.count ?? 0,
    overdueAmount: overdueStatus?.amount ?? 0,
    paidCount: statusBreakdown.find((row) => row.status === 'PAID')?.count ?? 0,
    currency,
    statusBreakdown,
    monthly,
    aging: agingOrder
      .map((bucket) => {
        const row = agingRows.rows.find((entry) => entry.bucket === bucket);
        return {
          bucket,
          label: agingLabels[bucket] ?? bucket,
          amount: Number(row?.amount ?? 0),
          count: Number(row?.count ?? 0),
        };
      })
      .filter((row) => row.count > 0 || row.amount > 0),
    paymentMethods: methodRows.rows.map((row) => ({
      method: row.method,
      label: row.method,
      amount: Number(row.amount),
      count: Number(row.count),
    })),
  };
}

/** Commandes de tableau de bord : factures récentes et urgences de recouvrement. */
export async function listRecentInvoices(organizationId: string, limit = 5) {
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), isNull(invoices.deletedAt), eq(invoices.isArchived, false)))
    .orderBy(desc(invoices.issueDate))
    .limit(limit);
}

export async function listOverdueInvoices(organizationId: string, limit = 10) {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
        eq(invoices.isArchived, false),
        sql`${invoices.status} = 'OVERDUE'`,
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(limit);
}
