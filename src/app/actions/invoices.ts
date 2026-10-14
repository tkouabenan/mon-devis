'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { customers, invoices } from '@/db/schema';
import type { InvoicePaymentMethod, InvoiceStatus } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { QuotaError } from '@/lib/auth/guards';
import { formatZodError } from '@/lib/api';
import { invoiceSchema, invoicePaymentSchema } from '@/lib/validation/schemas';
import { recordAuditFromRequest } from '@/lib/audit';
import { notifyOrganization } from '@/lib/notifications';
import { sendEmail } from '@/lib/email/mailer';
import { invoiceSentEmail } from '@/lib/email/templates';
import { generateInvoiceDocument } from '@/lib/documents';
import { buildFileName } from '@/lib/documents';
import { assertCanCreate, incrementUsage } from '@/lib/services/subscription';
import {
  archiveInvoice,
  changeInvoiceStatus,
  createInvoice,
  createInvoiceFromQuotation,
  deleteInvoicePayment,
  getInvoiceOrThrow,
  recordInvoicePayment,
  restoreInvoice,
  softDeleteInvoice,
  updateInvoice,
  type InvoiceInput,
} from '@/lib/services/invoices';
import { INVOICE_STATUSES } from '@/lib/constants';
import type { ActionResult } from '@/app/actions/auth';

/**
 * Actions serveur des factures.
 * Contrôle des quotas, journalisation d'audit, notifications et envoi d'e-mails
 * sont centralisés ici ; la logique métier reste dans `lib/services/invoices`.
 */

function parseAmount(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const cleaned = String(value).replace(/\s/g, '').replace(/\u202f|\u00a0/g, '').replace(',', '.');
  if (!cleaned) return null;
  return Number.isFinite(Number(cleaned)) ? cleaned : null;
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface ParsedInvoiceItem {
  id?: string | null;
  productId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: string;
  unitPrice: string;
  discountType?: 'PERCENTAGE' | 'FIXED' | null;
  discountValue?: string | null;
  taxRate?: string | null;
}

function formToInvoiceInput(formData: FormData): { data: InvoiceInput } | { errors: Record<string, string>; message: string } {
  let items: ParsedInvoiceItem[] = [];
  const rawItems = formData.get('items');
  if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) items = parsed as ParsedInvoiceItem[];
    } catch {
      return { errors: {}, message: 'Les lignes de la facture sont illisibles. Réessayez.' };
    }
  }

  const payload: InvoiceInput = {
    title: String(formData.get('title') ?? 'Facture').trim() || 'Facture',
    customerId: String(formData.get('customerId') ?? '') || null,
    customerReference: String(formData.get('customerReference') ?? '') || null,
    reference: String(formData.get('reference') ?? '') || null,
    currency: String(formData.get('currency') ?? 'XOF'),
    issueDate: parseDate(formData.get('issueDate')) ?? new Date(),
    dueDate: parseDate(formData.get('dueDate')),
    templateKey: String(formData.get('templateKey') ?? 'minimaliste'),
    pricesIncludeTax: formData.get('pricesIncludeTax') === 'on',
    globalDiscountType: (String(formData.get('globalDiscountType') ?? '') || null) as 'PERCENTAGE' | 'FIXED' | null,
    globalDiscountValue: parseAmount(formData.get('globalDiscountValue')) ?? '0',
    notes: String(formData.get('notes') ?? '') || null,
    terms: {
      paymentTerms: String(formData.get('paymentTerms') ?? '') || null,
      deliveryTime: String(formData.get('deliveryTime') ?? '') || null,
      specialConditions: String(formData.get('specialConditions') ?? '') || null,
      paymentInstructions: String(formData.get('paymentInstructions') ?? '') || null,
      legalMentions: String(formData.get('legalMentions') ?? '') || null,
    },
    items: items.map((item) => ({
      id: item.id ?? null,
      productId: item.productId ?? null,
      name: item.name,
      description: item.description ?? null,
      unit: item.unit ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountType: item.discountType ?? null,
      discountValue: item.discountValue ?? '0',
      taxRate: item.taxRate ?? '0',
    })),
  };

  const parsed = invoiceSchema.safeParse({
    ...payload,
    items: payload.items.map((item) => ({
      ...item,
      quantity: Number(String(item.quantity).replace(',', '.')) || 0,
      unitPrice: Number(String(item.unitPrice).replace(',', '.')) || 0,
      discountValue: Number(String(item.discountValue ?? '0').replace(',', '.')) || 0,
      taxRate: Number(String(item.taxRate ?? '0').replace(',', '.')) || 0,
    })),
  });

  if (!parsed.success) {
    return { errors: formatZodError(parsed.error), message: 'Vérifiez les informations de la facture.' };
  }

  return { data: payload };
}

