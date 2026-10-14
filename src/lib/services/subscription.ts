import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  customers,
  invoices,
  organizationMembers,
  companyProfiles,
  products,
  subscriptionPlans,
  subscriptions,
  usageCounters,
} from '@/db/schema';
import { DEFAULT_PLANS, limitsForPlan, QUOTA_MESSAGES, type PlanLimits } from '@/lib/plans';
import { QuotaError } from '@/lib/auth/guards';

/**
 * Abonnements et quotas.
 * L'abonnement réel est lu en base ; si l'organisation n'en possède aucun,
 * elle est traitée comme étant sur le plan gratuit (repli sûr).
 */

export interface OrganizationSubscription {
  id: string | null;
  planCode: string;
  planName: string;
  status: string;
  interval: 'MONTHLY' | 'YEARLY';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  limits: PlanLimits;
  isFree: boolean;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function getPlanDefinitions() {
  const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
  if (plans.length > 0) return plans;
  return DEFAULT_PLANS.map((plan, index) => ({
    id: `virtual-${plan.code}`,
    code: plan.code,
    name: plan.name,
    tagline: plan.tagline,
    description: plan.description,
    currency: plan.currency,
    priceMonthly: String(plan.priceMonthly),
    priceYearly: String(plan.priceYearly),
    yearlyDiscountPercent: '0',
    features: plan.features as unknown as string[],
    limits: plan.limits as unknown as Record<string, unknown>,
    isActive: true,
    isPublic: true,
    isDefault: plan.isDefault,
    sortOrder: plan.sortOrder ?? index,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

export async function getOrganizationSubscription(organizationId: string): Promise<OrganizationSubscription> {
  const rows = await db
    .select({
      subscription: subscriptions,
      plan: subscriptionPlans,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(and(eq(subscriptions.organizationId, organizationId), sql`${subscriptions.status} in ('TRIALING','ACTIVE','PENDING_PAYMENT','PAST_DUE')`))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);

  const row = rows[0];
  if (row) {
    return {
      id: row.subscription.id,
      planCode: row.plan.code,
      planName: row.plan.name,
      status: row.subscription.status,
      interval: row.subscription.interval,
      currentPeriodStart: row.subscription.currentPeriodStart,
      currentPeriodEnd: row.subscription.currentPeriodEnd,
      cancelAtPeriodEnd: row.subscription.cancelAtPeriodEnd,
      trialEndsAt: row.subscription.trialEndsAt,
      limits: normalizeLimits(row.plan.limits, row.plan.code),
      isFree: Number(row.plan.priceMonthly) === 0 && row.plan.code === 'free',
      priceMonthly: Number(row.plan.priceMonthly),
      priceYearly: Number(row.plan.priceYearly),
      currency: row.plan.currency,
    };
  }

  const fallback = DEFAULT_PLANS.find((plan) => plan.isDefault) ?? DEFAULT_PLANS[0];
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 10);
  return {
    id: null,
    planCode: fallback.code,
    planName: fallback.name,
    status: 'ACTIVE',
    interval: 'MONTHLY',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    limits: fallback.limits,
    isFree: true,
    priceMonthly: fallback.priceMonthly,
    priceYearly: fallback.priceYearly,
    currency: fallback.currency,
  };
}

function normalizeLimits(raw: unknown, planCode: string): PlanLimits {
  const fallback = limitsForPlan(planCode);
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<PlanLimits> & { exports?: Partial<PlanLimits['exports']> };
  return {
    quotationsPerMonth: value.quotationsPerMonth === undefined ? fallback.quotationsPerMonth : value.quotationsPerMonth,
    invoicesPerMonth: value.invoicesPerMonth === undefined ? fallback.invoicesPerMonth : value.invoicesPerMonth,
    customers: value.customers === undefined ? fallback.customers : value.customers,
    products: value.products === undefined ? fallback.products : value.products,
    members: value.members === undefined ? fallback.members : value.members,
    companies: value.companies === undefined ? fallback.companies : value.companies,
    exports: { ...fallback.exports, ...(value.exports ?? {}) },
    customBranding: value.customBranding ?? fallback.customBranding,
    customTemplates: value.customTemplates ?? fallback.customTemplates,
    advancedAnalytics: value.advancedAnalytics ?? fallback.advancedAnalytics,
    advancedReporting: value.advancedReporting ?? fallback.advancedReporting,
    shareLinks: value.shareLinks ?? fallback.shareLinks,
    emailSharing: value.emailSharing ?? fallback.emailSharing,
    prioritySupport: value.prioritySupport ?? fallback.prioritySupport,
  };
}

// ---------------------------------------------------------------------------
// Compteurs d'usage
// ---------------------------------------------------------------------------

export async function readUsage(organizationId: string, metric: string, period = currentPeriod()): Promise<number> {
  const [row] = await db
    .select({ value: usageCounters.value })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.organizationId, organizationId),
        eq(usageCounters.metric, metric),
        eq(usageCounters.period, period),
      ),
    )
    .limit(1);
  return row?.value ?? 0;
}

export async function incrementUsage(organizationId: string, metric: string, amount = 1, period = currentPeriod()): Promise<number> {
  const [row] = await db
    .insert(usageCounters)
    .values({ organizationId, metric, period, value: amount })
    .onConflictDoUpdate({
      target: [usageCounters.organizationId, usageCounters.metric, usageCounters.period],
      set: { value: sql`${usageCounters.value} + ${amount}`, updatedAt: new Date() },
    })
    .returning({ value: usageCounters.value });
  return row?.value ?? amount;
}

export async function setUsage(organizationId: string, metric: string, value: number, period = currentPeriod()): Promise<void> {
  await db
    .insert(usageCounters)
    .values({ organizationId, metric, period, value })
    .onConflictDoUpdate({
      target: [usageCounters.organizationId, usageCounters.metric, usageCounters.period],
      set: { value, updatedAt: new Date() },
    });
}

export interface UsageOverview {
  plan: OrganizationSubscription;
  quotationsThisMonth: number;
  invoicesThisMonth: number;
  customers: number;
  products: number;
  members: number;
  companies: number;
}

export async function getUsageOverview(organizationId: string): Promise<UsageOverview> {
  const [plan, quotationsThisMonth, invoicesThisMonth, customerRows, productRows, memberRows, companyRows] = await Promise.all([
    getOrganizationSubscription(organizationId),
    readUsage(organizationId, 'quotations_created'),
    readUsage(organizationId, 'invoices_created'),
    db.select({ value: count() }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.isArchived, false))),
    db.select({ value: count() }).from(products).where(and(eq(products.organizationId, organizationId), eq(products.status, 'ACTIVE'))),
    db.select({ value: count() }).from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId)),
    db.select({ value: count() }).from(companyProfiles).where(eq(companyProfiles.organizationId, organizationId)),
  ]);

  return {
    plan,
    quotationsThisMonth,
    invoicesThisMonth,
    customers: Number(customerRows[0]?.value ?? 0),
    products: Number(productRows[0]?.value ?? 0),
    members: Number(memberRows[0]?.value ?? 0),
    companies: Number(companyRows[0]?.value ?? 0),
  };
}

