'use server';

import { headers } from 'next/headers';
import { recordDecision, type DecisionResult } from '@/lib/services/shares';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * Décision du client prise depuis le lien de partage public.
 *
 * Aucune authentification n'est requise : c'est le jeton (aléatoire, haché en
 * base, révocable et expirant) qui autorise l'action. La limitation de débit
 * protège l'endpoint des tentatives de force brute.
 */
export async function submitDecisionAction(formData: FormData): Promise<DecisionResult> {
  const token = String(formData.get('token') ?? '');
  const rawAction = String(formData.get('action') ?? '');
  const actorName = String(formData.get('actorName') ?? '').trim() || null;
  const actorEmail = String(formData.get('actorEmail') ?? '').trim() || null;
  const feedback = String(formData.get('feedback') ?? '').trim() || null;

  if (!['ACCEPT', 'REJECT', 'REQUEST_CHANGE'].includes(rawAction)) {
    return { success: false, message: 'Action non reconnue.' };
  }

  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const userAgent = requestHeaders.get('user-agent');

  const limited = rateLimit(`share-decision:${ip ?? 'inconnu'}:${token.slice(0, 12)}`, 10, 300);
  if (!limited.allowed) {
    return {
      success: false,
      message: `Trop de tentatives. Merci de réessayer dans ${limited.retryAfterSeconds} secondes.`,
    };
  }

  if ((rawAction === 'REJECT' || rawAction === 'REQUEST_CHANGE') && !feedback) {
    return { success: false, message: 'Merci d’indiquer un motif pour que l’entreprise puisse vous répondre.' };
  }

  return recordDecision({
    token,
    action: rawAction as 'ACCEPT' | 'REJECT' | 'REQUEST_CHANGE',
    feedback,
    actorName,
    actorEmail,
    ip,
    userAgent,
  });
}