async function assertCustomerBelongsToOrganization(customerId: string, organizationId: string): Promise<boolean> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  return Boolean(customer);
}

/** Convertit un devis en facture (action principale du module Facturation). */
export async function convertQuotationToInvoiceAction(
  quotationId: string,
  options: { allowNonAccepted?: boolean; dueDays?: number } = {},
): Promise<ActionResult<{ id: string; number: string }>> {
  const context = await requireOrganization();

  try {
    await assertCanCreate(context.organization.id, 'invoice');

    const invoice = await createInvoiceFromQuotation({
      organizationId: context.organization.id,
      userId: context.user.id,
      quotationId,
      options,
    });

    await recordAuditFromRequest({
      action: 'invoice.created',
      entity: 'invoice',
      entityId: invoice.id,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { number: invoice.number, total: invoice.total, source: options },
    });

    await incrementUsage(context.organization.id, 'invoices_created').catch(() => undefined);

    await notifyOrganization(
      context.organization.id,
      {
        type: 'INVOICE_CREATED',
        title: `Facture ${invoice.number} créée`,
        body: `Facture générée depuis le devis converti. Montant : ${Number(invoice.total).toLocaleString('fr-FR')} ${invoice.currency}.`,
        link: `/factures/${invoice.id}`,
      },
      { excludeUserId: context.user.id },
    );

    revalidatePath('/factures');
    revalidatePath('/tableau-de-bord');

    return { success: true, message: `Facture ${invoice.number} créée.`, data: { id: invoice.id, number: invoice.number } };
  } catch (error) {
    if (error instanceof QuotaError) return { success: false, message: error.message };
    return { success: false, message: error instanceof Error ? error.message : 'Conversion impossible.' };
  }
}

