import { cookies } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { organizationMembers, organizations, sessions, users } from '@/db/schema';
import { env } from '@/lib/env';
import { generateToken, hashToken } from './password';
import { hashIp } from '@/lib/rate-limit';

/**
 * Sessions serveur : jeton opaque de 256 bits (empreinte SHA-256 en base),
 * transmis via un cookie HttpOnly + SameSite=Lax. Aucun jeton n'est lisible en JavaScript.
 */

export const SESSION_COOKIE = 'mon_devis_session';
const ACTIVE_ORG_COOKIE = 'mon_devis_org';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_DAYS_REMEMBER = 90;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  theme: 'LIGHT' | 'DARK' | 'SYSTEM';
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  isSuspended: boolean;
  createdAt: Date;
}

export interface MembershipWithOrganization {
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  organization: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    createdAt: Date;
  };
}

export interface SessionContext {
  user: SessionUser;
  sessionId: string;
  memberships: MembershipWithOrganization[];
  activeOrganization: MembershipWithOrganization['organization'] | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
}

export async function createSession(
  userId: string,
  options: { remember?: boolean; userAgent?: string | null; ip?: string | null } = {},
): Promise<{ expiresAt: Date }> {
  const token = generateToken(32);
  const days = options.remember ? SESSION_TTL_DAYS_REMEMBER : SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [record] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: options.userAgent?.slice(0, 250) ?? null,
      ipHash: hashIp(options.ip),
    })
    .returning({ id: sessions.id });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${record.id}.${token}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    expires: expiresAt,
  });

  return { expiresAt };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) {
    const [sessionId] = raw.split('.');
    if (sessionId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, sessionId))
        .catch(() => undefined);
    }
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_ORG_COOKIE);
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), exceptSessionId ? eq(sessions.id, exceptSessionId) : undefined));
}

/** Charge la session courante (utilisateur, organisations, organisation active). */
export async function getSession(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const [sessionId, token] = raw.split('.');
  if (!sessionId || !token) return null;

  const [row] = await db
    .select({
      session: { id: sessions.id, tokenHash: sessions.tokenHash, expiresAt: sessions.expiresAt, lastSeenAt: sessions.lastSeenAt, revokedAt: sessions.revokedAt },
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;
  if (row.session.tokenHash !== hashToken(token)) return null;
  if (row.user.isSuspended) return null;

  const membershipRows = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      organization: organizations,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, row.user.id))
    .orderBy(organizationMembers.createdAt);

  if (Date.now() - row.session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.session.id)).catch(() => undefined);
  }

  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeMembership =
    membershipRows.find((membership) => membership.organizationId === requestedOrgId) ?? membershipRows[0] ?? null;

  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl,
      locale: row.user.locale,
      theme: row.user.theme,
      emailVerified: Boolean(row.user.emailVerifiedAt),
      isPlatformAdmin: row.user.isPlatformAdmin,
      isSuspended: row.user.isSuspended,
      createdAt: row.user.createdAt,
    },
    sessionId: row.session.id,
    memberships: membershipRows.map((membership) => ({
      organizationId: membership.organizationId,
      role: membership.role,
      organization: membership.organization,
    })),
    activeOrganization: activeMembership?.organization ?? null,
    role: activeMembership?.role ?? null,
  };
}

export async function setActiveOrganization(organizationId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function touchLastLogin(userId: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId)).catch(() => undefined);
}

/** Sessions actives d'un utilisateur (écran Sécurité des paramètres). */
export async function listActiveSessions(userId: string, currentSessionId: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sessions.lastSeenAt);
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    isCurrent: row.id === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}
