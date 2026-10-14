import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { customers, quotations } from '@/db/schema';
import type { CustomerInput } from '@/lib/validation/schemas';

/**
 * Service Clients (CRM léger) : liste, fiche détaillée, agrégats par devise.
 * Aucun total n'est additionné entre deux devises différentes.
 */

export interface CustomerFilters {
  search?: string;
  archived?: boolean;
  sort?: 'recent' | 'name' | 'value';
  page?: number;
  pageSize?: number;
}

export interface CustomerCurrencyTotal {
  currency: string;
  count: number;
  amount: number;
  accepted: number;
}

export interface CustomerWithStats {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string;
  taxId: string | null;
  isArchived: boolean;
  createdAt: Date;
  quotationCount: number;
  acceptedCount: number;
  lastQuotationAt: Date | null;
  totals: CustomerCurrencyTotal[];
}

export async function listCustomers(organizationId: string, filters: CustomerFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 200);

  const conditions = [eq(customers.organizationId, organizationId)];
  if (filters.archived === true) conditions.push(eq(customers.isArchived, true));
  if (filters.archived === false) conditions.push(eq(customers.isArchived, false));
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(${customers.name}) like ${term}
        or lower(coalesce(${customers.companyName}, '')) like ${term}
        or lower(coalesce(${customers.email}, '')) like ${term}
        or lower(coalesce(${customers.city}, '')) like ${term}
        or lower(coalesce(${customers.phone}, '')) like ${term})`,
    );
  }
  const where = and(...conditions);

  const orderBy = filters.sort === 'name' ? asc(customers.name) : desc(customers.createdAt);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);

  const ids = rows.map((row) => row.id);
  const stats = ids.length > 0 ? await customerAggregates(organizationId, ids) : new Map<string, CustomerStatsRow>();

  let list: CustomerWithStats[] = rows.map((row) => {
    const entry = stats.get(row.id);
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      companyName: row.companyName,
      email: row.email,
      phone: row.phone,
      city: row.city,
      country: row.country,
      taxId: row.taxId,
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      quotationCount: entry?.quotationCount ?? 0,
      acceptedCount: entry?.acceptedCount ?? 0,
      lastQuotationAt: entry?.lastQuotationAt ?? null,
      totals: entry?.totals ?? [],
    };
  });

  if (filters.sort === 'value') {
    list = list.sort((a, b) => totalOf(b) - totalOf(a));
  }

  const total = Number(countRows[0]?.value ?? 0);
  return { rows: list, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

function totalOf(customer: CustomerWithStats): number {
  return customer.totals.reduce((sum, entry) => sum + entry.amount, 0);
}

interface CustomerStatsRow {
  quotationCount: number;
  acceptedCount: number;
  lastQuotationAt: Date | null;
  totals: CustomerCurrencyTotal[];
}

async function customerAggregates(organizationId: string, ids: string[]): Promise<Map<string, CustomerStatsRow>> {
  const result = await db.execute<{
    customer_id: string;
    currency: string;
    count: string;
    amount: string;
    accepted: string;
    last_issue: Date | null;
  }>(sql`
    select customer_id,
           currency,
           count(*)::int as count,
           coalesce(sum(total), 0)::text as amount,
           coalesce(sum(total) filter (where status = 'ACCEPTED'), 0)::text as accepted,
           max(issue_date) as last_issue
    from quotations
    where organization_id = ${organizationId}
      and deleted_at is null
      and customer_id in ${sql.raw(`(${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})`)}
    group by customer_id, currency
    order by currency
  `);

  const map = new Map<string, CustomerStatsRow>();
  for (const row of result.rows) {
    const entry = map.get(row.customer_id) ?? { quotationCount: 0, acceptedCount: 0, lastQuotationAt: null, totals: [] };
    entry.quotationCount += Number(row.count);
    entry.totals.push({
      currency: row.currency,
      count: Number(row.count),
      amount: Number(row.amount),
      accepted: Number(row.accepted),
    });
    if (row.last_issue && (!entry.lastQuotationAt || new Date(row.last_issue) > entry.lastQuotationAt)) {
      entry.lastQuotationAt = new Date(row.last_issue);
    }
    map.set(row.customer_id, entry);
  }

  // Nombre de devis acceptés (toutes devises confondues : c'est un comptage, pas un montant).
  const acceptedCounts = await db.execute<{ customer_id: string; accepted: string }>(sql`
    select customer_id, count(*)::int as accepted
    from quotations
    where organization_id = ${organizationId}
      and deleted_at is null
      and status = 'ACCEPTED'
      and customer_id in ${sql.raw(`(${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})`)}
    group by customer_id
  `);
  for (const row of acceptedCounts.rows) {
    const entry = map.get(row.customer_id);
    if (entry) entry.acceptedCount = Number(row.accepted);
  }

  return map;
}

/** Fiche client : coordonnées, statistiques par devise et historique des devis. */
export async function getCustomerDetail(organizationId: string, customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)))
    .limit(1);

  if (!customer) return null;

  const history = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      title: quotations.title,
      status: quotations.status,
      currency: quotations.currency,
      total: quotations.total,
      issueDate: quotations.issueDate,
      validUntil: quotations.validUntil,
      decidedAt: quotations.decidedAt,
    })
    .from(quotations)
    .where(and(eq(quotations.organizationId, organizationId), eq(quotations.customerId, customerId), isNull(quotations.deletedAt)))
    .orderBy(desc(quotations.issueDate))
    .limit(50);

  const totalsByCurrency = new Map<string, CustomerCurrencyTotal>();
  for (const row of history) {
    const entry = totalsByCurrency.get(row.currency) ?? { currency: row.currency, count: 0, amount: 0, accepted: 0 };
    entry.count += 1;
    entry.amount += Number(row.total);
    if (row.status === 'ACCEPTED') entry.accepted += Number(row.total);
    totalsByCurrency.set(row.currency, entry);
  }

  const acceptedCount = history.filter((row) => row.status === 'ACCEPTED').length;
  const decidedCount = history.filter((row) => ['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(row.status)).length;

  return {
    customer,
    history,
    totals: [...totalsByCurrency.values()].sort((a, b) => b.amount - a.amount),
    acceptedCount,
    acceptanceRate: decidedCount === 0 ? null : Math.round((acceptedCount / decidedCount) * 1000) / 10,
  };
}

/** Création / mise à jour d'un client (utilisé par les actions serveur). */
export function customerValues(input: CustomerInput) {
  return {
    type: input.type ?? 'COMPANY',
    name: input.name,
    companyName: input.companyName ?? null,
    email: input.email || null,
    phone: input.phone ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    postalCode: input.postalCode ?? null,
    city: input.city ?? null,
    country: input.country ?? "Côte d'Ivoire",
    countryCode: (input.countryCode ?? 'CI').toUpperCase().slice(0, 8),
    taxId: input.taxId ?? null,
    notes: input.notes ?? null,
  };
}

/** Colonnes exportées en CSV (mêmes libellés que la page Clients). */
export const CUSTOMER_CSV_COLUMNS = [
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Contact' },
  { key: 'companyName', label: 'Société' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'addressLine1', label: 'Adresse' },
  { key: 'postalCode', label: 'Code postal' },
  { key: 'city', label: 'Ville' },
  { key: 'country', label: 'Pays' },
  { key: 'taxId', label: 'Numéro fiscal' },
  { key: 'notes', label: 'Notes' },
] as const;

export function customerToCsvRow(customer: typeof customers.$inferSelect): Record<string, string> {
  return {
    type: customer.type === 'COMPANY' ? 'Entreprise' : 'Particulier',
    name: customer.name,
    companyName: customer.companyName ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    addressLine1: customer.addressLine1 ?? '',
    postalCode: customer.postalCode ?? '',
    city: customer.city ?? '',
    country: customer.country,
    taxId: customer.taxId ?? '',
    notes: customer.notes ?? '',
  };
}