/**
 * Vérifie qu'une création est autorisée par le plan, sinon lève `QuotaError`
 * (converti en réponse HTTP 402 + message d'upgrade).
 */
export async function assertCanCreate(
  organizationId: string,
  metric: 'quotation' | 'invoice' | 'customer' | 'product' | 'member' | 'company',
): Promise<void> {
  const overview = await getUsageOverview(organizationId);
  const limits = overview.plan.limits;

  switch (metric) {
    case 'quotation': {
      const limit = limits.quotationsPerMonth;
      if (limit !== null && overview.quotationsThisMonth >= limit) {
        throw new QuotaError(QUOTA_MESSAGES.quotations(limit), {
          metric: 'quotations',
          used: overview.quotationsThisMonth,
          limit,
        });
      }
      break;
    }
    case 'invoice': {
      const limit = limits.invoicesPerMonth;
      if (limit !== null && overview.invoicesThisMonth >= limit) {
        throw new QuotaError(QUOTA_MESSAGES.invoices(limit), {
          metric: 'invoices',
          used: overview.invoicesThisMonth,
          limit,
        });
      }
      break;
    }
    case 'customer': {
      const limit = limits.customers;
      if (limit !== null && overview.customers >= limit) {
        throw new QuotaError(QUOTA_MESSAGES.customers(limit), { metric: 'customers', used: overview.customers, limit });
      }
      break;
    }
    case 'product': {
      const limit = limits.products;
      if (limit !== null && overview.products >= limit) {
        throw new QuotaError(QUOTA_MESSAGES.products(limit), { metric: 'products', used: overview.products, limit });
      }
      break;
    }
    case 'member': {
      const limit = limits.members;
      if (limit !== null && overview.members >= limit) {
        throw new QuotaError(QUOTA_MESSAGES.members(limit), { metric: 'members', used: overview.members, limit });
      }
      break;
    }
    case 'company': {
      const limit = limits.companies;
      if (limit !== null && overview.companies >= limit) {
        throw new QuotaError(QUOTA_MESSAGES.companies(limit), { metric: 'companies', used: overview.companies, limit });
      }
      break;
    }
  }
}

/** Contrôle d'accès à une fonctionnalité (export, partage, branding…). */
export async function assertFeature(
  organizationId: string,
  feature: 'docx' | 'xlsx' | 'shareLinks' | 'advancedAnalytics' | 'advancedReporting' | 'customBranding' | 'customTemplates',
): Promise<void> {
  const { limits } = await getOrganizationSubscription(organizationId);
  switch (feature) {
    case 'docx':
      if (!limits.exports.docx) throw new QuotaError(QUOTA_MESSAGES.docx, { feature });
      break;
    case 'xlsx':
      if (!limits.exports.xlsx) throw new QuotaError(QUOTA_MESSAGES.xlsx, { feature });
      break;
    case 'shareLinks':
      if (!limits.shareLinks) throw new QuotaError(QUOTA_MESSAGES.sharing, { feature });
      break;
    case 'advancedAnalytics':
      if (!limits.advancedAnalytics) throw new QuotaError(QUOTA_MESSAGES.analytics, { feature });
      break;
    case 'advancedReporting':
      if (!limits.advancedReporting) throw new QuotaError(QUOTA_MESSAGES.reporting, { feature });
      break;
    case 'customBranding':
      if (!limits.customBranding) throw new QuotaError('La personnalisation de votre image est disponible à partir du plan Pro.', { feature });
      break;
    case 'customTemplates':
      if (!limits.customTemplates) throw new QuotaError(QUOTA_MESSAGES.template, { feature });
      break;
  }
}

export { currentPeriod };
