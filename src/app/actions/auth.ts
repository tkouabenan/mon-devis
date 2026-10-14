'use server';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/db';
import { applicationSettings, authTokens, companyProfiles, organizationMembers, organizationSettings, organizations, users } from '@/db/schema';
import { createSession, destroySession, getSession, revokeAllSessions, touchLastLogin } from '@/lib/auth/session';
import { generateToken, hashPassword, hashToken, verifyPassword } from '@/lib/auth/password';
import { loginSchema, registerSchema, resetPasswordSchema, changePasswordSchema, forgotPasswordSchema } from '@/lib/validation/schemas';
import { formatZodError } from '@/lib/api';
import { recordAuditFromRequest } from '@/lib/audit';
import { clientIp, RateLimits, rateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email/mailer';
import { passwordResetEmail, verificationEmail as buildVerificationEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { slugify } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

/**
 * Actions serveur d'authentification.
 * Les mots de passe sont hachés (bcrypt), les jetons de vérification/réinitialisation
 * sont à usage unique et stockés uniquement sous forme d'empreinte SHA-256.
 */

export interface ActionResult<T = undefined> {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  data?: T;
}

const EMAIL_VERIFICATION_TTL_HOURS = 48;
const PASSWORD_RESET_TTL_MINUTES = 60;

async function requestFingerprint(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers();
  return { ip: clientIp(headerList), userAgent: headerList.get('user-agent') };
}

export async function registerAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    companyName: formData.get('companyName') || undefined,
    acceptTerms: formData.get('acceptTerms') === 'on' || formData.get('acceptTerms') === 'true',
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Veuillez corriger les champs signalés.' };
  }

  const { ip, userAgent } = await requestFingerprint();
  const limit = rateLimit(`register:${ip ?? 'unknown'}`, RateLimits.register.max, RateLimits.register.window);
  if (!limit.allowed) {
    return {
      success: false,
      message: "Trop de tentatives d'inscription. Merci de réessayer dans quelques minutes.",
    };
  }

  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return {
      success: false,
      errors: { email: 'Un compte existe déjà avec cette adresse e-mail.' },
      message: 'Cette adresse e-mail est déjà utilisée.',
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        name: parsed.data.name.trim(),
        passwordHash,
        locale: 'fr-FR',
        theme: 'SYSTEM',
      })
      .returning();

    const organizationName = (parsed.data.companyName || `Entreprise de ${user.name}`).trim();
    const baseSlug = slugify(organizationName) || `organisation-${user.id.slice(0, 6)}`;

    // Garantit l'unicité du slug sans bloquer l'inscription.
    let slug = baseSlug;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (!taken) break;
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
      if (attempt > 20) {
        slug = `${baseSlug}-${user.id.slice(0, 8)}`;
        break;
      }
    }

    const [organization] = await tx
      .insert(organizations)
      .values({ name: organizationName, slug, ownerId: user.id })
      .returning();

    await tx.insert(organizationMembers).values({ organizationId: organization.id, userId: user.id, role: 'OWNER' });

    const currency = currencyForCountry('CI');
    await tx.insert(organizationSettings).values({
      organizationId: organization.id,
      defaultCurrency: currency,
      defaultTaxRate: '18',
      defaultValidityDays: 30,
      defaultTemplateKey: 'moderne',
    });

    await tx.insert(companyProfiles).values({
      organizationId: organization.id,
      name: organizationName,
      isDefault: true,
      country: "Côte d'Ivoire",
      countryCode: 'CI',
    });

    return { user, organization };
  });

  await touchLastLogin(created.user.id);
  await createSession(created.user.id, { userAgent, ip });
  await recordAuditFromRequest({
    action: 'auth.register',
    entity: 'user',
    entityId: created.user.id,
    organizationId: created.organization.id,
    actorUserId: created.user.id,
    metadata: { email: created.user.email },
  });

  // Vérification d'e-mail : envoyée si un fournisseur est configuré.
  await sendVerificationEmailIfNeeded(created.user.id, created.user.email, created.user.name).catch(() => undefined);

  redirect('/onboarding');
}

export async function loginAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember: formData.get('remember') === 'on',
    redirectTo: formData.get('redirectTo') || undefined,
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Veuillez vérifier vos identifiants.' };
  }

  const { ip, userAgent } = await requestFingerprint();
  const limit = rateLimit(`login:${ip ?? 'unknown'}`, RateLimits.login.max, RateLimits.login.window);
  if (!limit.allowed) {
    return { success: false, message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' };
  }

  const email = parsed.data.email.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Message volontairement identique dans les deux cas (pas d'énumération de comptes).
  const invalidMessage = 'Adresse e-mail ou mot de passe incorrect.';
  if (!user) {
    await recordAuditFromRequest({ action: 'auth.login_failed', entity: 'user', metadata: { email } });
    return { success: false, message: invalidMessage };
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    await recordAuditFromRequest({ action: 'auth.login_failed', entity: 'user', entityId: user.id, actorUserId: user.id });
    return { success: false, message: invalidMessage };
  }

  if (user.isSuspended) {
    return { success: false, message: "Ce compte est suspendu. Contactez le support pour plus d'informations." };
  }

  await createSession(user.id, { remember: parsed.data.remember, userAgent, ip });
  await touchLastLogin(user.id);
  await recordAuditFromRequest({ action: 'auth.login', entity: 'user', entityId: user.id, actorUserId: user.id });

  const redirectTo = parsed.data.redirectTo && parsed.data.redirectTo.startsWith('/') ? parsed.data.redirectTo : '/tableau-de-bord';
  redirect(redirectTo);
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await recordAuditFromRequest({ action: 'auth.logout', entity: 'user', entityId: session.user.id, actorUserId: session.user.id });
  }
  await destroySession();
  redirect('/connexion');
}

