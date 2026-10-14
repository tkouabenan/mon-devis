'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  companyProfiles,
  notificationPreferences,
  organizationMembers,
  organizationSettings,
  organizations,
  sessions,
  supportTickets,
  users,
} from '@/db/schema';
import { requireOrganization, requireSession } from '@/lib/auth/guards';
import { revokeSession, setActiveOrganization } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { validatePasswordPolicy } from '@/lib/auth/password-policy';
import {
  companyProfileSchema,
  organizationSchema,
  organizationSettingsSchema,
  supportTicketSchema,
  updateProfileSchema,
} from '@/lib/validation/schemas';
import { formatZodError } from '@/lib/api';
import { recordAuditFromRequest } from '@/lib/audit';
import { notifyOrganization } from '@/lib/notifications';
import { saveFile } from '@/lib/storage';
import { MAX_LOGO_SIZE_BYTES, sanitizeImageBuffer, sanitizeSvg, validateImageUpload } from '@/lib/upload';
import { createOrganizationForUser, listOrganizationsForUser } from '@/lib/services/organizations';
import type { ActionResult } from '@/app/actions/auth';

/**
 * Actions serveur des paramètres : profil, entreprise, valeurs par défaut des
 * documents, personnalisation des modèles, notifications, sécurité, support et
 * demande de suppression de compte.
 *
 * Aucune donnée n'est modifiée sans vérification d'appartenance : chaque requête
 * est filtrée par `organizationId` (ou par utilisateur pour les réglages personnels).
 */

// ---------------------------------------------------------------------------
// Profil utilisateur
// ---------------------------------------------------------------------------

export async function updateProfileAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsed = updateProfileSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone') ?? undefined,
    locale: formData.get('locale') ?? 'fr-FR',
    theme: formData.get('theme') ?? 'SYSTEM',
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez vos informations.' };
  }

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      locale: parsed.data.locale,
      theme: parsed.data.theme as 'LIGHT' | 'DARK' | 'SYSTEM',
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  await recordAuditFromRequest({
    action: 'user.profile_updated',
    entity: 'user',
    entityId: session.user.id,
    organizationId: session.activeOrganization?.id ?? null,
    actorUserId: session.user.id,
  });

  revalidatePath('/parametres');
  revalidatePath('/tableau-de-bord');
  return { success: true, message: 'Profil mis à jour.' };
}

export async function uploadAvatarAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();
  const file = formData.get('avatar');
  const organizationId = session.activeOrganization?.id ?? '';

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: 'Sélectionnez une image (PNG ou JPG).' };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { success: false, message: 'L’image ne doit pas dépasser 2 Mo.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateImageUpload({ name: file.name, type: file.type, buffer });
  if (!validation.valid || !validation.mimeType || validation.mimeType === 'image/svg+xml') {
    return { success: false, message: validation.error ?? 'Format d’image non pris en charge pour un avatar.' };
  }

  const cleaned = sanitizeImageBuffer(buffer, validation.mimeType);
  const stored = await saveFile({
    scope: 'avatars',
    organizationId,
    fileName: file.name,
    buffer: cleaned,
    mimeType: validation.mimeType,
  });

  await db.update(users).set({ avatarUrl: stored.url, updatedAt: new Date() }).where(eq(users.id, session.user.id));

  revalidatePath('/parametres');
  return { success: true, message: 'Photo de profil mise à jour.', data: { url: stored.url } };
}

// ---------------------------------------------------------------------------
// Organisation et entreprise
// ---------------------------------------------------------------------------

