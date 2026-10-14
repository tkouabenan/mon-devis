import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { quotationApprovalEvents, quotationShares, quotations } from '@/db/schema';
import { generateToken, hashToken } from '@/lib/auth/password';
import { hashIp } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';
import { notifyOrganization } from '@/lib/notifications';
import { env } from '@/lib/env';

/**
 * Partage sécurisé des devis.
 *
 * Le lien public contient un jeton aléatoire de 32 octets ; seule son empreinte
 * SHA-256 est stockée. Le lien est révocable et expire automatiquement.
 * Toute consultation ou décision est journalisée (audit + événements d'approbation).
 */

const DEFAULT_EXPIRY_DAYS = 30;

export interface CreateShareOptions {
  organizationId: string;
  quotationId: string;
  userId: string;
  expiresInDays?: number;
  allowFeedback?: boolean;
}

export interface CreatedShare {
  id: string;
  url: string;
  expiresAt: Date;
  allowFeedback: boolean;
}

export async function createShare(options: CreateShareOptions): Promise<CreatedShare> {
  const { organizationId, quotationId, userId } = options;

  const [quotation] = await db
    .select({ id: quotations.id, number: quotations.number, status: quotations.status, customerSnapshot: quotations.customerSnapshot })
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId), isNull(quotations.deletedAt)))
    .limit(1);

  if (!quotation) throw new Error('Devis introuvable.');

  const days = Math.min(Math.max(options.expiresInDays ?? DEFAULT_EXPIRY_DAYS, 1), 365);
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [share] = await db
    .insert(quotationShares)
    .values({
      quotationId,
      createdById: userId,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 8),
      expiresAt,
      allowFeedback: options.allowFeedback ?? true,
    })
    .returning();

  await recordAudit({
    action: 'quotation.share_created',
    entity: 'quotation_share',
    entityId: share.id,
    organizationId,
    actorUserId: userId,
    metadata: { quotationId, expiresAt: expiresAt.toISOString(), allowFeedback: share.allowFeedback },
  });

  // Un devis « brouillon » passe automatiquement en « envoyé » : il est désormais visible du client.
  if (quotation.status === 'DRAFT') {
    await db.update(quotations).set({ status: 'SENT', sentAt: new Date(), updatedAt: new Date() }).where(eq(quotations.id, quotationId));
  }

  return {
    id: share.id,
    url: `${env.appUrl}/d/${token}`,
    expiresAt,
    allowFeedback: share.allowFeedback,
  };
}

export async function listShares(organizationId: string, quotationId: string) {
  return db
    .select({
      id: quotationShares.id,
      tokenPrefix: quotationShares.tokenPrefix,
      expiresAt: quotationShares.expiresAt,
      revokedAt: quotationShares.revokedAt,
      viewCount: quotationShares.viewCount,
      lastViewedAt: quotationShares.lastViewedAt,
      allowFeedback: quotationShares.allowFeedback,
      createdAt: quotationShares.createdAt,
    })
    .from(quotationShares)
    .innerJoin(quotations, eq(quotationShares.quotationId, quotations.id))
    .where(and(eq(quotations.organizationId, organizationId), eq(quotationShares.quotationId, quotationId)))
    .orderBy(desc(quotationShares.createdAt));
}

export async function revokeShare(organizationId: string, shareId: string, userId: string): Promise<boolean> {
  const [share] = await db
    .select({ id: quotationShares.id, quotationId: quotationShares.quotationId })
    .from(quotationShares)
    .innerJoin(quotations, eq(quotationShares.quotationId, quotations.id))
    .where(and(eq(quotationShares.id, shareId), eq(quotations.organizationId, organizationId)))
    .limit(1);

  if (!share) return false;

  await db.update(quotationShares).set({ revokedAt: new Date() }).where(eq(quotationShares.id, shareId));
  await recordAudit({
    action: 'quotation.share_revoked',
    entity: 'quotation_share',
    entityId: shareId,
    organizationId,
    actorUserId: userId,
    metadata: { quotationId: share.quotationId },
  });
  return true;
}

