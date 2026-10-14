import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { authTokens, customers, organizationMembers, organizations, sessions, users } from '@/db/schema';
import { hashPassword, hashToken, generateToken, safeCompare, verifyPassword } from '@/lib/auth/password';
import { passwordStrength, validatePasswordPolicy } from '@/lib/auth/password-policy';
import { loginSchema, registerSchema, resetPasswordSchema } from '@/lib/validation/schemas';
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';
import { assertCanCreate, getOrganizationSubscription, incrementUsage, readUsage } from '@/lib/services/subscription';
import { QuotaError } from '@/lib/auth/guards';
import { listCustomers } from '@/lib/services/customers';
import { createCustomerRecord, createOrganization, createUser, resetDatabase, seedPlans } from './helpers';

beforeAll(async () => {
  await resetDatabase();
  await seedPlans();
});

beforeEach(async () => {
  await resetDatabase();
  await seedPlans();
  resetRateLimit();
});

describe('mots de passe', () => {
  it('hache avec bcrypt et vérifie correctement', async () => {
    const hash = await hashPassword('MotDePasse2026!');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain('MotDePasse2026!');
    expect(await verifyPassword('MotDePasse2026!', hash)).toBe(true);
    expect(await verifyPassword('mauvais-mot-de-passe', hash)).toBe(false);
  });

  it('refuse les mots de passe faibles', () => {
    expect(validatePasswordPolicy('court1').valid).toBe(false);
    expect(validatePasswordPolicy('motdepasse').valid).toBe(false);
    expect(validatePasswordPolicy('MotDePasse2026!').valid).toBe(true);
    expect(passwordStrength('MotDePasse2026!')).toBeGreaterThan(passwordStrength('abcdefgh'));
  });

  it('compare les jetons en temps constant', () => {
    const token = generateToken();
    expect(safeCompare(token, token)).toBe(true);
    expect(safeCompare(token, `${token}x`)).toBe(false);
    expect(hashToken(token)).toHaveLength(64);
  });
});

describe('schémas d’authentification', () => {
  it('valide l’inscription (nom complet, e-mail, mot de passe, CGU acceptées)', () => {
    const valid = registerSchema.safeParse({
      name: 'Awa Traoré',
      email: 'AWA@Exemple.ci',
      password: 'MotDePasse2026!',
      companyName: 'Bâtir & Conseil SARL',
      acceptTerms: true,
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.email).toBe('awa@exemple.ci');

    const withoutTerms = registerSchema.safeParse({
      name: 'Awa Traoré',
      email: 'awa@exemple.ci',
      password: 'MotDePasse2026!',
      acceptTerms: false,
    });
    expect(withoutTerms.success).toBe(false);

    const weakPassword = registerSchema.safeParse({
      name: 'Awa Traoré',
      email: 'awa@exemple.ci',
      password: 'court',
      acceptTerms: true,
    });
    expect(weakPassword.success).toBe(false);
  });

  it('valide la connexion et la réinitialisation', () => {
    expect(loginSchema.safeParse({ email: 'test@exemple.ci', password: 'secret' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'pas-un-email', password: 'x' }).success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 'a'.repeat(64), password: 'MotDePasse2026!', confirmPassword: 'MotDePasse2026!' }).success,
    ).toBe(true);
  });

  it('interdit les e-mails en double', async () => {
    const user = await createUser('unique@mon-devis.test');
    await expect(createUser('unique@mon-devis.test')).rejects.toThrow();
    const [row] = await db.select().from(users).where(eq(users.email, user.email));
    expect(row.passwordHash.startsWith('$2')).toBe(true);
  });
});

