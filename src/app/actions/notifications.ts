'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import {
  countUnread,
  getNotificationPreferences,
  listNotifications,
  markAsRead,
  updateNotificationPreferences,
} from '@/lib/notifications';
import type { ActionResult } from '@/app/actions/auth';

/** Actions serveur du centre de notifications. */

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, message: 'Vous devez être connecté.' };

  await markAsRead(session.user.id, ids);
  revalidatePath('/parametres');
  return { success: true, message: ids ? 'Notification marquée comme lue.' : 'Toutes les notifications sont lues.' };
}

export async function loadNotificationsAction() {
  const session = await getSession();
  if (!session) return { notifications: [], unread: 0 };

  const [notifications, unread] = await Promise.all([listNotifications(session.user.id, 30), countUnread(session.user.id)]);
  return {
    unread,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
    })),
  };
}

export async function loadNotificationPreferencesAction() {
  const session = await getSession();
  if (!session) return null;
  const preferences = await getNotificationPreferences(session.user.id);

  return {
    quotationAccepted: preferences.quotationAccepted,
    quotationRejected: preferences.quotationRejected,
    quotationViewed: preferences.quotationViewed,
    quotationExpiring: preferences.quotationExpiring,
    quotationExpired: preferences.quotationExpired,
    exportReady: preferences.exportReady,
    subscriptionUpdates: preferences.subscriptionUpdates,
    accountEvents: preferences.accountEvents,
    emailEnabled: preferences.emailEnabled,
    reminderDaysBefore: preferences.reminderDaysBefore,
  };
}

export async function updateNotificationPreferencesAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, message: 'Vous devez être connecté.' };

  const flag = (key: string) => formData.get(key) === 'on';
  const days = Number(formData.get('reminderDaysBefore'));

  await updateNotificationPreferences(session.user.id, {
    quotationAccepted: flag('quotationAccepted'),
    quotationRejected: flag('quotationRejected'),
    quotationViewed: flag('quotationViewed'),
    quotationExpiring: flag('quotationExpiring'),
    quotationExpired: flag('quotationExpired'),
    exportReady: flag('exportReady'),
    subscriptionUpdates: flag('subscriptionUpdates'),
    accountEvents: flag('accountEvents'),
    emailEnabled: flag('emailEnabled'),
    reminderDaysBefore: Number.isFinite(days) ? Math.min(Math.max(days, 1), 30) : 3,
  });

  revalidatePath('/parametres');
  return { success: true, message: 'Préférences de notification enregistrées.' };
}