export interface SharedQuotation {
  shareId: string;
  allowFeedback: boolean;
  organizationId: string;
  quotation: {
    id: string;
    number: string;
    title: string;
    status: string;
    currency: string;
    issueDate: Date;
    validUntil: Date | null;
    decidedAt: Date | null;
    decisionSource: string | null;
    total: string;
    subtotal: string;
    taxTotal: string;
    netBeforeTax: string;
    lineDiscountTotal: string;
    globalDiscountTotal: string;
    globalDiscountType: string | null;
    globalDiscountValue: string;
    depositAmount: string;
    amountDue: string;
    pricesIncludeTax: boolean;
    templateKey: string;
    customization: unknown;
    companySnapshot: unknown;
    customerSnapshot: unknown;
    terms: unknown;
    notes: string | null;
  };
}

/**
 * Résout un jeton public : vérifie l'expiration, la révocation et enregistre
 * la consultation (compteur + horodatage « vu par le client »).
 */
export async function resolveShareToken(token: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<SharedQuotation | null> {
  if (!token || token.length < 20) return null;

  const [record] = await db
    .select({ share: quotationShares, quotation: quotations })
    .from(quotationShares)
    .innerJoin(quotations, eq(quotationShares.quotationId, quotations.id))
    .where(
      and(
        eq(quotationShares.tokenHash, hashToken(token)),
        isNull(quotationShares.revokedAt),
        gt(quotationShares.expiresAt, new Date()),
        isNull(quotations.deletedAt),
      ),
    )
    .limit(1);

  if (!record) return null;

  await db
    .update(quotationShares)
    .set({ viewCount: sql`${quotationShares.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(quotationShares.id, record.share.id));

  // Le client a consulté le devis : on le note côté suivi commercial.
  const now = new Date();
  const shouldMarkViewed = !record.quotation.viewedAt || now.getTime() - new Date(record.quotation.viewedAt).getTime() > 60_000;
  if (shouldMarkViewed) {
    await db.update(quotations).set({ viewedAt: now, updatedAt: now }).where(eq(quotations.id, record.quotation.id));
    await db.insert(quotationApprovalEvents).values({
      quotationId: record.quotation.id,
      shareId: record.share.id,
      action: 'VIEWED',
      source: 'CUSTOMER_LINK',
      actorName: (record.quotation.customerSnapshot as { name?: string } | null)?.name ?? null,
      ipHash: hashIp(meta.ip ?? null),
      userAgent: meta.userAgent ?? null,
    });
  }

  return {
    shareId: record.share.id,
    allowFeedback: record.share.allowFeedback,
    organizationId: record.quotation.organizationId,
    quotation: {
      id: record.quotation.id,
      number: record.quotation.number,
      title: record.quotation.title,
      status: record.quotation.status,
      currency: record.quotation.currency,
      issueDate: record.quotation.issueDate,
      validUntil: record.quotation.validUntil,
      decidedAt: record.quotation.decidedAt,
      decisionSource: record.quotation.decisionSource,
      total: record.quotation.total,
      subtotal: record.quotation.subtotal,
      taxTotal: record.quotation.taxTotal,
      netBeforeTax: record.quotation.netBeforeTax,
      lineDiscountTotal: record.quotation.lineDiscountTotal,
      globalDiscountTotal: record.quotation.globalDiscountTotal,
      globalDiscountType: record.quotation.globalDiscountType,
      globalDiscountValue: record.quotation.globalDiscountValue,
      depositAmount: record.quotation.depositAmount,
      amountDue: record.quotation.amountDue,
      pricesIncludeTax: record.quotation.pricesIncludeTax,
      templateKey: record.quotation.templateKey,
      customization: record.quotation.customization,
      companySnapshot: record.quotation.companySnapshot,
      customerSnapshot: record.quotation.customerSnapshot,
      terms: record.quotation.terms,
      notes: record.quotation.notes,
    },
  };
}

export type DecisionAction = 'ACCEPT' | 'REJECT' | 'REQUEST_CHANGE';

/** Correspondance entre la décision du client et l'événement journalisé. */
const APPROVAL_EVENT_ACTION: Record<DecisionAction, 'APPROVED' | 'REJECTED' | 'COMMENTED'> = {
  ACCEPT: 'APPROVED',
  REJECT: 'REJECTED',
  REQUEST_CHANGE: 'COMMENTED',
};

export interface RecordDecisionInput {
  token: string;
  action: DecisionAction;
  feedback?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface DecisionResult {
  success: boolean;
  message: string;
  status?: string;
}

/** Enregistre la décision du client prise depuis le lien public. */
export async function recordDecision(input: RecordDecisionInput): Promise<DecisionResult> {
  const shared = await resolveShareToken(input.token, { ip: input.ip, userAgent: input.userAgent });
  if (!shared) {
    return { success: false, message: 'Ce lien est invalide, révoqué ou expiré.' };
  }

  const quotation = shared.quotation;
  if (quotation.status === 'CANCELLED') {
    return { success: false, message: 'Ce devis a été annulé par l’entreprise.' };
  }

  const targetStatus = input.action === 'ACCEPT' ? 'ACCEPTED' : input.action === 'REJECT' ? 'REJECTED' : 'PENDING';
  if (['ACCEPTED', 'REJECTED'].includes(quotation.status)) {
    return {
      success: false,
      message: `Ce devis a déjà été ${quotation.status === 'ACCEPTED' ? 'accepté' : 'refusé'}. Contactez l'entreprise pour toute modification.`,
      status: quotation.status,
    };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(quotations)
      .set({
        status: targetStatus,
        decidedAt: input.action === 'REQUEST_CHANGE' ? null : now,
        decisionSource: input.action === 'REQUEST_CHANGE' ? null : 'CUSTOMER_LINK',
        updatedAt: now,
      })
      .where(eq(quotations.id, quotation.id));

    await tx.insert(quotationApprovalEvents).values({
      quotationId: quotation.id,
      shareId: shared.shareId,
      action: APPROVAL_EVENT_ACTION[input.action],
      source: 'CUSTOMER_LINK',
      actorName: input.actorName ?? null,
      actorEmail: input.actorEmail ?? null,
      feedback: input.feedback ?? null,
      ipHash: hashIp(input.ip ?? null),
      userAgent: input.userAgent ?? null,
    });
  });

  await recordAudit({
    action: `quotation.${input.action.toLowerCase()}_by_customer`,
    entity: 'quotation',
    entityId: quotation.id,
    organizationId: shared.organizationId,
    metadata: { number: quotation.number, actorName: input.actorName ?? null, feedback: input.feedback ?? null },
  });

  if (input.action !== 'REQUEST_CHANGE') {
    await notifyOrganization(shared.organizationId, {
      type: 'QUOTATION_ACCEPTED',
      title: input.action === 'ACCEPT' ? `Devis ${quotation.number} accepté` : `Devis ${quotation.number} refusé`,
      body:
        input.action === 'ACCEPT'
          ? `${input.actorName ?? 'Le client'} a accepté le devis ${quotation.number}.`
          : `${input.actorName ?? 'Le client'} a refusé le devis ${quotation.number}${input.feedback ? ` — motif : ${input.feedback}` : ''}.`,
      link: `/devis/${quotation.id}`,
    });
  }

  return {
    success: true,
    status: targetStatus,
    message:
      input.action === 'ACCEPT'
        ? 'Merci ! Votre acceptation a été enregistrée et transmise à l’entreprise.'
        : input.action === 'REJECT'
          ? 'Votre refus a été transmis à l’entreprise.'
          : 'Votre demande de modification a été transmise à l’entreprise.',
  };
}

/** Historique complet des décisions et consultations d'un devis. */
export async function listApprovalEvents(organizationId: string, quotationId: string) {
  return db
    .select()
    .from(quotationApprovalEvents)
    .innerJoin(quotations, eq(quotationApprovalEvents.quotationId, quotations.id))
    .where(and(eq(quotations.organizationId, organizationId), eq(quotationApprovalEvents.quotationId, quotationId)))
    .orderBy(desc(quotationApprovalEvents.createdAt))
    .limit(50);
}
