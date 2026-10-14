import { headers } from 'next/headers';
import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { clientIp, hashIp } from '@/lib/rate-limit';

/**
 * Journal d'audit : trace les actions sensibles (connexions, modifications,
 * décisions, accès administratifs). Les IP sont hachées (jamais stockées en clair).
 */

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_reset_request'
  | 'auth.password_reset'
  | 'auth.email_verified'
  | 'organization.created'
  | 'organization.updated'
  | 'organization.switched'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed'
  | 'company.updated'
  | 'logo.uploaded'
  | 'logo.removed'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'customer.exported'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.imported'
  | 'product.exported'
  | 'quotation.created'
  | 'quotation.updated'
  | 'quotation.duplicated'
  | 'quotation.deleted'
  | 'quotation.restored'
  | 'quotation.archived'
  | 'quotation.status_changed'
  | 'quotation.shared'
  | 'quotation.share_revoked'
  | 'quotation.approved'
  | 'quotation.rejected'
  | 'quotation.exported'
  | 'quotation.emailed'
  | 'settings.updated'
  | 'subscription.changed'
  | 'subscription.canceled'
  | 'payment.recorded'
  | 'admin.plan_updated'
  | 'admin.user_updated'
  | 'admin.settings_updated'
  | 'admin.ticket_replied'
  | 'export.quotation';

export interface AuditInput {
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  /** Adresse IP (sera hachée) ; transmise si l'événement provient d'une requête. */
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata ?? null,
      ipHash: hashIp(input.ip),
      userAgent: input.userAgent?.slice(0, 250) ?? null,
    });
  } catch (error) {
    // Le journal ne doit jamais faire échouer l'action métier.
    console.error('[audit] échec de l’enregistrement:', error instanceof Error ? error.message : error);
  }
}

/** Enregistre un événement en récupérant l'IP/User-Agent de la requête courante. */
export async function recordAuditFromRequest(input: Omit<AuditInput, 'ip' | 'userAgent'>): Promise<void> {
  try {
    const headerList = await headers();
    await recordAudit({
      ...input,
      ip: clientIp(headerList),
      userAgent: headerList.get('user-agent'),
    });
  } catch {
    await recordAudit(input);
  }
}