export async function forgotPasswordAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  const neutral: ActionResult = {
    success: true,
    message:
      'Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d’être envoyé. Pensez à vérifier vos courriers indésirables.',
  };
  if (!parsed.success) return neutral;

  const { ip } = await requestFingerprint();
  const limit = rateLimit(`reset:${ip ?? 'unknown'}`, RateLimits.passwordReset.max, RateLimits.passwordReset.window);
  if (!limit.allowed) {
    return { success: false, message: 'Trop de demandes. Merci de réessayer dans quelques minutes.' };
  }

  const email = parsed.data.email.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return neutral;

  const token = generateToken(32);
  await db.insert(authTokens).values({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
  });

  const resetUrl = `${env.appUrl}/reinitialiser-mot-de-passe?token=${token}`;
  const template = passwordResetEmail({ name: user.name, url: resetUrl, expiresInMinutes: PASSWORD_RESET_TTL_MINUTES });
  const result = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    template: 'password_reset',
  });

  await recordAuditFromRequest({
    action: 'auth.password_reset_request',
    entity: 'user',
    entityId: user.id,
    actorUserId: user.id,
  });

  if (!result.delivered) {
    // Aucun fournisseur configuré : on l'indique clairement plutôt que de simuler un envoi.
    return {
      success: true,
      message: neutral.message,
      data: { deliverySkipped: true } as never,
    };
  }

  return neutral;
}

export async function resetPasswordAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations saisies.' };
  }

  const tokenHash = hashToken(parsed.data.token);
  const [record] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, 'PASSWORD_RESET'),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) {
    return { success: false, message: 'Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.' };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, record.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, record.id));
  });

  // Toutes les sessions existantes sont révoquées après un changement de mot de passe.
  await revokeAllSessions(record.userId);
  await recordAuditFromRequest({ action: 'auth.password_reset', entity: 'user', entityId: record.userId, actorUserId: record.userId });

  return { success: true, message: 'Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter.' };
}

export async function changePasswordAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, message: 'Vous devez être connecté.' };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations saisies.' };
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { success: false, errors: { currentPassword: 'Mot de passe actuel incorrect.' }, message: 'Mot de passe actuel incorrect.' };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
  await revokeAllSessions(user.id, session.sessionId);
  await recordAuditFromRequest({ action: 'auth.password_reset', entity: 'user', entityId: user.id, actorUserId: user.id });

  return { success: true, message: 'Mot de passe mis à jour. Les autres sessions ont été déconnectées.' };
}

/** Envoie (ou renvoie) l'e-mail de vérification d'adresse. */
export async function sendVerificationEmailIfNeeded(userId: string, email: string, name: string): Promise<boolean> {
  const token = generateToken(32);
  await db.insert(authTokens).values({
    userId,
    purpose: 'EMAIL_VERIFICATION',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
  });

  const url = `${env.appUrl}/verifier-email?token=${token}`;
  const template = buildVerificationEmail({ name, url, expiresInHours: EMAIL_VERIFICATION_TTL_HOURS });
  const result = await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    template: 'email_verification',
  });
  return result.delivered;
}

export async function resendVerificationAction(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, message: 'Vous devez être connecté.' };
  if (session.user.emailVerified) return { success: true, message: 'Votre adresse e-mail est déjà confirmée.' };

  const delivered = await sendVerificationEmailIfNeeded(session.user.id, session.user.email, session.user.name);
  return {
    success: true,
    message: delivered
      ? 'Un nouvel e-mail de confirmation vient d’être envoyé.'
      : "Aucun service d'e-mail n'est configuré sur cette instance : le message n'a pas pu être envoyé.",
  };
}

export async function verifyEmailAction(token: string): Promise<ActionResult> {
  const tokenHash = hashToken(token);
  const [record] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, 'EMAIL_VERIFICATION'),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) {
    return { success: false, message: 'Ce lien de confirmation est invalide ou a expiré.' };
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, record.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, record.id));
  });

  await recordAuditFromRequest({ action: 'auth.email_verified', entity: 'user', entityId: record.userId, actorUserId: record.userId });
  return { success: true, message: 'Votre adresse e-mail est confirmée. Merci !' };
}

/** L'inscription exige-t-elle la vérification de l'e-mail ? (paramètre plateforme) */
export async function isEmailVerificationRequired(): Promise<boolean> {
  const [setting] = await db
    .select()
    .from(applicationSettings)
    .where(eq(applicationSettings.key, 'platform.general'))
    .limit(1);
  const value = setting?.value as { emailVerificationRequired?: boolean } | undefined;
  return Boolean(value?.emailVerificationRequired);
}
