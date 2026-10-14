import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { notificationPreferences, notifications, organizationMembers } from '@/db/schema';
import type { NotificationKind } from '@/db/schema';

/**
 * Centre de notifications : création en base + respect des préférences utilisateur.
 * Les notifications sont in-app ; l'envoi d'e-mails associé est déclenché par les services métier.
 */

export interface NotifyInput {
  userId: string;
  organizationId?: string | null;
  type: NotificationKind;
  title: string;
  body?: string;
  link?: string;
}

const PREFERENCE_FIELD: Partial<Record<NotificationKind, keyof typeof notificationPreferences.$inferSelect>> = {
  QUOTATION_ACCEPTED: 'quotationAccepted',
  QUOTATION_REJECTED: 'quotationRejected',
  QUOTATION_VIEWED: 'quotationViewed',
  QUOTATION_EXPIRING: 'quotationExpiring',
  QUOTATION_EXPIRED: 'quotationExpired',
  INVOICE_CREATED: 'accountEvents',
  INVOICE_PAID: 'accountEvents',
  INVOICE_OVERDUE: 'quotationExpiring',
  PAYMENT_RECEIVED: 'accountEvents',
  EXPORT_READY: 'exportReady',
  SUBSCRIPTION_UPDATE: 'subscriptionUpdates',
  ACCOUNT_EVENT: 'accountEvents',
};

async function isEnabled(userId: string, type: NotificationKind): Promise<boolean> {
  const field = PREFERENCE_FIELD[type];
  if (!field) return true;
  const [preference] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (!preference) return true;
  return Boolean(preference[field]);
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (!(await isEnabled(input.userId, input.type))) return;
    await db.insert(notifications).values({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
  } catch (error) {
    console.error('[notifications] échec:', error instanceof Error ? error.message : error);
  }
}

/** Notifie tous les membres d'une organisation (hors utilisateur à l'origine de l'action). */
export async function notifyOrganization(
  organizationId: string,
  input: Omit<NotifyInput, 'userId' | 'organizationId'>,
  options: { excludeUserId?: string } = {},
): Promise<void> {
  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));

  await Promise.all(
    members
      .filter((member) => member.userId !== options.excludeUserId)
      .map((member) => notify({ ...input, userId: member.userId, organizationId })),
  );
}

export async function listNotifications(userId: string, limit = 25) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(notifications.createdAt)
    .limit(limit);
  return rows.reverse();
}

export async function countUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.readAt, null as never)))
    .limit(200);
  return rows.length;
}

export async function markAsRead(userId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length > 0) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)));
    return;
  }
  await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, userId));
}

export async function getNotificationPreferences(userId: string) {
  const [preference] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (preference) return preference;
  const [created] = await db.insert(notificationPreferences).values({ userId }).returning();
  return created;
}

export async function updateNotificationPreferences(
  userId: string,
  values: Partial<typeof notificationPreferences.$inferInsert>,
) {
  await getNotificationPreferences(userId);
  const [updated] = await db
    .update(notificationPreferences)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, userId))
    .returning();
  return updated;
}
