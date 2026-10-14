'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { customers, quotations } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { customerSchema } from '@/lib/validation/schemas';
import { formatZodError } from '@/lib/api';
import { recordAuditFromRequest } from '@/lib/audit';
import { assertCanCreate } from '@/lib/services/subscription';
import { customerToCsvRow, customerValues } from '@/lib/services/customers';
import type { ActionResult } from '@/app/actions/auth';

/** Actions serveur du module Clients (CRM léger). */

const CLIENT_COLUMN_MAP: Record<string, string> = {
  type: 'type',
  contact: 'name',
  nom: 'name',
  name: 'name',
  societe: 'companyName',
  société: 'companyName',
  company: 'companyName',
  companyname: 'companyName',
  email: 'email',
  'e-mail': 'email',
  telephone: 'phone',
  téléphone: 'phone',
  phone: 'phone',
  adresse: 'addressLine1',
  address: 'addressLine1',
  ville: 'city',
  city: 'city',
  'code postal': 'postalCode',
  codepostal: 'postalCode',
  pays: 'country',
  country: 'country',
  'numero fiscal': 'taxId',
  'n° fiscal': 'taxId',
  taxid: 'taxId',
  notes: 'notes',
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export async function createCustomerAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireOrganization();

  const parsed = customerSchema.safeParse({
    type: formData.get('type') ?? 'COMPANY',
    name: formData.get('name'),
    companyName: formData.get('companyName') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    addressLine1: formData.get('addressLine1') ?? undefined,
    addressLine2: formData.get('addressLine2') ?? undefined,
    postalCode: formData.get('postalCode') ?? undefined,
    city: formData.get('city') ?? undefined,
    country: formData.get('country') ?? "Côte d'Ivoire",
    countryCode: formData.get('countryCode') ?? 'CI',
    taxId: formData.get('taxId') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations du client.' };
  }

  try {
    await assertCanCreate(context.organization.id, 'customer');
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Limite de votre formule atteinte.' };
  }

  const [created] = await db
    .insert(customers)
    .values({ organizationId: context.organization.id, ...customerValues(parsed.data) })
    .returning();

  await recordAuditFromRequest({
    action: 'customer.create',
    entity: 'customer',
    entityId: created.id,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    metadata: { name: created.name },
  });

  revalidatePath('/clients');
  revalidatePath('/devis/nouveau');
  return { success: true, message: 'Client ajouté.', data: { id: created.id } };
}

export async function updateCustomerAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const context = await requireOrganization();
  const customerId = String(formData.get('id') ?? '');

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, context.organization.id)))
    .limit(1);
  if (!existing) return { success: false, message: 'Client introuvable.' };

  const parsed = customerSchema.safeParse({
    type: formData.get('type') ?? 'COMPANY',
    name: formData.get('name'),
    companyName: formData.get('companyName') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    addressLine1: formData.get('addressLine1') ?? undefined,
    addressLine2: formData.get('addressLine2') ?? undefined,
    postalCode: formData.get('postalCode') ?? undefined,
    city: formData.get('city') ?? undefined,
    country: formData.get('country') ?? "Côte d'Ivoire",
    countryCode: formData.get('countryCode') ?? 'CI',
    taxId: formData.get('taxId') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, errors: formatZodError(parsed.error), message: 'Vérifiez les informations du client.' };
  }

  await db
    .update(customers)
    .set({ ...customerValues(parsed.data), updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  await recordAuditFromRequest({
    action: 'customer.update',
    entity: 'customer',
    entityId: customerId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  revalidatePath('/clients');
  revalidatePath(`/clients/${customerId}`);
  return { success: true, message: 'Fiche client mise à jour.' };
}

export async function archiveCustomerAction(customerId: string, archived: boolean): Promise<ActionResult> {
  const context = await requireOrganization();

  const [updated] = await db
    .update(customers)
    .set({ isArchived: archived, updatedAt: new Date() })
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, context.organization.id)))
    .returning({ id: customers.id });

  if (!updated) return { success: false, message: 'Client introuvable.' };

  await recordAuditFromRequest({
    action: archived ? 'customer.archive' : 'customer.restore',
    entity: 'customer',
    entityId: customerId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  revalidatePath('/clients');
  return { success: true, message: archived ? 'Client archivé.' : 'Client restauré.' };
}

/** Suppression définitive : refusée si des devis sont rattachés (intégrité historique). */
export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  const context = await requireOrganization();

  const [linked] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.organizationId, context.organization.id), eq(quotations.customerId, customerId)))
    .limit(1);

  if (linked) {
    return {
      success: false,
      message: 'Ce client est rattaché à des devis : archivez-le plutôt que de le supprimer, afin de préserver l’historique.',
    };
  }

  const [deleted] = await db
    .delete(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, context.organization.id)))
    .returning({ id: customers.id });

  if (!deleted) return { success: false, message: 'Client introuvable.' };

  await recordAuditFromRequest({
    action: 'customer.delete',
    entity: 'customer',
    entityId: customerId,
    organizationId: context.organization.id,
    actorUserId: context.user.id,
  });

  revalidatePath('/clients');
  return { success: true, message: 'Client supprimé.' };
}

