'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { customers, quotations } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { quotationSchema } from '@/lib/validation/schemas';
import { formatZodError } from '@/lib/api';
import { recordAuditFromRequest } from '@/lib/audit';
import { notifyOrganization } from '@/lib/notifications';
import { sendEmail } from '@/lib/email/mailer';
import { quotationShareEmail } from '@/lib/email/templates';
import { generateQuotationDocument } from '@/lib/documents';
import { createShare, revokeShare } from '@/lib/services/shares';
import {
  archiveQuotation,
  changeQuotationStatus,
  createQuotation,
  duplicateQuotation,
  getQuotationOrThrow,
  restoreQuotation,
  softDeleteQuotation,
  updateQuotation,
  type QuotationInput,
} from '@/lib/services/quotations';
import { QUOTATION_STATUSES } from '@/lib/constants';
import type { QuotationStatus } from '@/db/schema';
import { env } from '@/lib/env';
import { buildFileName } from '@/lib/documents';
import type { ActionResult } from '@/app/actions/auth';

/**
 * Actions serveur des devis : enregistrement (création/modification),
 * changement de statut, duplication, suppression, partage et envoi par e-mail.
 */

interface ParsedItem {
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

/** Convertit le formulaire du générateur en entrée de service. */
function formToQuotationInput(formData: FormData): { data: QuotationInput } | { errors: Record<string, string>; message: string } {
  let items: ParsedItem[] = [];
  const rawItems = formData.get('items');
  if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) items = parsed as ParsedItem[];
    } catch {
      return { errors: {}, message: 'Les lignes du devis sont illisibles. Réessayez.' };
    }
  }

  const parseDate = (value: FormDataEntryValue | null): Date | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const numberOrNull = (value: FormDataEntryValue | null): string | null => {
    if (value === null || String(value).trim() === '') return null;
    const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
    return Number.isFinite(Number(cleaned)) ? cleaned : null;
  };

  const payload = {
    title: String(formData.get('title') ?? 'Devis').trim() || 'Devis',
    customerId: String(formData.get('customerId') ?? '') || null,
    customerReference: String(formData.get('customerReference') ?? '') || null,
    reference: String(formData.get('reference') ?? '') || null,
    currency: String(formData.get('currency') ?? 'XOF'),
    issueDate: parseDate(formData.get('issueDate')) ?? new Date(),
    validUntil: parseDate(formData.get('validUntil')),
    templateKey: String(formData.get('templateKey') ?? 'minimaliste'),
    pricesIncludeTax: formData.get('pricesIncludeTax') === 'on',
    globalDiscountType: (String(formData.get('globalDiscountType') ?? '') || null) as 'PERCENTAGE' | 'FIXED' | null,
    globalDiscountValue: numberOrNull(formData.get('globalDiscountValue')) ?? '0',
    depositAmount: numberOrNull(formData.get('depositAmount')) ?? '0',
    notes: String(formData.get('notes') ?? '') || null,
    internalNotes: String(formData.get('internalNotes') ?? '') || null,
    terms: {
      validityPeriod: String(formData.get('validityPeriod') ?? '') || null,
      paymentTerms: String(formData.get('paymentTerms') ?? '') || null,
      deliveryTime: String(formData.get('deliveryTime') ?? '') || null,
      warranty: String(formData.get('warranty') ?? '') || null,
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

  const parsed = quotationSchema.safeParse({
    ...payload,
    customerId: payload.customerId,
    items: payload.items.map((item) => ({
      ...item,
      quantity: Number(String(item.quantity).replace(',', '.')) || 0,
      unitPrice: Number(String(item.unitPrice).replace(',', '.')) || 0,
      discountValue: Number(String(item.discountValue ?? '0').replace(',', '.')) || 0,
      taxRate: Number(String(item.taxRate ?? '0').replace(',', '.')) || 0,
    })),
  });

  if (!parsed.success) {
    return { errors: formatZodError(parsed.error), message: 'Vérifiez les informations du devis.' };
  }

  return { data: payload };
}

export async function saveQuotationAction(
  _previous: ActionResult<{ id: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();
  const quotationId = String(formData.get('id') ?? '');
  const intent = String(formData.get('intent') ?? 'draft');

  const converted = formToQuotationInput(formData);
  if ('errors' in converted) {
    return { success: false, errors: converted.errors, message: converted.message };
  }

  const input = converted.data;

  // Vérifie que le client appartient bien à l'organisation.
  if (input.customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, context.organization.id)))
      .limit(1);
    if (!customer) {
      return { success: false, message: 'Client introuvable dans votre organisation.' };
    }
  }

  try {
    if (quotationId) {
      const existing = await getQuotationOrThrow(context.organization.id, quotationId);
      const updated = await updateQuotation({
        organizationId: context.organization.id,
        userId: context.user.id,
        quotationId,
        input: { ...input, status: existing.status },
      });

      await recordAuditFromRequest({
        action: 'quotation.update',
        entity: 'quotation',
        entityId: quotationId,
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        metadata: { number: updated.number, items: input.items.length },
      });

      revalidatePath('/devis');
      revalidatePath(`/devis/${quotationId}`);
      revalidatePath('/tableau-de-bord');

      if (intent === 'send') {
        const sent = await sendQuotationCore(context, quotationId);
        return sent.success
          ? { success: true, message: sent.message, data: { id: quotationId } }
          : { success: false, message: sent.message };
      }
      return { success: true, message: 'Devis enregistré.', data: { id: quotationId } };
    }

    const created = await createQuotation({ organizationId: context.organization.id, userId: context.user.id, input });

    await recordAuditFromRequest({
      action: 'quotation.create',
      entity: 'quotation',
      entityId: created.id,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { number: created.number, total: created.total, currency: created.currency },
    });

    revalidatePath('/devis');
    revalidatePath('/tableau-de-bord');

    if (intent === 'send') {
      const sent = await sendQuotationCore(context, created.id);
      return sent.success
        ? { success: true, message: sent.message, data: { id: created.id } }
        : { success: false, message: sent.message };
    }

    return { success: true, message: `Devis ${created.number} créé.`, data: { id: created.id } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Enregistrement impossible.' };
  }
}

