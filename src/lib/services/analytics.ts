import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import type { QuotationStatus } from '@/db/schema';

/**
 * Statistiques du tableau de bord.
 *
 * Règle absolue : aucun total n'est jamais additionné d'une devise à l'autre.
 * Les agrégats sont calculés devise par devise, puis présentés pour la devise
 * sélectionnée. Les autres devises sont signalées séparément.
 */

export type PeriodPreset = '7d' | '30d' | '90d' | '12m' | 'year' | 'custom';

export interface AnalyticsPeriod {
  preset: PeriodPreset;
  label: string;
  from: Date;
  to: Date;
  previous: { from: Date; to: Date };
  /** Nombre de jours couverts (pour les libellés et les graphiques). */
  days: number;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '90 derniers jours' },
  { value: '12m', label: '12 derniers mois' },
  { value: 'year', label: 'Année en cours' },
  { value: 'custom', label: 'Période personnalisée' },
];

/**
 * Détermine la période courante et la période de comparaison
 * (même durée, immédiatement précédente).
 */
export function resolvePeriod(preset: PeriodPreset = '30d', fromParam?: string | null, toParam?: string | null): AnalyticsPeriod {
  const now = new Date();

  if (preset === 'custom' && fromParam && toParam) {
    const from = startOfDay(new Date(fromParam));
    const to = endOfDay(new Date(toParam));
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY) + 1);
      const previousTo = new Date(from.getTime() - 1);
      const previousFrom = new Date(previousTo.getTime() - (days - 1) * DAY);
      return {
        preset,
        label: `Du ${from.toLocaleDateString('fr-FR')} au ${to.toLocaleDateString('fr-FR')}`,
        from,
        to,
        previous: { from: startOfDay(previousFrom), to: endOfDay(previousTo) },
        days,
      };
    }
    // Paramètres invalides : on retombe sur 30 jours.
    preset = '30d';
  }

  if (preset === '7d' || preset === '30d' || preset === '90d') {
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    const to = endOfDay(now);
    const from = startOfDay(new Date(to.getTime() - (days - 1) * DAY));
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(startOfDay(previousTo).getTime() - (days - 1) * DAY);
    const label = PERIOD_PRESETS.find((item) => item.value === preset)?.label ?? 'Période';
    return { preset, label, from, to, previous: { from: previousFrom, to: endOfDay(previousTo) }, days };
  }

  if (preset === 'year') {
    const from = startOfMonth(new Date(now.getFullYear(), 0, 1));
    const to = endOfDay(now);
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = startOfMonth(new Date(now.getFullYear() - 1, 0, 1));
    return {
      preset,
      label: `Année ${now.getFullYear()}`,
      from,
      to,
      previous: { from: previousFrom, to: endOfDay(previousTo) },
      days: Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY) + 1),
    };
  }

  // 12 mois glissants (par défaut du menu).
  const from = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const to = endOfDay(now);
  const previousFrom = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 23, 1));
  const previousTo = endOfDay(new Date(from.getTime() - 1));
  return {
    preset: '12m',
    label: '12 derniers mois',
    from,
    to,
    previous: { from: previousFrom, to: previousTo },
    days: Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY) + 1),
  };
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface CurrencyTotals {
  currency: string;
  count: number;
  amount: string;
  acceptedCount: number;
  acceptedAmount: string;
}

export interface KpiValue {
  value: number;
  previous: number;
  /** Variation en pourcentage (null si la période précédente est à zéro). */
  change: number | null;
}

export interface DashboardData {
  currency: string;
  availableCurrencies: CurrencyTotals[];
  hasOtherCurrencies: boolean;
  quotationCount: KpiValue;
  totalAmount: KpiValue;
  acceptedCount: KpiValue;
  acceptedAmount: KpiValue;
  acceptanceRate: KpiValue;
  extra: {
    draft: number;
    sent: number;
    pending: number;
    expired: number;
    rejected: number;
    averageValue: number;
    averageValuePrevious: number;
    activeCustomers: number;
  };
  statusBreakdown: { status: QuotationStatus; label: string; count: number; amount: number }[];
  monthly: { key: string; label: string; count: number; amount: number; accepted: number }[];
  funnel: { stage: string; label: string; count: number }[];
  topCustomers: { id: string | null; name: string; count: number; amount: number; accepted: number }[];
}

interface StatusRow {
  [key: string]: unknown;
  status: QuotationStatus;
  count: string;
  amount: string | null;
}

interface MonthRow {
  [key: string]: unknown;
  month: string;
  count: string;
  amount: string | null;
  accepted: string | null;
}

interface CustomerRow {
  [key: string]: unknown;
  id: string | null;
  name: string | null;
  count: string;
  amount: string | null;
  accepted: string | null;
}

interface CurrencyRow {
  [key: string]: unknown;
  currency: string;
  count: string;
  amount: string | null;
  accepted_count: string;
  accepted_amount: string | null;
}

const STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Brouillons',
  SENT: 'Envoyés',
  PENDING: 'En attente',
  ACCEPTED: 'Acceptés',
  REJECTED: 'Refusés',
  EXPIRED: 'Expirés',
  CANCELLED: 'Annulés',
};

function kpi(value: number, previous: number): KpiValue {
  if (previous === 0) {
    return { value, previous, change: value === 0 ? 0 : null };
  }
  return { value, previous, change: Math.round(((value - previous) / previous) * 1000) / 10 };
}

/**
 * Agrège l'activité « devis » d'une organisation pour une période donnée.
 * Toutes les requêtes sont filtrées par organizationId (cloisonnement strict).
 */
export async function getDashboardData(
  organizationId: string,
  period: AnalyticsPeriod,
  currency: string,
): Promise<DashboardData> {
  const [currencyRows, currentStatus, previousStatus, monthlyRows, topCustomerRows, counters] = await Promise.all([
    // Répartition par devise : détecte les devis libellés dans une autre devise.
    db.execute<CurrencyRow>(sql`
      select currency,
             count(*)::int as count,
             coalesce(sum(total), 0)::text as amount,
             count(*) filter (where status = 'ACCEPTED')::int as accepted_count,
             coalesce(sum(total) filter (where status = 'ACCEPTED'), 0)::text as accepted_amount
      from quotations
      where organization_id = ${organizationId}
        and deleted_at is null
        and issue_date >= ${period.from}
        and issue_date <= ${period.to}
      group by currency
      order by count(*) desc
    `),
    db.execute<StatusRow>(sql`
      select status, count(*)::int as count, coalesce(sum(total), 0)::text as amount
      from quotations
      where organization_id = ${organizationId}
        and deleted_at is null
        and currency = ${currency}
        and issue_date >= ${period.from}
        and issue_date <= ${period.to}
      group by status
    `),
    db.execute<StatusRow>(sql`
      select status, count(*)::int as count, coalesce(sum(total), 0)::text as amount
      from quotations
      where organization_id = ${organizationId}
        and deleted_at is null
        and currency = ${currency}
        and issue_date >= ${period.previous.from}
        and issue_date <= ${period.previous.to}
      group by status
    `),
    db.execute<MonthRow>(sql`
      select to_char(date_trunc('month', issue_date), 'YYYY-MM') as month,
             count(*)::int as count,
             coalesce(sum(total), 0)::text as amount,
             coalesce(sum(total) filter (where status = 'ACCEPTED'), 0)::text as accepted
      from quotations
      where organization_id = ${organizationId}
        and deleted_at is null
        and currency = ${currency}
        and issue_date >= ${period.from}
        and issue_date <= ${period.to}
      group by 1
      order by 1
    `),
    db.execute<CustomerRow>(sql`
      select customer_id as id,
             max(coalesce(customer_snapshot ->> 'companyName', customer_snapshot ->> 'name')) as name,
             count(*)::int as count,
             coalesce(sum(total), 0)::text as amount,
             coalesce(sum(total) filter (where status = 'ACCEPTED'), 0)::text as accepted
      from quotations
      where organization_id = ${organizationId}
        and deleted_at is null
        and currency = ${currency}
        and issue_date >= ${period.from}
        and issue_date <= ${period.to}
      group by customer_id
      order by coalesce(sum(total), 0) desc
      limit 5
    `),
    db.execute<{
      drafts: string;
      sent: string;
      pending: string;
      expired: string;
      customers: string;
      products: string;
    }>(sql`
      select
        (select count(*)::int from quotations where organization_id = ${organizationId} and deleted_at is null and status = 'DRAFT' and currency = ${currency}) as drafts,
        (select count(*)::int from quotations where organization_id = ${organizationId} and deleted_at is null and status = 'SENT' and currency = ${currency}) as sent,
        (select count(*)::int from quotations where organization_id = ${organizationId} and deleted_at is null and status = 'PENDING' and currency = ${currency}) as pending,
        (select count(*)::int from quotations where organization_id = ${organizationId} and deleted_at is null and status = 'EXPIRED' and currency = ${currency}) as expired,
        (select count(*)::int from customers where organization_id = ${organizationId} and is_archived = false) as customers,
        (select count(*)::int from products where organization_id = ${organizationId} and status = 'ACTIVE') as products
    `),
  ]);

  const sum = (rows: StatusRow[], statuses: QuotationStatus[]) =>
    rows
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + Number(row.amount ?? 0), 0);

  const count = (rows: StatusRow[], statuses: QuotationStatus[]) =>
    rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + Number(row.count), 0);

  const currentAmount = sum(currentStatus.rows, ['DRAFT', 'SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
  const previousAmount = sum(previousStatus.rows, ['DRAFT', 'SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
  const currentCount = count(currentStatus.rows, ['DRAFT', 'SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
  const previousCount = count(previousStatus.rows, ['DRAFT', 'SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
  const currentAccepted = count(currentStatus.rows, ['ACCEPTED']);
  const previousAccepted = count(previousStatus.rows, ['ACCEPTED']);
  const currentAcceptedAmount = sum(currentStatus.rows, ['ACCEPTED']);
  const previousAcceptedAmount = sum(previousStatus.rows, ['ACCEPTED']);

  // Taux d'acceptation : acceptés / (acceptés + refusés + expirés) — les devis
  // encore ouverts ne pénalisent pas le taux.
  const decidedCurrent = count(currentStatus.rows, ['ACCEPTED', 'REJECTED', 'EXPIRED']);
  const decidedPrevious = count(previousStatus.rows, ['ACCEPTED', 'REJECTED', 'EXPIRED']);
  const rateCurrent = decidedCurrent === 0 ? 0 : Math.round((currentAccepted / decidedCurrent) * 1000) / 10;
  const ratePrevious = decidedPrevious === 0 ? 0 : Math.round((previousAccepted / decidedPrevious) * 1000) / 10;

  const availableCurrencies: CurrencyTotals[] = currencyRows.rows.map((row) => ({
    currency: row.currency,
    count: Number(row.count),
    amount: row.amount ?? '0',
    acceptedCount: Number(row.accepted_count),
    acceptedAmount: row.accepted_amount ?? '0',
  }));

  const statusBreakdown = (['DRAFT', 'SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as QuotationStatus[]).map(
    (status) => {
      const row = currentStatus.rows.find((entry) => entry.status === status);
      return {
        status,
        label: STATUS_LABELS[status],
        count: Number(row?.count ?? 0),
        amount: Number(row?.amount ?? 0),
      };
    },
  );

  const months = new Map(monthlyRows.rows.map((row) => [row.month, row]));
  const monthly = buildMonthSeries(period).map((entry) => {
    const row = months.get(entry.key);
    return {
      ...entry,
      count: Number(row?.count ?? 0),
      amount: Number(row?.amount ?? 0),
      accepted: Number(row?.accepted ?? 0),
    };
  });

  const countersRow = counters.rows[0];
  const funnel = [
    { stage: 'created', label: 'Créés', count: currentCount },
    { stage: 'sent', label: 'Envoyés', count: count(currentStatus.rows, ['SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']) },
    { stage: 'pending', label: 'En attente de décision', count: count(currentStatus.rows, ['PENDING']) + count(currentStatus.rows, ['SENT']) },
    { stage: 'accepted', label: 'Acceptés', count: currentAccepted },
  ];

  return {
    currency,
    availableCurrencies,
    hasOtherCurrencies: availableCurrencies.some((entry) => entry.currency !== currency && entry.count > 0),
    quotationCount: kpi(currentCount, previousCount),
    totalAmount: kpi(currentAmount, previousAmount),
    acceptedCount: kpi(currentAccepted, previousAccepted),
    acceptedAmount: kpi(currentAcceptedAmount, previousAcceptedAmount),
    acceptanceRate: kpi(rateCurrent, ratePrevious),
    extra: {
      draft: Number(countersRow?.drafts ?? 0),
      sent: Number(countersRow?.sent ?? 0),
      pending: Number(countersRow?.pending ?? 0),
      expired: Number(countersRow?.expired ?? 0),
      rejected: count(currentStatus.rows, ['REJECTED']),
      averageValue: currentCount === 0 ? 0 : Math.round(currentAmount / currentCount),
      averageValuePrevious: previousCount === 0 ? 0 : Math.round(previousAmount / previousCount),
      activeCustomers: Number(countersRow?.customers ?? 0),
    },
    statusBreakdown,
    monthly,
    funnel,
    topCustomers: topCustomerRows.rows.map((row) => ({
      id: row.id,
      name: row.name ?? 'Client supprimé',
      count: Number(row.count),
      amount: Number(row.amount ?? 0),
      accepted: Number(row.accepted ?? 0),
    })),
  };
}

/** Série de mois (libellés français) couvrant la période sélectionnée. */
function buildMonthSeries(period: AnalyticsPeriod): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
  const last = new Date(period.to.getFullYear(), period.to.getMonth(), 1);

  while (cursor <= last && months.length < 24) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: cursor.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', ''),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/** Devises effectivement utilisées par l'organisation (pour le sélecteur). */
export async function listOrganizationCurrencies(organizationId: string): Promise<string[]> {
  const result = await db.execute<{ currency: string }>(sql`
    select distinct currency from quotations where organization_id = ${organizationId}
    union
    select default_currency from organization_settings where organization_id = ${organizationId}
    order by 1
  `);
  const currencies = result.rows.map((row) => row.currency).filter(Boolean);
  return currencies.length > 0 ? currencies : [DEFAULT_CURRENCY];
}