/**
 * Import CSV de clients.
 * Colonnes reconnues (insensibles à la casse et aux accents) : contact, société,
 * e-mail, téléphone, adresse, code postal, ville, pays, n° fiscal, notes.
 */
export async function importCustomersAction(_previous: ActionResult | undefined, formData: FormData): Promise<ActionResult<{ created: number; skipped: number }>> {
  const context = await requireOrganization();
  const file = formData.get('file');

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
    transformHeader: (header) => CLIENT_COLUMN_MAP[normalizeHeader(header)] ?? normalizeHeader(header),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { success: false, message: `Lecture du CSV impossible : ${parsed.errors[0].message}` };
  }

  const rows = parsed.data
    .map((row) => ({
      type: (row.type ?? '').toUpperCase().startsWith('PART') ? 'INDIVIDUAL' : 'COMPANY',
      name: (row.name ?? '').trim(),
      companyName: (row.companyName ?? '').trim() || null,
      email: (row.email ?? '').trim() || null,
      phone: (row.phone ?? '').trim() || null,
      addressLine1: (row.addressLine1 ?? '').trim() || null,
      postalCode: (row.postalCode ?? '').trim() || null,
      city: (row.city ?? '').trim() || null,
      country: (row.country ?? '').trim() || "Côte d'Ivoire",
      taxId: (row.taxId ?? '').trim() || null,
      notes: (row.notes ?? '').trim() || null,
    }))
    .filter((row) => row.name.length > 0);

  if (rows.length === 0) {
    return { success: false, message: 'Aucune ligne exploitable : la colonne « contact » (ou « nom ») est obligatoire.' };
  }

  const { created, skipped } = await db.transaction(async (tx) => {
    let createdCount = 0;
    const skippedRows: string[] = [];
    for (const row of rows) {
      const parsedRow = customerSchema.safeParse(row);
      if (!parsedRow.success) {
        skippedRows.push(row.name);
        continue;
      }
      await tx.insert(customers).values({ organizationId: context.organization.id, ...customerValues(parsedRow.data) });
      createdCount += 1;
    }
    return { created: createdCount, skipped: skippedRows.length };
  });

  await recordAuditFromRequest({
    action: 'customer.import',
    entity: 'customer',
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    metadata: { created, skipped },
  });

  revalidatePath('/clients');
  return {
    success: created > 0,
    message:
      created === 0
        ? 'Aucun client importé : vérifiez les colonnes de votre fichier.'
        : `${created} client${created > 1 ? 's' : ''} importé${created > 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} ligne(s) ignorée(s)` : ''}.`,
    data: { created, skipped },
  };
}

/** Génère le CSV de tous les clients de l'organisation (export). */
export async function buildCustomersCsv(organizationId: string): Promise<string> {
  const rows = await db.select().from(customers).where(eq(customers.organizationId, organizationId)).orderBy(customers.name);
  const Papa = (await import('papaparse')).default;
  return Papa.unparse(rows.map(customerToCsvRow), { delimiter: ';', newline: '\r\n' });
}
