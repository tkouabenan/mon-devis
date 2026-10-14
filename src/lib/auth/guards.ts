import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { organizationMembers, organizationSettings, organizations } from '@/db/schema';
import { getSession, type SessionContext, type SessionUser } from './session';
import { errors } from '@/lib/api';

/**
 * Contrôle d'accès.
 *  - `requireSession()` : pages protégées (redirection vers /connexion).
 *  - `requireOrganization()` : garantit qu'une organisation active existe.
 *  - `requireApiOrganization()` : routes API (retourne une réponse 401/403 au lieu d'une redirection).
 */

export class AuthenticationError extends Error {
  constructor(message = 'Authentification requise.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Vous n'avez pas les droits nécessaires.") {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Ressource introuvable.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class QuotaError extends Error {
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'QuotaError';
    this.details = details;
  }
}

export interface OrgContext {
  user: SessionUser;
  sessionId: string;
  organization: { id: string; name: string; slug: string; ownerId: string; createdAt: Date };
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  memberships: SessionContext['memberships'];
  /** Vrai pour le propriétaire et les administrateurs. */
  canManage: boolean;
  isOwner: boolean;
}

export async function requireSession(redirectTo = '/connexion'): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect(redirectTo);
  return session;
}

/**
 * Contexte d'organisation pour les pages protégées.
 * Crée automatiquement les réglages par défaut si l'organisation vient d'être créée.
 */
export async function requireOrganization(): Promise<OrgContext> {
  const session = await requireSession();
  if (!session.activeOrganization || !session.role) {
    redirect('/onboarding');
  }

  const organization = session.activeOrganization;
  const role = session.role;

  // Réglages par défaut (idempotent) : évite les états incohérents en cas d'organisation créée manuellement.
  const [settings] = await db
    .select({ id: organizationSettings.id })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organization.id))
    .limit(1);
  if (!settings) {
    await db.insert(organizationSettings).values({ organizationId: organization.id }).onConflictDoNothing();
  }

  return {
    user: session.user,
    sessionId: session.sessionId,
    organization,
    role,
    memberships: session.memberships,
    canManage: role === 'OWNER' || role === 'ADMIN',
    isOwner: role === 'OWNER',
  };
}

/** Variante API : lève des exceptions converties en réponses JSON par `withErrorHandling`. */
export async function requireApiOrganization(roles?: ('OWNER' | 'ADMIN' | 'MEMBER')[]): Promise<OrgContext> {
  const session = await getSession();
  if (!session) throw new AuthenticationError();
  if (!session.activeOrganization || !session.role) {
    throw new AuthorizationError("Aucune organisation active. Terminez votre configuration d'entreprise.");
  }
  if (roles && !roles.includes(session.role)) {
    throw new AuthorizationError();
  }
  return {
    user: session.user,
    sessionId: session.sessionId,
    organization: session.activeOrganization,
    role: session.role,
    memberships: session.memberships,
    canManage: session.role === 'OWNER' || session.role === 'ADMIN',
    isOwner: session.role === 'OWNER',
  };
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (!session.user.isPlatformAdmin) redirect('/tableau-de-bord');
  return session.user;
}

export async function requireApiPlatformAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthenticationError();
  if (!session.user.isPlatformAdmin) throw new AuthorizationError('Accès administrateur requis.');
  return session.user;
}

/**
 * Vérifie que l'utilisateur a bien accès à une organisation donnée
 * (protection contre la manipulation d'identifiants dans les URL/formulaires).
 */
export async function assertOrganizationAccess(userId: string, organizationId: string): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);

  if (!membership) throw new AuthorizationError("Accès refusé à cette organisation.");
  return membership.role;
}

/** Convertit les exceptions de sécurité en réponses API standardisées. */
export function guardToResponse(error: unknown) {
  if (error instanceof AuthenticationError) return errors.unauthorized();
  if (error instanceof AuthorizationError) return errors.forbidden(error.message);
  if (error instanceof NotFoundError) return errors.notFound(error.message);
  if (error instanceof QuotaError) return errors.quota(error.message, error.details);
  return null;
}
