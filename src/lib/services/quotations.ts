import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  companyProfiles,
  customers,
  organizationSettings,
  quotationItems,
  quotationStatusHistory,
  quotations,
  type DiscountKind,
  type Quotation,
  type QuotationItem,
  type QuotationStatus,
  users,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { calculateQuotation, type QuotationTotals } from '@/lib/quotation-calculator';
import { mergeTemplateStyle, type TemplateCustomization, type TemplateStyle } from '@/lib/templates';
import type { CompanySnapshot, CustomerSnapshot, QuotationTerms } from '@/lib/quotation-document';
import { renderQuotationNumber } from '@/lib/numbering';
import { ALLOWED_STATUS_TRANSITIONS } from '@/lib/constants';
import { AuthorizationError, NotFoundError } from '@/lib/auth/guards';
import { toMoneyString, toNumberString } from '@/lib/money';

/**
 * Service métier des devis.
 *
 * Toutes les écritures passent par ici afin de garantir :
 *  - l'isolation par organisation (aucune requête sans filtre `organizationId`) ;
 *  - la cohérence des totaux (moteur de calcul unique) ;
 *  - la traçabilité (historique de statut + journal d'audit appelé par les actions) ;
 *  - l'unicité du numéro de devis par organisation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuotationItemInput {
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
}

export interface QuotationInput {
  title?: string;
  customerId?: string | null;
  customerSnapshot?: CustomerSnapshot | null;
  reference?: string | null;
  customerReference?: string | null;
  currency?: string;
  locale?: string;
  issueDate?: Date | string;
  validUntil?: Date | string | null;
  status?: QuotationStatus;
  templateKey?: string;
  customization?: TemplateCustomization | null;
  pricesIncludeTax?: boolean;
  globalDiscountType?: DiscountKind | null;
  globalDiscountValue?: string | number | null;
  depositAmount?: string | number | null;
  notes?: string | null;
  internalNotes?: string | null;
  terms?: QuotationTerms | null;
  items: QuotationItemInput[];
  companyProfileId?: string | null;
}

export interface QuotationWithItems extends Quotation {
  items: QuotationItem[];
}

// ---------------------------------------------------------------------------
// Réglages et numérotation
// ---------------------------------------------------------------------------

export async function getOrganizationSettings(organizationId: string) {
  const [existing] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(organizationSettings)
    .values({ organizationId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [fallback] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  return fallback;
}

/**
 * Génère le prochain numéro de devis de manière atomique.
 * La ligne de réglages est verrouillée (SELECT … FOR UPDATE) : deux créations
 * simultanées ne peuvent pas produire le même numéro.
 */