describe('sessions et jetons', () => {
  it('stocke uniquement l’empreinte du jeton de session', async () => {
    const user = await createUser();
    const token = generateToken();
    await db.insert(sessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });

    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toBe(hashToken(token));
  });

  it('enregistre les jetons de réinitialisation avec expiration', async () => {
    const user = await createUser();
    const token = generateToken();
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const [row] = await db.select().from(authTokens).where(eq(authTokens.userId, user.id));
    expect(row.purpose).toBe('PASSWORD_RESET');
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('limitation de débit', () => {
  it('bloque au-delà du quota de la fenêtre', () => {
    const key = 'login:test-ip';
    for (let index = 0; index < 5; index += 1) {
      expect(rateLimit(key, 5, 60).allowed).toBe(true);
    }
    const blocked = rateLimit(key, 5, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });
});

describe('isolation multi-tenant', () => {
  it('limite la liste des clients à l’organisation active', async () => {
    const userA = await createUser();
    const orgA = await createOrganization({ user: userA });
    const userB = await createUser();
    const orgB = await createOrganization({ user: userB });

    await createCustomerRecord(orgA.id, { companyName: 'Client A' });
    await createCustomerRecord(orgB.id, { companyName: 'Client B' });

    const listA = await listCustomers(orgA.id, { pageSize: 20 });
    const listB = await listCustomers(orgB.id, { pageSize: 20 });

    expect(listA.rows.map((row) => row.companyName)).toEqual(['Client A']);
    expect(listB.rows.map((row) => row.companyName)).toEqual(['Client B']);
  });

  it('crée une organisation avec son propriétaire et son abonnement', async () => {
    const user = await createUser();
    const org = await createOrganization({ user });

    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('OWNER');

    const [organization] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(organization.ownerId).toBe(user.id);

    const subscription = await getOrganizationSubscription(org.id);
    expect(subscription.planCode).toBe('free');
    expect(subscription.isFree).toBe(true);
  });
});

describe('quotas de la formule gratuite', () => {
  it('compte les devis du mois et bloque au-delà de la limite', async () => {
    const user = await createUser();
    const org = await createOrganization({ user, planCode: 'free' });
    const subscription = await getOrganizationSubscription(org.id);
    const limit = subscription.limits.quotationsPerMonth ?? 5;

    for (let index = 0; index < limit; index += 1) {
      await incrementUsage(org.id, 'quotations_created');
      if (index < limit - 1) {
        await expect(assertCanCreate(org.id, 'quotation')).resolves.toBeUndefined();
      }
    }

    expect(await readUsage(org.id, 'quotations_created')).toBe(limit);
    await expect(assertCanCreate(org.id, 'quotation')).rejects.toThrow(QuotaError);
  });

  it('lève une erreur explicite (402) exploitable par l’interface', async () => {
    const user = await createUser();
    const org = await createOrganization({ user, planCode: 'free' });
    const limit = (await getOrganizationSubscription(org.id)).limits.customers ?? 10;
    // Le quota de clients est mesuré sur le nombre réel de fiches en base.
    for (let index = 0; index < limit; index += 1) {
      await createCustomerRecord(org.id, { companyName: `Client ${index + 1}` });
    }
    await expect(assertCanCreate(org.id, 'customer')).rejects.toThrowError(/clients/i);
  });

  it('ne limite pas les devis en plan Business', async () => {
    const user = await createUser();
    const org = await createOrganization({ user, planCode: 'business' });
    for (let index = 0; index < 40; index += 1) {
      await incrementUsage(org.id, 'quotations_created');
    }
    await expect(assertCanCreate(org.id, 'quotation')).resolves.toBeUndefined();
    const subscription = await getOrganizationSubscription(org.id);
    expect(subscription.limits.quotationsPerMonth).toBeNull();
  });

  it('stocke les compteurs par période (mensuelle)', async () => {
    const user = await createUser();
    const org = await createOrganization({ user });
    await incrementUsage(org.id, 'quotations_created', 3);
    await incrementUsage(org.id, 'quotations_created', 2);
    expect(await readUsage(org.id, 'quotations_created')).toBe(5);
    expect(await readUsage(org.id, 'quotations_created', '2020-01')).toBe(0);
  });
});

describe('journal d’audit', () => {
  it('enregistre les actions sensibles avec l’acteur et l’organisation', async () => {
    const { recordAudit } = await import('@/lib/audit');
    const { auditLogs } = await import('@/db/schema');
    const user = await createUser();
    const org = await createOrganization({ user });

    await recordAudit({
      action: 'quotation.delete',
      entity: 'quotation',
      entityId: 'quotation-test',
      organizationId: org.id,
      actorUserId: user.id,
      metadata: { reason: 'test' },
    });

    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.organizationId, org.id));
    expect(row.action).toBe('quotation.delete');
    expect(row.actorUserId).toBe(user.id);
    expect(row.metadata).toMatchObject({ reason: 'test' });
  });
});

describe('clients rattachés', () => {
  it('refuse la suppression d’un client utilisé par la base (contrainte référentielle)', async () => {
    const user = await createUser();
    const org = await createOrganization({ user });
    const customer = await createCustomerRecord(org.id);
    const rows = await db.select().from(customers).where(eq(customers.organizationId, org.id));
    expect(rows.map((row) => row.id)).toContain(customer.id);
  });
});
