import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { products } from '@/db/schema';
import type { ProductInput } from '@/lib/validation/schemas';

/**
 * Service Produits & Services : catalogue réutilisable dans les devis,
 * avec import / export CSV.
 */

export interface ProductFilters {
  search?: string;
  category?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  currency?: string;
  sort?: 'recent' | 'name' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
}

export async function listProducts(organizationId: string, filters: ProductFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 200);

  const conditions = [eq(products.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(products.status, filters.status));
  if (filters.category) conditions.push(eq(products.category, filters.category));
  if (filters.currency) conditions.push(eq(products.currency, filters.currency));
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(ilike(products.name, term), ilike(sql`coalesce(${products.code}, '')`, term), ilike(sql`coalesce(${products.category}, '')`, term))!,
    );
  }
  const where = and(...conditions);

  const orderBy = (() => {
    switch (filters.sort) {
      case 'name':
        return [asc(products.name)];
      case 'price_asc':
        return [asc(products.unitPrice)];
      case 'price_desc':
        return [desc(products.unitPrice)];
      default:
        return [desc(products.createdAt)];
    }
  })();

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)::int` }).from(products).where(where),
  ]);

  const total = Number(countRows[0]?.value ?? 0);
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Catégories distinctes utilisées par l'organisation (filtres et suggestions). */
export async function listProductCategories(organizationId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), sql`${products.category} is not null`))
    .orderBy(asc(products.category));
  return rows.map((row) => row.category).filter((value): value is string => Boolean(value));
}

/** Recherche rapide utilisée par l'éditeur de devis (catalogue). */
export async function searchProducts(organizationId: string, term: string, limit = 20) {
  const conditions = [eq(products.organizationId, organizationId), eq(products.status, 'ACTIVE')];
  if (term.trim()) {
    const like = `%${term.trim()}%`;
    conditions.push(
      or(ilike(products.name, like), ilike(sql`coalesce(${products.code}, '')`, like), ilike(sql`coalesce(${products.category}, '')`, like))!,
    );
  }
  return db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.name))
    .limit(limit);
}

export function productValues(input: ProductInput) {
  return {
    name: input.name,
    code: input.code?.trim() ? input.code.trim() : null,
    description: input.description ?? null,
    category: input.category ?? null,
    unit: input.unit || 'unité',
    unitPrice: String(input.unitPrice),
    taxRate: String(input.taxRate ?? 0),
    currency: input.currency ?? 'XOF',
    status: input.status ?? 'ACTIVE',
  };
}

/* -------------------------------------------------------------------------- */
/* Import / export CSV                                                        */
/* -------------------------------------------------------------------------- */

export const PRODUCT_CSV_COLUMNS = [
  { key: 'code', label: 'Référence' },
  { key: 'name', label: 'Désignation' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Catégorie' },
  { key: 'unit', label: 'Unité' },
  { key: 'unitPrice', label: 'Prix unitaire' },
  { key: 'taxRate', label: 'TVA (%)' },
  { key: 'currency', label: 'Devise' },
  { key: 'status', label: 'Statut' },
] as const;

export function productToCsvRow(product: typeof products.$inferSelect): Record<string, string> {
  return {
    code: product.code ?? '',
    name: product.name,
    description: product.description ?? '',
    category: product.category ?? '',
    unit: product.unit,
    unitPrice: String(product.unitPrice),
    taxRate: String(product.taxRate),
    currency: product.currency,
    status: product.status === 'ACTIVE' ? 'ACTIF' : 'ARCHIVÉ',
  };
}

export interface ProductImportRow {
  code?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  unitPrice: number;
  taxRate?: number | null;
  currency?: string | null;
}

export interface ProductImportResult {
  created: number;
  updated: number;
  skipped: { line: number; reason: string }[];
}
