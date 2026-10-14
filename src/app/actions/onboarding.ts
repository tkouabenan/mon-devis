'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { companyProfiles, organizationSettings, organizations } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { companyProfileSchema, organizationSchema, organizationSettingsSchema } from '@/lib/validation/schemas';
import { formatZodError } from '@/lib/api';
import { recordAuditFromRequest } from '@/lib/audit';
import { saveFile } from '@/lib/storage';
import { MAX_LOGO_SIZE_BYTES, sanitizeImageBuffer, sanitizeSvg, validateImageUpload } from '@/lib/upload';
import type { ActionResult } from '@/app/actions/auth';

/**
 * Actions serveur de la configuration initiale (onboarding).
 * Chaque étape peut être enregistrée indépendamment : aucune perte de saisie.
 */

async function currentCompanyProfileId(organizationId: string): Promise<string> {
  const [profile] = await db
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.organizationId, organizationId))
    .limit(1);
  if (profile) return profile.id;

  const [created] = await db.insert(companyProfiles).values({ organizationId, name: 'Mon entreprise', isDefault: true }).returning();
  return created.id;
}

/** Étape 1 — identité de l'entreprise (nom de l'organisation + fiche entreprise). */
export async function saveCompanyStepAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const parsed = companyProfileSchema.safeParse({
    name: formData.get('name'),
    addressLine1: formData.get('addressLine1') ?? undefined,
    addressLine2: formData.get('addressLine2') ?? undefined,
    postalCode: formData.get('postalCode') ?? undefined,
    city: formData.get('city') ?? undefined,
    country: formData.get('country'),
    countryCode: formData.get('countryCode') ?? 'CI',
    phone: formData.get('phone') ?? undefined,
    email: formData.get('email') ?? undefined,
    website: formData.get('website') ?? undefined,
    registrationNumber: formData.get('registrationNumber') ?? undefined,
    taxId: formData.get('taxId') ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations de l’entreprise.' };
  }

  const profileId = await currentCompanyProfileId(organizationId);

  await db.transaction(async (tx) => {
    await tx
      .update(companyProfiles)
      .set({ ...parsed.data, isDefault: true, updatedAt: new Date() })
      .where(eq(companyProfiles.id, profileId));

    const organizationName = formData.get('organizationName');
    if (typeof organizationName === 'string' && organizationName.trim().length >= 2) {
      const organizationParsed = organizationSchema.safeParse({ name: organizationName });
      if (organizationParsed.success) {
        await tx
          .update(organizations)
          .set({ name: organizationParsed.data.name, updatedAt: new Date() })
          .where(eq(organizations.id, organizationId));
      }
    }
  });

  await recordAuditFromRequest({
    action: 'company.update',
    entity: 'company_profile',
    entityId: profileId,
    organizationId,
    actorUserId: context.user.id,
  });

  revalidatePath('/onboarding');
  revalidatePath('/tableau-de-bord');
  return { success: true, message: 'Informations de l’entreprise enregistrées.' };
}

/** Étape 2 — réglages par défaut des devis (devise, TVA, validité, numérotation). */
export async function saveSettingsStepAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const parsed = organizationSettingsSchema.safeParse({
    defaultCurrency: formData.get('defaultCurrency'),
    defaultTaxRate: formData.get('defaultTaxRate'),
    defaultValidityDays: formData.get('defaultValidityDays'),
    defaultTemplateKey: formData.get('defaultTemplateKey') ?? 'moderne',
    numberingFormat: formData.get('numberingFormat') ?? 'DEV-{YYYY}-{SEQ:4}',
    numberingResetYearly: formData.get('numberingResetYearly') === 'on',
    pricesIncludeTax: formData.get('pricesIncludeTax') === 'on',
    defaultPaymentTerms: formData.get('defaultPaymentTerms') ?? undefined,
    brandColor: formData.get('brandColor') ?? '#2563EB',
    brandColorSecondary: formData.get('brandColorSecondary') ?? '#0F172A',
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les réglages saisis.' };
  }

  // Les colonnes numériques sont stockées en `numeric` : Drizzle attend une chaîne.
  const settingsValues = { ...parsed.data, defaultTaxRate: String(parsed.data.defaultTaxRate) };

  await db
    .insert(organizationSettings)
    .values({ organizationId, ...settingsValues })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { ...settingsValues, updatedAt: new Date() },
    });

  await recordAuditFromRequest({
    action: 'settings.update',
    entity: 'organization_settings',
    entityId: organizationId,
    organizationId,
    actorUserId: context.user.id,
    metadata: { section: 'quotation_defaults' },
  });

  revalidatePath('/onboarding');
  revalidatePath('/tableau-de-bord');
  return { success: true, message: 'Réglages par défaut enregistrés.' };
}

/** Étape 3 — logo de l'entreprise (PNG, JPG, SVG ; 2 Mo maximum). */
export async function uploadLogoAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: 'Sélectionnez un fichier image (PNG, JPG ou SVG).' };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { success: false, message: 'Le logo ne doit pas dépasser 2 Mo.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateImageUpload({ name: file.name, type: file.type, buffer });
  if (!validation.valid || !validation.mimeType) {
    return { success: false, message: validation.error ?? 'Fichier image invalide.' };
  }

  const mimeType = validation.mimeType;
  const cleaned = mimeType === 'image/svg+xml' ? Buffer.from(sanitizeSvg(buffer), 'utf8') : sanitizeImageBuffer(buffer, mimeType);
  const stored = await saveFile({
    scope: 'logos',
    organizationId,
    fileName: file.name,
    buffer: cleaned,
    mimeType,
  });

  const profileId = await currentCompanyProfileId(organizationId);
  await db
    .update(companyProfiles)
    .set({ logoUrl: stored.url, logoMimeType: stored.mimeType, updatedAt: new Date() })
    .where(eq(companyProfiles.id, profileId));

  await recordAuditFromRequest({
    action: 'company.logo_uploaded',
    entity: 'company_profile',
    entityId: profileId,
    organizationId,
    actorUserId: context.user.id,
    metadata: { mimeType: stored.mimeType, size: stored.size },
  });

  revalidatePath('/onboarding');
  revalidatePath('/mon-entreprise');
  return { success: true, message: 'Logo enregistré.', data: { url: stored.url } as never };
}

/** Fin de la configuration : marque l'organisation comme prête puis redirige. */
export async function completeOnboardingAction(): Promise<ActionResult> {
  const context = await requireOrganization();

  await recordAuditFromRequest({
    action: 'organization.onboarding_completed',
    entity: 'organization',
    entityId: context.organization.id,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  redirect('/tableau-de-bord');
}

/** Données affichées par l'assistant : profil entreprise + réglages courants. */
export async function getOnboardingData() {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const [profile] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.organizationId, organizationId))
    .limit(1);

  const [settings] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);

  return {
    organization: context.organization,
    company: profile ?? null,
    settings: settings ?? null,
    userName: context.user.name,
    hasLogo: Boolean(profile?.logoUrl),
  };
}