export async function saveCompanyProfileAction(
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

  const extra = {
    legalInfo: String(formData.get('legalInfo') ?? '') || null,
    bankDetails: String(formData.get('bankDetails') ?? '') || null,
    paymentInfo: String(formData.get('paymentInfo') ?? '') || null,
    signatureLabel: String(formData.get('signatureLabel') ?? '') || null,
  };

  const [profile] = await db
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.organizationId, organizationId))
    .limit(1);

  const values = { ...parsed.data, ...extra, isDefault: true, updatedAt: new Date() };

  await db.transaction(async (tx) => {
    if (profile) {
      await tx.update(companyProfiles).set(values).where(eq(companyProfiles.id, profile.id));
    } else {
      await tx.insert(companyProfiles).values({ organizationId, ...values });
    }

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
    entityId: profile?.id ?? organizationId,
    organizationId,
    actorUserId: context.user.id,
  });

  revalidatePath('/mon-entreprise');
  revalidatePath('/parametres');
  return { success: true, message: 'Entreprise mise à jour.' };
}

export async function uploadCompanyLogoAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
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
  const stored = await saveFile({ scope: 'logos', organizationId, fileName: file.name, buffer: cleaned, mimeType });

  const [profile] = await db
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.organizationId, organizationId))
    .limit(1);

  if (profile) {
    await db
      .update(companyProfiles)
      .set({ logoUrl: stored.url, logoMimeType: stored.mimeType, updatedAt: new Date() })
      .where(eq(companyProfiles.id, profile.id));
  } else {
    await db.insert(companyProfiles).values({
      organizationId,
      name: context.organization.name,
      logoUrl: stored.url,
      logoMimeType: stored.mimeType,
      isDefault: true,
    });
  }

  await recordAuditFromRequest({
    action: 'company.logo_uploaded',
    entity: 'company_profile',
    entityId: profile?.id ?? organizationId,
    organizationId,
    actorUserId: context.user.id,
    metadata: { mimeType: stored.mimeType, size: stored.size },
  });

  revalidatePath('/mon-entreprise');
  return { success: true, message: 'Logo enregistré. Il apparaîtra sur vos prochains devis.', data: { url: stored.url } };
}

// ---------------------------------------------------------------------------
// Réglages des documents
// ---------------------------------------------------------------------------

export async function updateDocumentSettingsAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const parsed = organizationSettingsSchema.safeParse({
    defaultCurrency: formData.get('defaultCurrency'),
    defaultTaxRate: formData.get('defaultTaxRate'),
    defaultValidityDays: formData.get('defaultValidityDays'),
    defaultTemplateKey: formData.get('defaultTemplateKey'),
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

  const dueDays = Number(formData.get('invoiceDueDays') ?? 30);
  const values = {
    ...parsed.data,
    defaultTaxRate: String(parsed.data.defaultTaxRate),
    defaultTerms: String(formData.get('defaultTerms') ?? '') || null,
    defaultNotes: String(formData.get('defaultNotes') ?? '') || null,
    invoiceNumberingFormat: String(formData.get('invoiceNumberingFormat') ?? 'FAC-{YYYY}-{SEQ:4}'),
    invoiceDueDays: Number.isFinite(dueDays) ? Math.min(Math.max(Math.round(dueDays), 0), 365) : 30,
    logoPosition: String(formData.get('logoPosition') ?? 'LEFT'),
    emailReminders: formData.get('emailReminders') === 'on',
    updatedAt: new Date(),
  };

  await db
    .insert(organizationSettings)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({ target: organizationSettings.organizationId, set: values });

  await recordAuditFromRequest({
    action: 'settings.update',
    entity: 'organization_settings',
    entityId: organizationId,
    organizationId,
    actorUserId: context.user.id,
    metadata: { section: 'documents' },
  });

  revalidatePath('/parametres');
  revalidatePath('/mon-entreprise');
  revalidatePath('/devis/nouveau');
  return { success: true, message: 'Réglages des documents enregistrés.' };
}

/** Enregistre la personnalisation du modèle (couleurs, police, éléments visibles). */
export async function saveTemplateCustomizationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const raw = String(formData.get('customization') ?? '');

  let customization: Record<string, unknown> | null = null;
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { success: false, message: 'Personnalisation illisible.' };
      }
      customization = parsed as Record<string, unknown>;
    } catch {
      return { success: false, message: 'Personnalisation illisible.' };
    }
  }

  const values = { templateCustomization: customization, updatedAt: new Date() };
  await db
    .insert(organizationSettings)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({ target: organizationSettings.organizationId, set: values });

  await recordAuditFromRequest({
    action: 'settings.update',
    entity: 'organization_settings',
    entityId: organizationId,
    organizationId,
    actorUserId: context.user.id,
    metadata: { section: 'template_customization' },
  });

  revalidatePath('/modeles');
  revalidatePath('/devis/nouveau');
  return { success: true, message: customization ? 'Personnalisation enregistrée.' : 'Personnalisation réinitialisée.' };
}

