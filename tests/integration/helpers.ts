/**
 * Utilitaires partagés par les tests d'intégration.
 * Chaque test construit ses propres organisations afin de vérifier
 * l'isolation multi-tenant et de ne dépendre d'aucune donnée de seed.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  companyProfiles,
  customers,
  organizationMembers,
  organizationSettings,
  organizations,
  products,
  subscriptionPlans,
  subscriptions,
  users,
} from '@/db/schema';
import { DEFAULT_PLANS } from '@/lib/plans';
import { hashPassword } from '@/lib/auth/password';
import { newId } from '@/lib/id';

export const TEST_PASSWORD = 'MotDePasse2026!';

/** Vide toutes les tables publiques (les migrations doivent être appliquées). */
export async function resetDatabase(): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'drizzle_migrations'
  `);
  const names = tables.rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  if (names.length === 0) return;
  await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

/** Insère les formules (gratuit / pro / business) telles que définies dans le code. */
export async function seedPlans(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const plan of DEFAULT_PLANS) {
    const [row] = await db
      .insert(subscriptionPlans)
      .values({
        code: plan.code,
        name: plan.name,
        tagline: plan.tagline,
        description: plan.description,
        currency: plan.currency,
        priceMonthly: String(plan.priceMonthly),
        priceYearly: String(plan.priceYearly),
        features: plan.features,
        limits: plan.limits as unknown as Record<string, unknown>,
        isDefault: plan.isDefault,
        sortOrder: plan.sortOrder,
      })
      .onConflictDoUpdate({ target: subscriptionPlans.code, set: { limits: plan.limits as unknown as Record<string, unknown> } })
      .returning({ id: subscriptionPlans.id, code: subscriptionPlans.code });
    ids.set(row.code, row.id);
  }
  return ids;
}

let uniqueCounter = 0;

/** Suffixe unique par test (les identifiants partagent leur préfixe temporel). */
function uniqueSuffix(prefix = 'x'): string {
  uniqueCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uniqueCounter}${newId().slice(12, 20)}`;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createUser(email?: string): Promise<TestUser> {
  const targetEmail = email ?? `user-${uniqueSuffix()}@mon-devis.test`;
  const [row] = await db
    .insert(users)
    .values({
      email: targetEmail,
      name: 'Testeur MON DEVIS',
      passwordHash: await hashPassword(TEST_PASSWORD),
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id, email: users.email });
  return { id: row.id, email: row.email, password: TEST_PASSWORD };
}

export interface TestOrganization {
  id: string;
  name: string;
  userId: string;
  planCode: string;
}

/** Crée une organisation complète : membre propriétaire, réglages, société, abonnement. */
export async function createOrganization(options: {
  user: TestUser;
  planCode?: string;
  planId?: string;
  name?: string;
}): Promise<TestOrganization> {
  const name = options.name ?? `Organisation ${uniqueSuffix('o')}`;
  const [organization] = await db
    .insert(organizations)
    .values({ name, slug: `org-${uniqueSuffix()}`, ownerId: options.user.id })
    .returning({ id: organizations.id, name: organizations.name });

  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: options.user.id,
    role: 'OWNER',
  });

  await db
    .insert(organizationSettings)
    .values({ organizationId: organization.id })
    .onConflictDoNothing();

  await db.insert(companyProfiles).values({
    organizationId: organization.id,
    name: `Société ${name}`,
    email: options.user.email,
    country: "Côte d'Ivoire",
    countryCode: 'CI',
    taxId: 'CI-TEST-0001',
    isDefault: true,
  });

  const planCode = options.planCode ?? 'free';
  const planId = options.planId ?? (await seedPlans()).get(planCode);
  if (planId) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await db.insert(subscriptions).values({
      organizationId: organization.id,
      planId,
      status: 'ACTIVE',
      interval: 'MONTHLY',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
  }

  return { id: organization.id, name: organization.name, userId: options.user.id, planCode };
}

export async function createCustomerRecord(
  organizationId: string,
  overrides: Partial<typeof customers.$inferInsert> = {},
) {
  const [row] = await db
    .insert(customers)
    .values({
      organizationId,
      type: 'COMPANY',
      name: 'Awa Traoré',
      companyName: 'Client Démo SARL',
      email: `client-${uniqueSuffix('c')}@exemple.ci`,
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      countryCode: 'CI',
      ...overrides,
    })
    .returning();
  return row;
}

export async function createProductRecord(organizationId: string, overrides: Partial<typeof products.$inferInsert> = {}) {
  const [row] = await db
    .insert(products)
    .values({
      organizationId,
      name: 'Forfait conseil',
      unit: 'jour',
      unitPrice: '150000',
      taxRate: '18',
      currency: 'XOF',
      status: 'ACTIVE',
      ...overrides,
    })
    .returning();
  return row;
}

/** Jeu de lignes de devis réutilisable (quantités et remises variées). */
export function sampleItems() {
  return [
    {
      name: 'Étude de faisabilité',
      description: 'Analyse technique et budgétaire',
      unit: 'forfait',
      quantity: '1',
      unitPrice: '450000',
      discountType: 'PERCENTAGE' as const,
      discountValue: '10',
      taxRate: '18',
    },
    {
      name: "Déplacement terrain",
      description: null,
      unit: 'jour',
      quantity: '3',
      unitPrice: '75000',
      discountType: null,
      discountValue: '0',
      taxRate: '18',
    },
  ];
}