export async function nextQuotationNumber(organizationId: string, issueDate = new Date()): Promise<string> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT * FROM organization_settings WHERE organization_id = ${organizationId} FOR UPDATE`,
    );
    let settings = locked.rows[0] as
      | { numbering_format: string; numbering_next_value: number; numbering_reset_yearly: boolean; numbering_year: number | null }
      | undefined;

    if (!settings) {
      await tx.insert(organizationSettings).values({ organizationId });
      const created = await tx.execute(sql`SELECT * FROM organization_settings WHERE organization_id = ${organizationId} FOR UPDATE`);
      settings = created.rows[0] as unknown as typeof settings;
    }

    const year = issueDate.getFullYear();
    const resetYearly = settings?.numbering_reset_yearly ?? true;
    const storedYear = settings?.numbering_year ?? null;
    let sequence = settings?.numbering_next_value ?? 1;

    if (resetYearly && storedYear !== year) {
      sequence = 1;
    }

    const format = settings?.numbering_format ?? 'DEV-{YYYY}-{SEQ:4}';
    const number = renderQuotationNumber(format, { year, month: issueDate.getMonth() + 1, sequence });

    await tx
      .update(organizationSettings)
      .set({ numberingNextValue: sequence + 1, numberingYear: year, updatedAt: new Date() })
      .where(eq(organizationSettings.organizationId, organizationId));

    return number;
  });
}

// ---------------------------------------------------------------------------
// Instantanés (historique figé)
// ---------------------------------------------------------------------------

export async function buildCompanySnapshot(organizationId: string, companyProfileId?: string | null): Promise<CompanySnapshot | null> {
  const [profile] = companyProfileId
    ? await db
        .select()
        .from(companyProfiles)
        .where(and(eq(companyProfiles.organizationId, organizationId), eq(companyProfiles.id, companyProfileId)))
        .limit(1)
    : await db
        .select()
        .from(companyProfiles)
        .where(eq(companyProfiles.organizationId, organizationId))
        .orderBy(desc(companyProfiles.isDefault), asc(companyProfiles.createdAt))
        .limit(1);

  if (!profile) return null;
  return {
    name: profile.name,
    logoUrl: profile.logoUrl,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    postalCode: profile.postalCode,
    city: profile.city,
    country: profile.country,
    countryCode: profile.countryCode,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    registrationNumber: profile.registrationNumber,
    taxId: profile.taxId,
    legalInfo: profile.legalInfo,
    bankDetails: profile.bankDetails,
    paymentInfo: profile.paymentInfo,
    signatureLabel: profile.signatureLabel,
  };
}

export async function buildCustomerSnapshot(
  organizationId: string,
  customerId: string | null | undefined,
): Promise<CustomerSnapshot | null> {
  if (!customerId) return null;
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
    .limit(1);
  if (!customer) throw new NotFoundError('Client introuvable.');
  return customerToSnapshot(customer);
}

export function customerToSnapshot(customer: {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  taxId: string | null;
}): CustomerSnapshot {
  return {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    postalCode: customer.postalCode,
    city: customer.city,
    country: customer.country,
    countryCode: customer.countryCode,
    taxId: customer.taxId,
  };
}

export type { CompanySnapshot, CustomerSnapshot, QuotationTerms, QuotationDocumentData } from '@/lib/quotation-document';
export { buildDocumentData } from '@/lib/quotation-document';

// ---------------------------------------------------------------------------
// Création / mise à jour
// ---------------------------------------------------------------------------

function computeTotals(input: QuotationInput): QuotationTotals {
  return calculateQuotation({
    lines: input.items.map((item) => ({
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? 0,
      discountType: item.discountType ?? null,
      discountValue: item.discountValue ?? 0,
      taxRate: item.taxRate ?? 0,
    })),
    globalDiscountType: input.globalDiscountType ?? null,
    globalDiscountValue: input.globalDiscountValue ?? 0,
    pricesIncludeTax: input.pricesIncludeTax ?? false,
    depositAmount: input.depositAmount ?? 0,
  });
}

function totalsToColumns(totals: QuotationTotals) {
  return {
    subtotal: toMoneyString(totals.subtotal),
    lineDiscountTotal: toMoneyString(totals.lineDiscountTotal),
    globalDiscountTotal: toMoneyString(totals.globalDiscountTotal),
    netBeforeTax: toMoneyString(totals.netBeforeTax),
    taxTotal: toMoneyString(totals.taxTotal),
    total: toMoneyString(totals.total),
    depositAmount: toMoneyString(totals.depositAmount),
    amountDue: toMoneyString(totals.amountDue),
  };
}

function buildItemRows(quotationId: string, input: QuotationInput, totals: QuotationTotals) {
  return input.items.map((item, index) => {
    const line = totals.lines[index];
    return {
      id: item.id && item.id.length > 0 ? item.id : newId(),
      quotationId,
      productId: item.productId ?? null,
      position: index,
      name: item.name.trim().slice(0, 300),
      description: item.description?.trim() || null,
      unit: item.unit?.trim() || 'unité',
      quantity: toNumberString(item.quantity ?? 0, 4),
      unitPrice: toNumberString(item.unitPrice ?? 0, 4),
      discountType: (item.discountType ?? null) as DiscountKind | null,
      discountValue: toNumberString(item.discountValue ?? 0, 4),
      taxRate: toNumberString(item.taxRate ?? 0, 4),
      lineGross: toMoneyString(line.lineGross),
      lineDiscount: toMoneyString(line.lineDiscount),
      lineNet: toMoneyString(line.lineNet),
      lineTax: toMoneyString(line.lineTax),
      lineTotal: toMoneyString(line.lineTotal),
    };
  });
}

export interface CreateQuotationOptions {
  organizationId: string;
  userId: string;
  input: QuotationInput;
}

export async function createQuotation({ organizationId, userId, input }: CreateQuotationOptions): Promise<QuotationWithItems> {
  const settings = await getOrganizationSettings(organizationId);
  const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
  const validUntil = input.validUntil
    ? new Date(input.validUntil)
    : new Date(issueDate.getTime() + settings.defaultValidityDays * 24 * 60 * 60 * 1000);

  const totals = computeTotals(input);
  const number = await nextQuotationNumber(organizationId, issueDate);
  const company = await buildCompanySnapshot(organizationId, input.companyProfileId);
  const customer = input.customerId
    ? await buildCustomerSnapshot(organizationId, input.customerId)
    : (input.customerSnapshot ?? null);

  const quotationId = newId();

  const [quotation] = await db
    .insert(quotations)
    .values({
      id: quotationId,
      organizationId,
      createdById: userId,
      customerId: input.customerId ?? null,
      number,
      title: input.title?.trim() || 'Devis',
      status: input.status ?? 'DRAFT',
      reference: input.reference ?? null,
      customerReference: input.customerReference ?? null,
      currency: input.currency ?? settings.defaultCurrency,
      locale: input.locale ?? settings.locale,
      issueDate,
      validUntil,
      templateKey: input.templateKey ?? settings.defaultTemplateKey,
      customization: (input.customization ?? null) as never,
      pricesIncludeTax: input.pricesIncludeTax ?? settings.pricesIncludeTax,
      globalDiscountType: input.globalDiscountType ?? null,
      globalDiscountValue: toNumberString(input.globalDiscountValue ?? 0, 4),
      companySnapshot: (company ?? null) as never,
      customerSnapshot: (customer ?? null) as never,
      terms: (input.terms ?? buildDefaultTerms(settings)) as never,
      notes: input.notes ?? settings.defaultNotes ?? null,
      internalNotes: input.internalNotes ?? null,
      ...totalsToColumns(totals),
    })
    .returning();

  const itemRows = buildItemRows(quotationId, input, totals);
  if (itemRows.length > 0) {
    await db.insert(quotationItems).values(itemRows);
  }

  await db.insert(quotationStatusHistory).values({
    quotationId,
    fromStatus: null,
    toStatus: quotation.status,
    source: 'MANUAL',
    actorUserId: userId,
    note: 'Création du devis',
  });

  return { ...quotation, items: await listItems(quotationId) };
}

function buildDefaultTerms(settings: { defaultPaymentTerms: string | null; defaultValidityDays: number; defaultTerms: string | null }): QuotationTerms {
  return {
    validityPeriod: `Ce devis est valable ${settings.defaultValidityDays} jours à compter de sa date d’émission.`,
    paymentTerms: settings.defaultPaymentTerms ?? null,
    deliveryTime: null,
    warranty: null,
    specialConditions: settings.defaultTerms ?? null,
    paymentInstructions: null,
    notes: null,
    legalMentions: null,
  };
}

export interface UpdateQuotationOptions {
  organizationId: string;
  userId: string;
  quotationId: string;
  input: QuotationInput;
  /** Modification du statut via le brouillon (édition rapide). */
  allowStatusChange?: boolean;
}

export async function updateQuotation({
  organizationId,
  userId,
  quotationId,
  input,
  allowStatusChange = false,
}: UpdateQuotationOptions): Promise<QuotationWithItems> {
  const existing = await getQuotationOrThrow(organizationId, quotationId);
  const totals = computeTotals(input);
  const company = await buildCompanySnapshot(organizationId, input.companyProfileId);
  const customer = input.customerId
    ? await buildCustomerSnapshot(organizationId, input.customerId)
    : (input.customerSnapshot ?? (existing.customerSnapshot as unknown as CustomerSnapshot | null));

  const nextStatus = allowStatusChange && input.status ? input.status : existing.status;

  await db.transaction(async (tx) => {
    await tx
      .update(quotations)
      .set({
        customerId: input.customerId ?? null,
        title: input.title?.trim() || existing.title,
        reference: input.reference ?? null,
        customerReference: input.customerReference ?? null,
        currency: input.currency ?? existing.currency,
        locale: input.locale ?? existing.locale,
        issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        validUntil: input.validUntil ? new Date(input.validUntil) : input.validUntil === null ? null : existing.validUntil,
        status: nextStatus,
        templateKey: input.templateKey ?? existing.templateKey,
        customization: ((input.customization ?? existing.customization) ?? null) as never,
        pricesIncludeTax: input.pricesIncludeTax ?? existing.pricesIncludeTax,
        globalDiscountType: input.globalDiscountType ?? null,
        globalDiscountValue: toNumberString(input.globalDiscountValue ?? 0, 4),
        companySnapshot: (company ?? (existing.companySnapshot as unknown as CompanySnapshot | null)) as never,
        customerSnapshot: (customer ?? null) as never,
        terms: ((input.terms ?? existing.terms) ?? null) as never,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        updatedAt: new Date(),
        ...totalsToColumns(totals),
      })
      .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)));

    // Remplacement complet des lignes : garantit la cohérence positions/totaux.
    await tx.delete(quotationItems).where(eq(quotationItems.quotationId, quotationId));
    const itemRows = buildItemRows(quotationId, input, totals);
    if (itemRows.length > 0) {
      await tx.insert(quotationItems).values(itemRows);
    }

    if (nextStatus !== existing.status) {
      await tx.insert(quotationStatusHistory).values({
        quotationId,
        fromStatus: existing.status,
        toStatus: nextStatus,
        source: 'MANUAL',
        actorUserId: userId,
        note: 'Statut modifié lors de l’édition',
      });
    }
  });

  return { ...(await getQuotationOrThrow(organizationId, quotationId)), items: await listItems(quotationId) };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getQuotationOrThrow(organizationId: string, quotationId: string): Promise<Quotation> {
  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.organizationId, organizationId), eq(quotations.id, quotationId)))
    .limit(1);
  if (!quotation) throw new NotFoundError('Devis introuvable.');
  return quotation;
}

export async function listItems(quotationId: string): Promise<QuotationItem[]> {
  return db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotationId))
    .orderBy(asc(quotationItems.position));
}

export async function getQuotationWithItems(organizationId: string, quotationId: string): Promise<QuotationWithItems> {
  const quotation = await getQuotationOrThrow(organizationId, quotationId);
  return { ...quotation, items: await listItems(quotationId) };
}

/** Devis d'un client (pour la page client et le CRM). */
export async function getCustomerQuotations(organizationId: string, customerId: string, limit = 50) {
  return db
    .select()
    .from(quotations)
    .where(and(eq(quotations.organizationId, organizationId), eq(quotations.customerId, customerId), isNull(quotations.deletedAt)))
    .orderBy(desc(quotations.issueDate))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Duplication, statuts, archivage, suppression
// ---------------------------------------------------------------------------

export async function duplicateQuotation(organizationId: string, userId: string, quotationId: string): Promise<QuotationWithItems> {
  const source = await getQuotationWithItems(organizationId, quotationId);
  const settings = await getOrganizationSettings(organizationId);
  const now = new Date();

  return createQuotation({
    organizationId,
    userId,
    input: {
      title: `${source.title} (copie)`,
      customerId: source.customerId,
      customerSnapshot: source.customerSnapshot as unknown as CustomerSnapshot | null,
      reference: source.reference,
      customerReference: source.customerReference,
      currency: source.currency,
      locale: source.locale,
      issueDate: now,
      validUntil: new Date(now.getTime() + settings.defaultValidityDays * 24 * 60 * 60 * 1000),
      status: 'DRAFT',
      templateKey: source.templateKey,
      customization: source.customization as unknown as TemplateCustomization | null,
      pricesIncludeTax: source.pricesIncludeTax,
      globalDiscountType: source.globalDiscountType,
      globalDiscountValue: source.globalDiscountValue,
      depositAmount: source.depositAmount,
      notes: source.notes,
      internalNotes: source.internalNotes,
      terms: source.terms as unknown as QuotationTerms | null,
      items: source.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRate: item.taxRate,
      })),
    },
  });
}

export interface ChangeStatusOptions {
  organizationId: string;
  userId: string;
  quotationId: string;
  status: QuotationStatus;
  source?: 'MANUAL' | 'CUSTOMER_LINK' | 'SYSTEM';
  note?: string | null;
  /** Contourne la validation des transitions (utilisé par les décisions client). */
  force?: boolean;
}

export async function changeQuotationStatus({
  organizationId,
  userId,
  quotationId,
  status,
  source = 'MANUAL',
  note = null,
  force = false,
}: ChangeStatusOptions): Promise<Quotation> {
  const quotation = await getQuotationOrThrow(organizationId, quotationId);
  if (quotation.status === status) return quotation;

  if (!force) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[quotation.status] ?? [];
    if (!allowed.includes(status)) {
      throw new AuthorizationError(
        `Transition de statut non autorisée : « ${quotation.status} » → « ${status} ».`,
      );
    }
  }

  const decided = status === 'ACCEPTED' || status === 'REJECTED';
  const [updated] = await db
    .update(quotations)
    .set({
      status,
      sentAt: status === 'SENT' && !quotation.sentAt ? new Date() : quotation.sentAt,
      decidedAt: decided ? new Date() : quotation.decidedAt,
      decisionSource: decided ? source : quotation.decisionSource,
      updatedAt: new Date(),
    })
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)))
    .returning();

  await db.insert(quotationStatusHistory).values({
    quotationId,
    fromStatus: quotation.status,
    toStatus: status,
    source,
    actorUserId: userId,
    note,
  });

  return updated;
}

export async function archiveQuotation(organizationId: string, quotationId: string, archived = true): Promise<void> {
  await getQuotationOrThrow(organizationId, quotationId);
  await db
    .update(quotations)
    .set({ isArchived: archived, updatedAt: new Date() })
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)));
}

/** Suppression logique : le devis reste restaurable et les statistiques historiques restent justes. */
export async function softDeleteQuotation(organizationId: string, quotationId: string): Promise<void> {
  await getQuotationOrThrow(organizationId, quotationId);
  await db
    .update(quotations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)));
}

export async function restoreQuotation(organizationId: string, quotationId: string): Promise<void> {
  await getQuotationOrThrow(organizationId, quotationId);
  await db
    .update(quotations)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)));
}

/**
 * Expire automatiquement les devis dont la date de validité est dépassée.
 * Appelé à l'ouverture du tableau de bord et par la route /api/jobs/expire.
 */
export async function expireOverdueQuotations(organizationId?: string): Promise<number> {
  const now = new Date();
  const where = organizationId
    ? and(
        eq(quotations.organizationId, organizationId),
        lt(quotations.validUntil, now),
        inArray(quotations.status, ['SENT', 'PENDING']),
        isNull(quotations.deletedAt),
      )
    : and(lt(quotations.validUntil, now), inArray(quotations.status, ['SENT', 'PENDING']), isNull(quotations.deletedAt));

  const overdue = await db.select({ id: quotations.id, status: quotations.status }).from(quotations).where(where);
  if (overdue.length === 0) return 0;

  await db
    .update(quotations)
    .set({ status: 'EXPIRED', updatedAt: now })
    .where(
      inArray(
        quotations.id,
        overdue.map((row) => row.id),
      ),
    );

  await db.insert(quotationStatusHistory).values(
    overdue.map((row) => ({
      quotationId: row.id,
      fromStatus: row.status,
      toStatus: 'EXPIRED' as QuotationStatus,
      source: 'SYSTEM' as const,
      note: 'Expiration automatique (date de validité dépassée)',
    })),
  );

  return overdue.length;
}

// ---------------------------------------------------------------------------
// Aperçu / rendu
// ---------------------------------------------------------------------------

/** Devis nécessitant une relance (expiration proche) — notifications et e-mails. */
export async function findQuotationsExpiringSoon(organizationId: string, withinDays = 3) {
  const limitDate = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(quotations)
    .where(
      and(
        eq(quotations.organizationId, organizationId),
        inArray(quotations.status, ['SENT', 'PENDING']),
        gte(quotations.validUntil, new Date()),
        lt(quotations.validUntil, limitDate),
        isNull(quotations.deletedAt),
      ),
    )
    .orderBy(asc(quotations.validUntil))
    .limit(20);
}

/** Liste paginée et filtrée des devis (tableau de bord, page « Mes devis »). */
export interface ListQuotationsFilters {
  search?: string;
  status?: QuotationStatus[];
  customerId?: string;
  from?: Date;
  to?: Date;
  archived?: boolean;
  deleted?: boolean;
  sort?: 'recent' | 'oldest' | 'amount_desc' | 'amount_asc' | 'number';
  page?: number;
  pageSize?: number;
}

export async function listQuotations(organizationId: string, filters: ListQuotationsFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 10, 1), 100);

  const conditions = [eq(quotations.organizationId, organizationId)];
  if (filters.deleted) {
    conditions.push(sql`${quotations.deletedAt} is not null`);
  } else {
    conditions.push(isNull(quotations.deletedAt));
  }
  if (filters.archived !== undefined) conditions.push(eq(quotations.isArchived, filters.archived));
  if (filters.status && filters.status.length > 0) conditions.push(inArray(quotations.status, filters.status));
  if (filters.customerId) conditions.push(eq(quotations.customerId, filters.customerId));
  if (filters.from) conditions.push(gte(quotations.issueDate, filters.from));
  if (filters.to) conditions.push(lt(quotations.issueDate, filters.to));
  if (filters.search) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${quotations.number}) like ${term}`,
        sql`lower(${quotations.title}) like ${term}`,
        sql`lower(coalesce(${quotations.reference}, '')) like ${term}`,
        sql`lower(coalesce(${quotations.customerSnapshot} ->> 'name', '')) like ${term}`,
        sql`lower(coalesce(${quotations.customerSnapshot} ->> 'companyName', '')) like ${term}`,
      )!,
    );
  }

  const where = and(...conditions);

  const orderBy = (() => {
    switch (filters.sort) {
      case 'oldest':
        return [asc(quotations.issueDate)];
      case 'amount_desc':
        return [desc(quotations.total)];
      case 'amount_asc':
        return [asc(quotations.total)];
      case 'number':
        return [desc(quotations.number)];
      default:
        return [desc(quotations.issueDate), desc(quotations.createdAt)];
    }
  })();

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(quotations)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)::int` }).from(quotations).where(where),
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

/** Autres devis du même client (contexte dans la vue détail). */
/** Historique des changements de statut d'un devis (du plus récent au plus ancien). */
export async function listQuotationStatusHistory(organizationId: string, quotationId: string, limit = 50) {
  const rows = await db
    .select({ entry: quotationStatusHistory, actorName: users.name })
    .from(quotationStatusHistory)
    .innerJoin(quotations, eq(quotationStatusHistory.quotationId, quotations.id))
    .leftJoin(users, eq(quotationStatusHistory.actorUserId, users.id))
    .where(and(eq(quotations.organizationId, organizationId), eq(quotationStatusHistory.quotationId, quotationId)))
    .orderBy(desc(quotationStatusHistory.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.entry, actorName: row.actorName }));
}

export async function listSiblingQuotations(organizationId: string, quotationId: string, customerId: string | null, limit = 5) {
  if (!customerId) return [];
  return db
    .select()
    .from(quotations)
    .where(
      and(
        eq(quotations.organizationId, organizationId),
        eq(quotations.customerId, customerId),
        ne(quotations.id, quotationId),
        isNull(quotations.deletedAt),
      ),
    )
    .orderBy(desc(quotations.issueDate))
    .limit(limit);
}