// ---------------------------------------------------------------------------
// Notifications personnelles
// ---------------------------------------------------------------------------

export async function updateNotificationPreferencesAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession();
  const pick = (name: string) => formData.get(name) === 'on';

  const values = {
    quotationViewed: pick('quotationViewed'),
    quotationAccepted: pick('quotationAccepted'),
    quotationRejected: pick('quotationRejected'),
    quotationExpiring: pick('quotationExpiring'),
    invoiceCreated: pick('invoiceCreated'),
    paymentReceived: pick('paymentReceived'),
    weeklySummary: pick('weeklySummary'),
    productUpdates: pick('productUpdates'),
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, session.user.id))
    .limit(1);

  if (existing) {
    await db.update(notificationPreferences).set(values).where(eq(notificationPreferences.id, existing.id));
  } else {
    await db.insert(notificationPreferences).values({ userId: session.user.id, ...values });
  }

  revalidatePath('/parametres');
  return { success: true, message: 'Préférences de notification enregistrées.' };
}

// ---------------------------------------------------------------------------
// Sécurité
// ---------------------------------------------------------------------------

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const session = await requireSession();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, session.user.id)))
    .limit(1);

  if (rows.length === 0) return { success: false, message: 'Session introuvable.' };
  if (sessionId === session.sessionId) {
    return { success: false, message: 'Impossible de révoquer la session en cours depuis cette page.' };
  }

  await revokeSession(session.user.id, sessionId);
  await recordAuditFromRequest({
    action: 'user.session_revoked',
    entity: 'session',
    entityId: sessionId,
    organizationId: session.activeOrganization?.id ?? null,
    actorUserId: session.user.id,
  });

  revalidatePath('/parametres');
  return { success: true, message: 'Session déconnectée.' };
}

export async function revokeOtherSessionsAction(): Promise<ActionResult> {
  const session = await requireSession();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, session.user.id), isNull(sessions.revokedAt)));

  // La session courante est recréée pour ne pas déconnecter l'utilisateur actif.
  await db
    .update(sessions)
    .set({ revokedAt: null })
    .where(and(eq(sessions.userId, session.user.id), eq(sessions.id, session.sessionId)));

  await recordAuditFromRequest({
    action: 'user.all_sessions_revoked',
    entity: 'user',
    entityId: session.user.id,
    organizationId: session.activeOrganization?.id ?? null,
    actorUserId: session.user.id,
  });

  revalidatePath('/parametres');
  return { success: true, message: 'Toutes les autres sessions ont été déconnectées.' };
}

export async function changeOwnPasswordAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession();
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (newPassword !== confirmPassword) {
    return { success: false, errors: { confirmPassword: 'Les mots de passe ne correspondent pas.' }, message: 'Vérifiez la confirmation.' };
  }

  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    return { success: false, errors: { password: policy.message ?? 'Mot de passe trop faible.' }, message: 'Mot de passe refusé.' };
  }

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return { success: false, errors: { currentPassword: 'Mot de passe actuel incorrect.' }, message: 'Mot de passe actuel incorrect.' };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  await recordAuditFromRequest({
    action: 'user.password_changed',
    entity: 'user',
    entityId: session.user.id,
    organizationId: session.activeOrganization?.id ?? null,
    actorUserId: session.user.id,
  });

  return { success: true, message: 'Mot de passe mis à jour. Vos autres sessions restent actives.' };
}

