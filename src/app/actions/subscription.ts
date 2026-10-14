'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { supportTickets, subscriptionPlans } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { recordAuditFromRequest } from '@/lib/audit';
import { notifyOrganization } from '@/lib/notifications';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { env } from '@/lib/env';
import type { ActionResult } from '@/app/actions/auth';

/**
 * Actions serveur de l'abonnement.
 *
 * IMPORTANT — aucun paiement n'est simulé. Tant qu'aucun prestataire n'est
 * configuré (Stripe, CinetPay, Paystack…), le changement de formule passe par une
 * demande transmise à l'administration, qui l'active après encaissement réel.
 * Le bouton n'annonce jamais un succès de paiement : il crée une demande traçable.
 */

export async function requestPlanChangeAction(
  _previous: ActionResult<{ ticketId: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ ticketId: string }>> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const planCode = String(formData.get('planCode') ?? '');
  const interval = String(formData.get('interval') ?? 'MONTHLY') === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const note = String(formData.get('note') ?? '').slice(0, 1000);

  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, planCode)).limit(1);
  if (!plan) {
    return { success: false, message: 'Formule inconnue.' };
  }

  const current = await getOrganizationSubscription(organizationId);
  if (current.planCode === plan.code) {
    return { success: false, message: `Vous utilisez déjà la formule ${plan.name}.` };
  }

  const price = interval === 'YEARLY' ? Number(plan.priceYearly) : Number(plan.priceMonthly);
  const priceLabel =
    price > 0
      ? `${price.toLocaleString('fr-FR')} ${plan.currency} / ${interval === 'YEARLY' ? 'an' : 'mois'}`
      : 'tarif à confirmer';

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      organizationId,
      userId: context.user.id,
      subject: `Demande de passage à la formule ${plan.name}`,
      message: [
        `Organisation : ${context.organization.name}`,
        `Formule actuelle : ${current.planName}`,
        `Formule souhaitée : ${plan.name} (${interval === 'YEARLY' ? 'annuel' : 'mensuel'})`,
        `Tarif affiché : ${priceLabel}`,
        note ? `Précisions du client : ${note}` : '',
        '',
        'Aucun paiement en ligne n’est disponible pour le moment : un conseiller doit confirmer le règlement avant activation.',
      ]
        .filter(Boolean)
        .join('\n'),
      priority: 'HIGH',
      status: 'OPEN',
    })
    .returning();

  await recordAuditFromRequest({
    action: 'subscription.change_requested',
    entity: 'subscription',
    entityId: ticket.id,
    organizationId,
    actorUserId: context.user.id,
    metadata: { planCode: plan.code, interval, priceLabel },
  });

  await notifyOrganization(organizationId, {
    type: 'SUBSCRIPTION_UPDATE',
    title: `Demande de passage à la formule ${plan.name}`,
    body: 'Votre demande a été transmise. Un conseiller vous contacte pour finaliser le règlement.',
    link: '/abonnement',
  }).catch(() => undefined);

  revalidatePath('/abonnement');
  revalidatePath('/aide');

  return {
    success: true,
    message:
      'Demande transmise. Aucun paiement en ligne n’est activé pour le moment : un conseiller vous contacte pour finaliser le règlement, puis la formule est activée.',
    data: { ticketId: ticket.id },
  };
}

/** Indique si un paiement en ligne réel est possible dans cet environnement. */
export async function getPaymentAvailability(): Promise<{ provider: string; enabled: boolean }> {
  return { provider: env.payments.provider, enabled: env.payments.provider !== 'none' && env.payments.canCharge };
}
