'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { products } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { productSchema } from '@/lib/validation/schemas';
import { formatZodError } from '@/lib/api';
import { recordAuditFromRequest } from '@/lib/audit';
import { assertCanCreate } from '@/lib/services/subscription';
import { productToCsvRow, productValues } from '@/lib/services/products';
import type { ActionResult } from '@/app/actions/auth';

/** Actions serveur du catalogue Produits & Services. */

const PRODUCT_COLUMN_MAP: Record<string, string> = {
  reference: 'code',
  ref: 'code',
  code: 'code',
  designation: 'name',
  name: 'name',
  nom: 'name',
  description: 'description',
  categorie: 'category',
  category: 'category',
  unite: 'unit',
  unit: 'unit',
  prix: 'unitPrice',
  prixunitaire: 'unitPrice',
  unitprice: 'unitPrice',
  tva: 'taxRate',
  taxrate: 'taxRate',
  devise: 'currency',
  currency: 'currency',
  statut: 'status',
  status: 'status',
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export async function createProductAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();

  const parsed = productSchema.safeParse({
    name: formData.get('name'),
    code: formData.get('code') ?? undefined,
    description: formData.get('description') ?? undefined,
    category: formData.get('category') ?? undefined,
    unit: formData.get('unit') ?? 'unité',
    unitPrice: formData.get('unitPrice'),
    taxRate: formData.get('taxRate') ?? 0,
    currency: formData.get('currency') ?? 'XOF',
    status: formData.get('status') ?? 'ACTIVE',
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations du produit.' };
  }

  try {
    await assertCanCreate(context.organization.id, 'product');
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Limite de votre formule atteinte.' };
  }

  const values = productValues(parsed.data);
  if (values.code) {
    const [duplicate] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.organizationId, context.organization.id), eq(products.code, values.code)))
      .limit(1);
    if (duplicate) {
      return { success: false, errors: { code: 'Cette référence existe déjà.' }, message: 'Référence déjà utilisée.' };
    }
  }

  const [created] = await db
    .insert(products)
    .values({ organizationId: context.organization.id, ...values })
    .returning();

  await recordAuditFromRequest({
    action: 'product.create',
    entity: 'product',
    entityId: created.id,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    metadata: { name: created.name },
  });

  revalidatePath('/produits');
  revalidatePath('/devis/nouveau');
  return { success: true, message: 'Produit ajouté au catalogue.', data: { id: created.id } };
}