// ---------------------------------------------------------------------------
// Organisations actives
// ---------------------------------------------------------------------------

export async function setActiveOrganizationAction(organizationId: string): Promise<ActionResult> {
  const session = await requireSession();
  const membership = session.memberships.find((entry) => entry.organizationId === organizationId);
  if (!membership) return { success: false, message: 'Vous n’êtes pas membre de cette organisation.' };

  await setActiveOrganization(organizationId);
  revalidatePath('/tableau-de-bord');
  revalidatePath('/devis');
  revalidatePath('/factures');
  return { success: true, message: `Organisation active : ${membership.organization.name}.` };
}

export async function listMyOrganizationsAction() {
  const session = await requireSession();
  return listOrganizationsForUser(session.user.id);
}

export async function addOrganizationAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = organizationSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Nom d’organisation invalide.' };
  }

  const organization = await createOrganizationForUser({
    userId: session.user.id,
    name: parsed.data.name,
    withTrial: formData.get('withTrial') === 'on',
  });

  revalidatePath('/parametres');
  return { success: true, message: `Organisation « ${organization.name} » créée.`, data: { id: organization.id } };
}

// ---------------------------------------------------------------------------
// Support et données personnelles
// ---------------------------------------------------------------------------

export async function createSupportTicketAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireOrganization();
  const session = { user: context.user, activeOrganization: context.organization };
  const parsed = supportTicketSchema.safeParse({
    subject: formData.get('subject'),
    message: formData.get('message'),
    priority: formData.get('priority') ?? 'NORMAL',
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez votre demande.' };
  }

  const organizationId = session.activeOrganization.id;
  const [ticket] = await db
    .insert(supportTickets)
    .values({
      organizationId,
      userId: session.user.id,
      subject: parsed.data.subject,
      message: parsed.data.message,
      priority: parsed.data.priority as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      status: 'OPEN',
    })
    .returning();

  await recordAuditFromRequest({
    action: 'support.ticket_created',
    entity: 'support_ticket',
    entityId: ticket.id,
    organizationId,
    actorUserId: session.user.id,
    metadata: { priority: ticket.priority },
  });

  revalidatePath('/aide');
  await notifyOrganization(organizationId, {
    type: 'ACCOUNT_EVENT',
    title: 'Demande d’assistance envoyée',
    body: `Votre demande « ${ticket.subject} » a été transmise à l’équipe MON DEVIS.`,
    link: '/aide',
  }).catch(() => undefined);

  return { success: true, message: 'Votre demande a été transmise. Nous revenons vers vous par e-mail.' };
}

/**
 * Demande de suppression du compte : la suppression n'est jamais silencieuse.
 * La demande est horodatée, tracée et transmise à l'administration qui exécute
 * la suppression après vérification (obligations comptables conservées).
 */
export async function requestAccountDeletionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession();
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '').trim().toUpperCase();

  if (confirmation !== 'SUPPRIMER') {
    return { success: false, message: 'Saisissez SUPPRIMER pour confirmer la demande.' };
  }

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return { success: false, message: 'Mot de passe incorrect.' };
  }

  const organizationId = session.activeOrganization?.id ?? null;
  if (organizationId) {
    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, session.user.id)))
      .limit(1);

    if (membership?.role === 'OWNER') {
      await db.update(organizations).set({ deletionRequestedAt: new Date(), updatedAt: new Date() }).where(eq(organizations.id, organizationId));
    }
  }

  await recordAuditFromRequest({
    action: 'user.deletion_requested',
    entity: 'user',
    entityId: session.user.id,
    organizationId,
    actorUserId: session.user.id,
    metadata: { requestedAt: new Date().toISOString() },
  });

  revalidatePath('/parametres');
  return {
    success: true,
    message:
      'Votre demande de suppression a été enregistrée et transmise à l’administration. Vos données seront supprimées après vérification (les documents comptables légalement obligatoires sont conservés).',
  };
}
