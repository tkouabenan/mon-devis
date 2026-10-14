'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { organizationSettings } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { recordAuditFromRequest } from '@/lib/audit';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { getTemplate, isPremiumTemplate, QUOTATION_TEMPLATES } from '@/lib/templates';
import type { ActionResult } from '@/app/actions/auth';

/**
 * Actions serveur des modèles de devis.
 *
 * La sélection d'un modèle est enregistrée dans les réglages de l'organisation :
 * elle s'applique immédiatement aux prochains devis, à l'aperçu et aux exports.
 * Les modèles marqués `premium` nécessitent une formule payante ; le contrôle est
 * fait côté serveur (jamais seulement dans l'interface).
 */

export async function setDefaultTemplateAction(templateKey: string): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const template = QUOTATION_TEMPLATES.find((entry) => entry.key === templateKey);
  if (!template) {
    return { success: false, message: 'Modèle inconnu.' };
  }

  if (template.premium) {
    const subscription = await getOrganizationSubscription(organizationId);
    if (subscription.isFree) {
      return {
        success: false,
        message: `Le modèle « ${template.name} » est réservé aux formules payantes. Passez à une formule supérieure depuis la page Abonnement.`,
      };
    }
  }

  await db
    .insert(organizationSettings)
    .values({ organizationId, defaultTemplateKey: template.key })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { defaultTemplateKey: template.key, updatedAt: new Date() },
    });

  await recordAuditFromRequest({
    action: 'settings.default_template_changed',
    entity: 'organization_settings',
    entityId: organizationId,
    organizationId,
    actorUserId: context.user.id,
    metadata: { templateKey: template.key, premium: template.premium },
  });

  revalidatePath('/modeles');
  revalidatePath('/devis/nouveau');
  revalidatePath('/parametres');
  return { success: true, message: `Modèle « ${template.name} » défini par défaut.` };
}

export async function resetTemplateCustomizationAction(): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  await db
    .insert(organizationSettings)
    .values({ organizationId, templateCustomization: null })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { templateCustomization: null, updatedAt: new Date() },
    });

  await recordAuditFromRequest({
    action: 'settings.template_customization_reset',
    entity: 'organization_settings',
    entityId: organizationId,
    organizationId,
    actorUserId: context.user.id,
  });

  revalidatePath('/modeles');
  revalidatePath('/devis/nouveau');
  return { success: true, message: 'Personnalisation réinitialisée : les modèles reprennent leurs valeurs d’origine.' };
}

/** Vérifie qu'un modèle peut être utilisé par l'organisation (utilisé par l'éditeur). */
export async function canUseTemplateAction(templateKey: string): Promise<{ allowed: boolean; reason?: string }> {
  const context = await requireOrganization();
  const template = getTemplate(templateKey);
  if (!isPremiumTemplate(templateKey)) return { allowed: true };

  const subscription = await getOrganizationSubscription(context.organization.id);
  if (subscription.isFree) {
    return { allowed: false, reason: `Le modèle « ${template.name} » nécessite une formule payante.` };
  }
  return { allowed: true };
}