export async function updateProductAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const context = await requireOrganization();
  const productId = String(formData.get('id') ?? '');

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, context.organization.id)))
    .limit(1);
  if (!existing) return { success: false, message: 'Produit introuvable.' };

  const parsed = productSchema.safeParse({
    name: formData.get('name'),
    code: formData.get('code') ?? undefined,
    description: formData.get('description') ?? undefined,
    category: formData.get('category') ?? undefined,
    unit: formData.get('unit') ?? 'unité',
    unitPrice: formData.get('unitPrice'),
    taxRate: formData.get('taxRate') ?? 0,
    currency: formData.get('currency') ?? 'XOF',
    status: formData.get('status') ?? 'ACTIVE',
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations du produit.' };
  }

  await db
    .update(products)
    .set({ ...productValues(parsed.data), updatedAt: new Date() })
    .where(eq(products.id, productId));

  await recordAuditFromRequest({
    action: 'product.update',
    entity: 'product',
    entityId: productId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  revalidatePath('/produits');
  return { success: true, message: 'Produit mis à jour.' };
}

export async function setProductStatusAction(productId: string, status: 'ACTIVE' | 'ARCHIVED'): Promise<ActionResult> {
  const context = await requireOrganization();

  const [updated] = await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.organizationId, context.organization.id)))
    .returning({ id: products.id });

  if (!updated) return { success: false, message: 'Produit introuvable.' };

  await recordAuditFromRequest({
    action: status === 'ACTIVE' ? 'product.restore' : 'product.archive',
    entity: 'product',
    entityId: productId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  revalidatePath('/produits');
  return { success: true, message: status === 'ACTIVE' ? 'Produit réactivé.' : 'Produit archivé.' };
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  const context = await requireOrganization();

  const [deleted] = await db
    .delete(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, context.organization.id)))
    .returning({ id: products.id });

  if (!deleted) return { success: false, message: 'Produit introuvable.' };

  await recordAuditFromRequest({
    action: 'product.delete',
    entity: 'product',
    entityId: productId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  revalidatePath('/produits');
  return { success: true, message: 'Produit supprimé.' };
}

/** Import CSV du catalogue : crée les nouveaux produits, met à jour les références existantes. */
export async function importProductsAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult<{ created: number; updated: number; skipped: number }>> {
  const context = await requireOrganization();
  const file = formData.get('file');
  const defaultCurrency = String(formData.get('currency') ?? 'XOF');

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: 'Sélectionnez un fichier CSV.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, message: 'Le fichier ne doit pas dépasser 5 Mo.' };
  }

  const text = await file.text();
  const Papa = (await import('papaparse')).default;
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => PRODUCT_COLUMN_MAP[normalizeHeader(header)] ?? normalizeHeader(header),
  });

  type Row = {
    name: string;
    code: string | null;
    description: string | null;
    category: string | null;
    unit: string;
    unitPrice: number;
    taxRate: number;
    currency: string;
    status: 'ACTIVE' | 'ARCHIVED';
  };

  const rows: Row[] = [];
  let skipped = 0;

  for (const row of parsed.data) {
    const name = (row.name ?? '').trim();
    const priceRaw = (row.unitPrice ?? '').replace(/\s/g, '').replace(',', '.');
    const price = Number.parseFloat(priceRaw);
    if (!name || !Number.isFinite(price)) {
      skipped += 1;
      continue;
    }
    const statusRaw = normalizeHeader(row.status ?? '');
    rows.push({
      name,
      code: (row.code ?? '').trim() || null,
      description: (row.description ?? '').trim() || null,
      category: (row.category ?? '').trim() || null,
      unit: (row.unit ?? '').trim() || 'unité',
      unitPrice: price,
      taxRate: Number.isFinite(Number.parseFloat(row.taxRate ?? '')) ? Number.parseFloat(row.taxRate ?? '') : 0,
      currency: (row.currency ?? '').trim().toUpperCase().slice(0, 3) || defaultCurrency,
      status: statusRaw.startsWith('arch') ? 'ARCHIVED' : 'ACTIVE',
    });
  }

  if (rows.length === 0) {
    return { success: false, message: 'Aucune ligne exploitable : les colonnes « désignation » et « prix » sont obligatoires.' };
  }

  const existing = await db
    .select({ id: products.id, code: products.code })
    .from(products)
    .where(eq(products.organizationId, context.organization.id));
  const byCode = new Map(existing.filter((row) => row.code).map((row) => [row.code as string, row.id]));

  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const parsedRow = productSchema.safeParse(row);
      if (!parsedRow.success) {
        skipped += 1;
        continue;
      }
      const values = productValues(parsedRow.data);
      const existingId = row.code ? byCode.get(row.code) : undefined;

      if (existingId) {
        await tx.update(products).set({ ...values, updatedAt: new Date() }).where(eq(products.id, existingId));
        updated += 1;
      } else {
        const [inserted] = await tx
          .insert(products)
          .values({ organizationId: context.organization.id, ...values })
          .onConflictDoNothing()
          .returning({ id: products.id });
        if (inserted) {
          created += 1;
          if (values.code) byCode.set(values.code, inserted.id);
        } else {
          skipped += 1;
        }
      }
    }
  });

  await recordAuditFromRequest({
    action: 'product.import',
    entity: 'product',
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    metadata: { created, updated, skipped },
  });

  revalidatePath('/produits');
  return {
    success: created + updated > 0,
    message: `${created} créé(s), ${updated} mis à jour${skipped > 0 ? `, ${skipped} ignoré(s)` : ''}.`,
    data: { created, updated, skipped },
  };
}

/** Export CSV du catalogue. */
export async function buildProductsCsv(organizationId: string): Promise<string> {
  const rows = await db.select().from(products).where(eq(products.organizationId, organizationId)).orderBy(products.name);
  const Papa = (await import('papaparse')).default;
  return Papa.unparse(rows.map(productToCsvRow), { delimiter: ';', newline: '\r\n' });
}

/** Modèle CSV vide, proposé au téléchargement depuis la page Produits. */
export async function buildProductsCsvTemplate(): Promise<string> {
  const Papa = (await import('papaparse')).default;
  return Papa.unparse(
    [
      {
        Reference: 'PREST-001',
        Désignation: 'Prestation de service exemple',
        Description: 'Description courte du produit ou service',
        Catégorie: 'Services',
        Unité: 'forfait',
        'Prix unitaire': '150000',
        'TVA (%)': '18',
        Devise: 'XOF',
        Statut: 'ACTIF',
      },
    ],
    { delimiter: ';', newline: '\r\n' },
  );
}
