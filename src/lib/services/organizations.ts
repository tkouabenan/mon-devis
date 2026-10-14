import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { companyProfiles, organizationMembers, organizationSettings, organizations, subscriptionPlans, subscriptions } from '@/db/schema';
import { currencyForCountry } from '@/lib/currency';
import { NotFoundError } from '@/lib/auth/guards';
import { getPlanDefinitions } from '@/lib/services/subscription';

/**
 * Service des organisations (multi-tenant).
 *
 * Une organisation regroupe des membres, un catalogue, des clients, des devis et
 * des factures. Chaque utilisateur peut appartenir à plusieurs organisations et
 * choisir celle qui est active ; toutes les requêtes métier sont filtrées par
 * `organizationId`, jamais par l'identité seule de l'utilisateur.
 */

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  const normalized = slugify(base) || 'organisation';
  let candidate = normalized;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, candidate)).limit(1);
    if (!taken) return candidate;
    attempt += 1;
    candidate = `${normalized}-${attempt}`;
    if (attempt > 25) return `${normalized}-${Date.now().toString(36)}`;
  }
}

export interface CreateOrganizationForUserOptions {
  userId: string;
  name: string;
  /** Démarre un essai gratuit de la formule Pro (30 jours). */
  withTrial?: boolean;
  countryCode?: string;
}

export interface CreatedOrganization {
  id: string;
  name: string;
  slug: string;
  planCode: string;
}

/**
 * Crée une organisation complète et atomique : organisation, adhésion du
 * propriétaire, réglages par défaut, fiche entreprise et abonnement.
 */
export async function createOrganizationForUser(options: CreateOrganizationForUserOptions): Promise<CreatedOrganization> {
  const name = options.name.trim();
  if (name.length < 2) throw new Error('Le nom de l’organisation est obligatoire.');

  const slug = await uniqueSlug(name);
  const countryCode = options.countryCode ?? 'CI';
  const currency = currencyForCountry(countryCode);

  const plans = await getPlanDefinitions();
  const freePlan = plans.find((plan) => plan.code === 'free') ?? plans[0];
  const trialPlan = plans.find((plan) => plan.code === 'pro') ?? freePlan;
  const planCode = options.withTrial ? trialPlan.code : freePlan.code;

  return db.transaction(async (tx) => {
    const [organization] = await tx.insert(organizations).values({ name, slug, ownerId: options.userId }).returning();

    await tx.insert(organizationMembers).values({ organizationId: organization.id, userId: options.userId, role: 'OWNER' });

    await tx.insert(organizationSettings).values({
      organizationId: organization.id,
      defaultCurrency: currency,
      defaultTaxRate: String(countryCode === 'CM' ? '19.25' : '18'),
      defaultValidityDays: 30,
      defaultTemplateKey: 'minimaliste',
    });

    await tx.insert(companyProfiles).values({
      organizationId: organization.id,
      name,
      isDefault: true,
      countryCode,
      country: countryCode === 'CI' ? "Côte d'Ivoire" : countryCode,
    });

    const [plan] = await tx
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.code, planCode))
      .limit(1);

    if (plan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + (options.withTrial ? 30 : 30));
      await tx.insert(subscriptions).values({
        organizationId: organization.id,
        planId: plan.id,
        status: options.withTrial ? 'TRIALING' : 'ACTIVE',
        interval: 'MONTHLY',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: options.withTrial ? periodEnd : null,
      });
    }

    return { id: organization.id, name: organization.name, slug: organization.slug, planCode };
  });
}

/** Organisations d'un utilisateur, avec son rôle et la formule en cours. */
export async function listOrganizationsForUser(userId: string) {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
      createdAt: organizations.createdAt,
      deletionRequestedAt: organizations.deletionRequestedAt,
      planName: subscriptionPlans.name,
      planCode: subscriptionPlans.code,
      subscriptionStatus: subscriptions.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.organizationId, organizations.id),
        sql`${subscriptions.status} in ('TRIALING','ACTIVE','PENDING_PAYMENT','PAST_DUE')`,
      ),
    )
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(desc(organizations.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    createdAt: row.createdAt,
    deletionRequestedAt: row.deletionRequestedAt,
    planName: row.planName ?? 'Formule gratuite',
    planCode: row.planCode ?? 'free',
    subscriptionStatus: row.subscriptionStatus ?? 'ACTIVE',
  }));
}

/** Organisation active d'un utilisateur, avec vérification d'adhésion. */
export async function getOrganizationForUser(userId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
      deletionRequestedAt: organizations.deletionRequestedAt,
    })
    .from(organizations)
    .innerJoin(
      organizationMembers,
      and(eq(organizationMembers.organizationId, organizations.id), eq(organizationMembers.userId, userId)),
    )
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!row) throw new NotFoundError('Organisation introuvable.');
  return row;
}

/** Membres d'une organisation (avec leur rôle et leur dernière connexion). */
export async function listOrganizationMembers(organizationId: string) {
  const { users } = await import('@/db/schema');
  return db
    .select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
      name: users.name,
      email: users.email,
      lastLoginAt: users.lastLoginAt,
      avatarUrl: users.avatarUrl,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(organizationMembers.createdAt);
}