export async function createInvoiceAction(
  _previous: ActionResult<{ id: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();
  const converted = formToInvoiceInput(formData);
  if ('errors' in converted) return { success: false, errors: converted.errors, message: converted.message };

  if (converted.data.customerId && !(await assertCustomerBelongsToOrganization(converted.data.customerId, context.organization.id))) {
    return { success: false, message: 'Client introuvable dans votre organisation.' };
  }

  try {
    await assertCanCreate(context.organization.id, 'invoice');
    const invoice = await createInvoice({ organizationId: context.organization.id, userId: context.user.id, input: converted.data });

    await recordAuditFromRequest({
      action: 'invoice.created',
      entity: 'invoice',
      entityId: invoice.id,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { number: invoice.number, total: invoice.total },
    });
    await incrementUsage(context.organization.id, 'invoices_created').catch(() => undefined);

    revalidatePath('/factures');
    revalidatePath('/tableau-de-bord');
    return { success: true, message: `Facture ${invoice.number} créée.`, data: { id: invoice.id } };
  } catch (error) {
    if (error instanceof QuotaError) return { success: false, message: error.message };
    return { success: false, message: error instanceof Error ? error.message : 'Création impossible.' };
  }
}

export async function updateInvoiceAction(
  _previous: ActionResult<{ id: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();
  const invoiceId = String(formData.get('id') ?? '');
  if (!invoiceId) return { success: false, message: 'Facture introuvable.' };

  const converted = formToInvoiceInput(formData);
  if ('errors' in converted) return { success: false, errors: converted.errors, message: converted.message };

  try {
    const updated = await updateInvoice({
      organizationId: context.organization.id,
      userId: context.user.id,
      invoiceId,
      input: converted.data,
    });

    await recordAuditFromRequest({
      action: 'invoice.updated',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { number: updated.number },
    });

    revalidatePath('/factures');
    revalidatePath(`/factures/${invoiceId}`);
    return { success: true, message: 'Facture mise à jour.', data: { id: invoiceId } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Mise à jour impossible.' };
  }
}

export async function changeInvoiceStatusAction(
  invoiceId: string,
  status: InvoiceStatus,
  note?: string,
): Promise<ActionResult> {
  const context = await requireOrganization();
  if (!(status in INVOICE_STATUSES)) return { success: false, message: 'Statut inconnu.' };

  try {
    const updated = await changeInvoiceStatus({
      organizationId: context.organization.id,
      invoiceId,
      userId: context.user.id,
      status,
      note: note ?? null,
    });

    await recordAuditFromRequest({
      action: 'invoice.status_changed',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { status, number: updated.number },
    });

    if (status === 'PAID') {
      await notifyOrganization(
        context.organization.id,
        {
          type: 'INVOICE_PAID',
          title: `Facture ${updated.number} payée`,
          body: `Montant réglé : ${Number(updated.total).toLocaleString('fr-FR')} ${updated.currency}.`,
          link: `/factures/${invoiceId}`,
        },
        { excludeUserId: context.user.id },
      );
    }

    revalidatePath('/factures');
    revalidatePath(`/factures/${invoiceId}`);
    revalidatePath('/tableau-de-bord');
    return { success: true, message: `Statut mis à jour : ${INVOICE_STATUSES[status].label}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Changement de statut impossible.' };
  }
}

export async function recordInvoicePaymentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireOrganization();
  const invoiceId = String(formData.get('invoiceId') ?? '');

  const parsed = invoicePaymentSchema.safeParse({
    invoiceId,
    amount: parseAmount(formData.get('amount')) ?? '0',
    method: String(formData.get('method') ?? 'BANK_TRANSFER'),
    paidAt: String(formData.get('paidAt') ?? '') || undefined,
    reference: String(formData.get('reference') ?? '') || undefined,
    note: String(formData.get('note') ?? '') || undefined,
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations du règlement.' };
  }

  try {
    const result = await recordInvoicePayment({
      organizationId: context.organization.id,
      invoiceId,
      userId: context.user.id,
      amount: parsed.data.amount,
      method: parsed.data.method as InvoicePaymentMethod,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
      reference: parsed.data.reference ?? null,
      note: parsed.data.note ?? null,
    });

    await recordAuditFromRequest({
      action: 'payment.recorded',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { amount: parsed.data.amount, method: parsed.data.method, number: result.invoice.number },
    });

    await notifyOrganization(
      context.organization.id,
      {
        type: 'PAYMENT_RECEIVED',
        title: `Règlement enregistré sur la facture ${result.invoice.number}`,
        body: `${Number(parsed.data.amount).toLocaleString('fr-FR')} ${result.invoice.currency} — solde restant : ${Math.max(
          0,
          Number(result.invoice.total) - result.paymentsTotal,
        ).toLocaleString('fr-FR')} ${result.invoice.currency}.`,
        link: `/factures/${invoiceId}`,
      },
      { excludeUserId: context.user.id },
    );

    revalidatePath(`/factures/${invoiceId}`);
    revalidatePath('/factures');
    revalidatePath('/statistiques');

    return {
      success: true,
      message: result.statusChanged
        ? `Règlement enregistré. La facture est désormais « ${INVOICE_STATUSES[result.invoice.status].label} ».`
        : 'Règlement enregistré.',
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Enregistrement du règlement impossible.' };
  }
}

export async function deleteInvoicePaymentAction(invoiceId: string, paymentId: string): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    await deleteInvoicePayment({ organizationId: context.organization.id, invoiceId, paymentId, userId: context.user.id });
    await recordAuditFromRequest({
      action: 'payment.deleted',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { paymentId },
    });
    revalidatePath(`/factures/${invoiceId}`);
    return { success: true, message: 'Règlement supprimé.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Suppression impossible.' };
  }
}

/** Envoi de la facture au client par e-mail (PDF en pièce jointe). */
export async function sendInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const context = await requireOrganization();

  try {
    const invoice = await getInvoiceOrThrow(context.organization.id, invoiceId);
    const snapshot = invoice.customerSnapshot as { name?: string; companyName?: string; email?: string } | null;
    const customerEmail = snapshot?.email ?? null;
    const customerName = snapshot?.companyName || snapshot?.name || 'votre client';
    const company = invoice.companySnapshot as { name?: string } | null;

    if (!customerEmail) {
      return {
        success: false,
        message: 'Aucune adresse e-mail n’est renseignée pour ce client. Ajoutez-la dans la fiche client pour envoyer la facture.',
      };
    }

    let attachment: { filename: string; content: Buffer } | undefined;
    try {
      const document = await generateInvoiceDocument({
        organizationId: context.organization.id,
        invoiceId,
        format: 'pdf',
      });
      attachment = {
        filename: buildFileName(invoice.number, customerName, 'pdf', 'FACTURE'),
        content: document.buffer,
      };
    } catch {
      // L'e-mail reste informatif même sans pièce jointe.
    }

    const template = invoiceSentEmail({
      customerName,
      companyName: company?.name ?? context.organization.name,
      invoiceNumber: invoice.number,
      total: `${Number(invoice.total).toLocaleString('fr-FR')} ${invoice.currency}`,
      currency: invoice.currency,
      dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
      senderName: context.user.name,
      senderEmail: context.user.email,
    });

    const result = await sendEmail({
      to: customerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      template: 'invoice_sent',
      attachments: attachment ? [attachment] : undefined,
    });

    await recordAuditFromRequest({
      action: 'invoice.emailed',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { to: customerEmail, delivered: result.delivered, status: result.status },
    });

    if (invoice.status === 'DRAFT') {
      await changeInvoiceStatus({
        organizationId: context.organization.id,
        invoiceId,
        userId: context.user.id,
        status: 'SENT',
        note: 'Envoi au client',
      });
    }

    revalidatePath(`/factures/${invoiceId}`);

    if (result.status === 'SKIPPED') {
      return {
        success: true,
        message:
          'Aucun service d’e-mail n’est configuré : l’envoi réel n’a pas eu lieu. Téléchargez le PDF et transmettez-le à votre client.',
      };
    }

    return result.delivered
      ? { success: true, message: `Facture envoyée à ${customerEmail}.` }
      : { success: false, message: `L’envoi à ${customerEmail} a échoué. Vérifiez la configuration e-mail.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Envoi impossible.' };
  }
}

export async function archiveInvoiceAction(invoiceId: string, archived: boolean): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    await archiveInvoice(context.organization.id, invoiceId, archived);
    await recordAuditFromRequest({
      action: archived ? 'invoice.archived' : 'invoice.unarchived',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
    });
    revalidatePath('/factures');
    return { success: true, message: archived ? 'Facture archivée.' : 'Facture désarchivée.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Opération impossible.' };
  }
}

export async function deleteInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    const invoice = await getInvoiceOrThrow(context.organization.id, invoiceId);
    await softDeleteInvoice(context.organization.id, invoiceId);
    await recordAuditFromRequest({
      action: 'invoice.deleted',
      entity: 'invoice',
      entityId: invoiceId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { number: invoice.number },
    });
    revalidatePath('/factures');
    return { success: true, message: `Facture ${invoice.number} supprimée.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Suppression impossible.' };
  }
}

export async function restoreInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    await restoreInvoice(context.organization.id, invoiceId);
    revalidatePath('/factures');
    return { success: true, message: 'Facture restaurée.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Restauration impossible.' };
  }
}

/** Duplique une facture en brouillon (utile pour les facturations récurrentes). */
export async function duplicateInvoiceAction(invoiceId: string): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();
  try {
    const { getInvoiceWithDetails } = await import('@/lib/services/invoices');
    const { invoice, items } = await getInvoiceWithDetails(context.organization.id, invoiceId);
    await assertCanCreate(context.organization.id, 'invoice');

    const copy = await createInvoice({
      organizationId: context.organization.id,
      userId: context.user.id,
      input: {
        title: invoice.title,
        customerId: invoice.customerId,
        customerSnapshot: invoice.customerSnapshot as never,
        reference: invoice.reference,
        customerReference: invoice.customerReference,
        currency: invoice.currency,
        locale: invoice.locale,
        templateKey: invoice.templateKey,
        customization: invoice.customization as Record<string, unknown> | null,
        pricesIncludeTax: invoice.pricesIncludeTax,
        globalDiscountType: invoice.globalDiscountType,
        globalDiscountValue: invoice.globalDiscountValue,
        notes: invoice.notes,
        terms: invoice.terms as never,
        sourceQuotationNumber: invoice.sourceQuotationNumber,
        sourceQuotationId: invoice.quotationId,
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

    await recordAuditFromRequest({
      action: 'invoice.duplicated',
      entity: 'invoice',
      entityId: copy.id,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { source: invoiceId, number: copy.number },
    });

    await incrementUsage(context.organization.id, 'invoices_created').catch(() => undefined);
    revalidatePath('/factures');
    return { success: true, message: `Copie créée : ${copy.number}.`, data: { id: copy.id } };
  } catch (error) {
    if (error instanceof QuotaError) return { success: false, message: error.message };
    return { success: false, message: error instanceof Error ? error.message : 'Duplication impossible.' };
  }
}

/** Recherche de factures par numéro (barre de recherche globale). */
export async function findInvoiceByNumber(organizationId: string, number: string) {
  const [row] = await db
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.number, number), isNull(invoices.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Crée une facture depuis un devis puis redirige vers la facture. */
export async function convertAndOpenInvoiceAction(quotationId: string, allowNonAccepted = false): Promise<ActionResult> {
  const result = await convertQuotationToInvoiceAction(quotationId, { allowNonAccepted });
  if (result.success && result.data) {
    redirect(`/factures/${result.data.id}`);
  }
  return { success: false, message: result.message ?? 'Conversion impossible.' };
}