/** Enregistre au fil de l'eau (sauvegarde automatique du brouillon). */
export async function autosaveQuotationAction(
  _previous: ActionResult<{ id: string; savedAt: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ id: string; savedAt: string }>> {
  const result = await saveQuotationAction(undefined, formData);
  if (!result.success || !result.data) return result as ActionResult<{ id: string; savedAt: string }>;
  return { success: true, message: 'Brouillon enregistré.', data: { id: result.data.id, savedAt: new Date().toISOString() } };
}

export async function changeQuotationStatusAction(quotationId: string, status: QuotationStatus, note?: string): Promise<ActionResult> {
  const context = await requireOrganization();
  if (!(status in QUOTATION_STATUSES)) {
    return { success: false, message: 'Statut inconnu.' };
  }

  try {
    const updated = await changeQuotationStatus({
      organizationId: context.organization.id,
      quotationId,
      userId: context.user.id,
      status,
      note: note ?? null,
    });

    await recordAuditFromRequest({
      action: status === 'ACCEPTED' ? 'quotation.accept' : status === 'REJECTED' ? 'quotation.reject' : 'quotation.status',
      entity: 'quotation',
      entityId: quotationId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { status, number: updated.number },
    });

    revalidatePath('/devis');
    revalidatePath(`/devis/${quotationId}`);
    revalidatePath('/tableau-de-bord');
    return { success: true, message: `Devis marqué « ${QUOTATION_STATUSES[status].label} ».` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Changement de statut impossible.' };
  }
}

export async function duplicateQuotationAction(quotationId: string): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();
  try {
    const copy = await duplicateQuotation(context.organization.id, context.user.id, quotationId);
    await recordAuditFromRequest({
      action: 'quotation.duplicate',
      entity: 'quotation',
      entityId: copy.id,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { source: quotationId, number: copy.number },
    });
    revalidatePath('/devis');
    return { success: true, message: `Copie créée : ${copy.number}.`, data: { id: copy.id } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Duplication impossible.' };
  }
}

export async function deleteQuotationAction(quotationId: string): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    const quotation = await getQuotationOrThrow(context.organization.id, quotationId);
    await softDeleteQuotation(context.organization.id, quotationId);
    await recordAuditFromRequest({
      action: 'quotation.delete',
      entity: 'quotation',
      entityId: quotationId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      metadata: { number: quotation.number },
    });
    revalidatePath('/devis');
    revalidatePath('/tableau-de-bord');
    return { success: true, message: `Devis ${quotation.number} supprimé.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Suppression impossible.' };
  }
}

export async function archiveQuotationAction(quotationId: string, archived: boolean): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    await archiveQuotation(context.organization.id, quotationId, archived);
    await recordAuditFromRequest({
      action: archived ? 'quotation.archive' : 'quotation.restore',
      entity: 'quotation',
      entityId: quotationId,
      organizationId: context.organization.id,
      actorUserId: context.user.id,
    });
    revalidatePath('/devis');
    return { success: true, message: archived ? 'Devis archivé.' : 'Devis désarchivé.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Opération impossible.' };
  }
}

export async function restoreQuotationAction(quotationId: string): Promise<ActionResult> {
  const context = await requireOrganization();
  try {
    await restoreQuotation(context.organization.id, quotationId);
    revalidatePath('/devis');
    return { success: true, message: 'Devis restauré.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Restauration impossible.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Partage et envoi                                                           */
/* -------------------------------------------------------------------------- */

export async function createQuotationShareAction(
  quotationId: string,
  options: { expiresInDays?: number; allowFeedback?: boolean } = {},
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const context = await requireOrganization();
  try {
    const share = await createShare({
      organizationId: context.organization.id,
      quotationId,
      userId: context.user.id,
      expiresInDays: options.expiresInDays,
      allowFeedback: options.allowFeedback,
    });

    const [quotation] = await db
      .select({ number: quotations.number })
      .from(quotations)
      .where(eq(quotations.id, quotationId))
      .limit(1);

    if (quotation) {
      await notifyOrganization(
        context.organization.id,
        {
          type: 'QUOTATION_SENT',
          title: `Devis ${quotation.number} partagé`,
          body: 'Un lien sécurisé vient d’être créé pour votre client.',
          link: `/devis/${quotationId}`,
        },
        { excludeUserId: context.user.id },
      );
    }

    revalidatePath(`/devis/${quotationId}`);
    revalidatePath('/devis');
    return {
      success: true,
      message: 'Lien de partage créé. Transmettez-le à votre client.',
      data: { url: share.url, expiresAt: share.expiresAt.toISOString() },
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Création du lien impossible.' };
  }
}

export async function revokeQuotationShareAction(shareId: string, quotationId: string): Promise<ActionResult> {
  const context = await requireOrganization();
  const revoked = await revokeShare(context.organization.id, shareId, context.user.id);
  revalidatePath(`/devis/${quotationId}`);
  return revoked
    ? { success: true, message: 'Lien révoqué : il ne peut plus être consulté.' }
    : { success: false, message: 'Lien introuvable.' };
}

/**
 * Envoi du devis au client par e-mail.
 * Le PDF est joint lorsque le service d'e-mail est configuré ; sinon l'action
 * l'indique explicitement plutôt que de simuler un envoi.
 */
async function sendQuotationCore(
  context: Awaited<ReturnType<typeof requireOrganization>>,
  quotationId: string,
): Promise<ActionResult<{ shareUrl?: string }>> {
  const quotation = await getQuotationOrThrow(context.organization.id, quotationId);
  const snapshot = quotation.customerSnapshot as { name?: string; companyName?: string; email?: string } | null;
  const customerEmail = snapshot?.email;
  const customerName = snapshot?.companyName || snapshot?.name || 'votre client';

  const share = await createShare({
    organizationId: context.organization.id,
    quotationId,
    userId: context.user.id,
    expiresInDays: 30,
  });

  if (quotation.status === 'DRAFT') {
    await changeQuotationStatus({
      organizationId: context.organization.id,
      quotationId,
      userId: context.user.id,
      status: 'SENT',
      source: 'MANUAL',
      note: 'Envoi au client',
    });
  }

  if (!customerEmail) {
    revalidatePath(`/devis/${quotationId}`);
    return {
      success: true,
      message:
        'Aucune adresse e-mail n’est renseignée pour ce client. Copiez le lien de partage sécurisé pour le transmettre.',
      data: { shareUrl: share.url },
    };
  }

  let attachment: { filename: string; content: Buffer } | undefined;
  try {
    const document = await generateQuotationDocument({
      organizationId: context.organization.id,
      quotationId,
      format: 'pdf',
    });
    attachment = {
      filename: buildFileName(document.quotationNumber, customerName, 'pdf'),
      content: document.buffer,
    };
  } catch {
    // L'e-mail reste utile sans pièce jointe : le lien sécurisé est fourni.
  }

  const company = quotation.companySnapshot as { name?: string } | null;
  const template = quotationShareEmail({
    customerName,
    companyName: company?.name ?? context.organization.name,
    quotationNumber: quotation.number,
    quotationTitle: quotation.title,
    total: `${Number(quotation.total).toLocaleString('fr-FR')} ${quotation.currency}`,
    currency: quotation.currency,
    validUntil: quotation.validUntil ? new Date(quotation.validUntil) : null,
    url: share.url,
    senderName: context.user.name,
    senderEmail: context.user.email,
  });

  const result = await sendEmail({
    to: customerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    template: 'quotation_sent',
    attachments: attachment ? [attachment] : undefined,
  });

  await recordAuditFromRequest({
    action: 'quotation.send',
    entity: 'quotation',
    entityId: quotationId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    metadata: { to: customerEmail, delivered: result.delivered, status: result.status },
  });

  revalidatePath(`/devis/${quotationId}`);
  revalidatePath('/devis');

  if (result.status === 'SKIPPED') {
    return {
      success: true,
      message:
        'Aucun service d’e-mail n’est configuré : l’envoi réel n’a pas eu lieu. Utilisez le lien de partage sécurisé pour transmettre le devis.',
      data: { shareUrl: share.url },
    };
  }

  return result.delivered
    ? { success: true, message: `Devis envoyé à ${customerEmail}.`, data: { shareUrl: share.url } }
    : { success: false, message: `L’envoi à ${customerEmail} a échoué. Vérifiez la configuration SMTP.` };
}

export async function sendQuotationAction(quotationId: string): Promise<ActionResult<{ shareUrl?: string }>> {
  const context = await requireOrganization();
  try {
    return await sendQuotationCore(context, quotationId);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Envoi impossible.' };
  }
}

/** Enregistre puis redirige vers la vue du devis (utilisé après création). */
export async function saveAndOpenQuotationAction(_previous: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await saveQuotationAction(undefined, formData);
  if (result.success && result.data) {
    const target = String(formData.get('redirectAfter') ?? '');
    if (target === 'list') redirect('/devis');
    redirect(`/devis/${result.data.id}`);
  }
  return result;
}

/** Devis actifs de l'organisation pour la navigation rapide (barre supérieure). */
export async function findQuotationByNumber(organizationId: string, number: string) {
  const [row] = await db
    .select({ id: quotations.id, number: quotations.number })
    .from(quotations)
    .where(and(eq(quotations.organizationId, organizationId), eq(quotations.number, number), isNull(quotations.deletedAt)))
    .limit(1);
  return row ?? null;
}

export const QUOTATION_SHARE_BASE = env.appUrl;
