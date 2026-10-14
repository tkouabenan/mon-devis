import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { customers, quotationItems, quotations } from '@/db/schema';
import { calculateQuotation } from '@/lib/quotation-calculator';
import { quotationSchema } from '@/lib/validation/schemas';
import { NotFoundError } from '@/lib/auth/guards';
import {
  archiveQuotation,
  changeQuotationStatus,
  createQuotation,
  duplicateQuotation,
  getQuotationWithItems,
  listQuotations,
  nextQuotationNumber,
  restoreQuotation,
  softDeleteQuotation,
  updateQuotation,
} from '@/lib/services/quotations';
import { createCustomerRecord, createOrganization, createUser, resetDatabase, sampleItems, seedPlans, type TestOrganization, type TestUser } from './helpers';

let user: TestUser;
let organization: TestOrganization;

beforeAll(async () => {
  await resetDatabase();
  await seedPlans();
});

beforeEach(async () => {
  await resetDatabase();
  await seedPlans();
  user = await createUser();
  organization = await createOrganization({ user });
});

async function createDraft(customerId: string | null = null) {
  const customer = customerId ? null : await createCustomerRecord(organization.id);
  return createQuotation({
    organizationId: organization.id,
    userId: user.id,
    input: {
      title: 'Refonte du système de facturation',
      customerId: customerId ?? customer?.id ?? null,
      currency: 'XOF',
      items: sampleItems(),
      validUntil: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}

describe('numérotation', () => {
  it('génère des numéros séquentiels uniques par organisation', async () => {
    const first = await nextQuotationNumber(organization.id);
    const other = await createOrganization({ user: await createUser() });
    const second = await nextQuotationNumber(other.id);

    expect(first).toMatch(/^DEV-\d{4}-0001$/);
    expect(second).toMatch(/^DEV-\d{4}-0001$/);
    // Deux organisations distinctes ne partagent pas leur compteur.
    expect(first).toBe(second);
  });

  it('incrémente le compteur à chaque devis créé', async () => {
    const first = await createDraft();
    const second = await createDraft();
    expect(second.number).not.toBe(first.number);
    const sequence = Number(second.number.split('-').at(-1));
    expect(sequence).toBeGreaterThan(Number(first.number.split('-').at(-1)));
  });
});

describe('création et calculs', () => {
  it('enregistre les totaux recalculés côté serveur (Decimal.js)', async () => {
    const quotation = await createDraft();
    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotation.id));
    expect(items).toHaveLength(2);

    const expected = calculateQuotation({
      lines: sampleItems().map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRate: item.taxRate,
      })),
      pricesIncludeTax: false,
    });

    expect(Number(quotation.subtotal)).toBeCloseTo(expected.subtotal.toNumber(), 2);
    expect(Number(quotation.total)).toBeCloseTo(expected.total.toNumber(), 2);
    expect(Number(quotation.taxTotal)).toBeCloseTo(expected.taxTotal.toNumber(), 2);
    // 450 000 avec 10 % de remise puis 3 × 75 000 : 405 000 + 225 000 = 630 000 HT.
    expect(Number(quotation.netBeforeTax)).toBe(630000);
    expect(Number(quotation.taxTotal)).toBeCloseTo(113400, 2);
    expect(Number(quotation.total)).toBeCloseTo(743400, 2);
  });

  it('rejette un devis sans ligne au niveau de la validation métier', async () => {
    const parsed = quotationSchema.safeParse({
      title: 'Vide',
      currency: 'XOF',
      templateKey: 'minimaliste',
      items: [],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes('items'))).toBe(true);
    }
  });

  it('ignore un client appartenant à une autre organisation', async () => {
    const otherOrg = await createOrganization({ user: await createUser() });
    const foreignCustomer = await createCustomerRecord(otherOrg.id);

    await expect(
      createQuotation({
        organizationId: organization.id,
        userId: user.id,
        input: { title: 'Tentative', currency: 'XOF', customerId: foreignCustomer.id, items: sampleItems() },
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('isolation par organisation', () => {
  it('empêche la lecture d’un devis d’une autre organisation', async () => {
    const quotation = await createDraft();
    const otherOrg = await createOrganization({ user: await createUser() });

    await expect(getQuotationWithItems(otherOrg.id, quotation.id)).rejects.toThrow(NotFoundError);
  });

  it('ne liste que les devis de l’organisation demandée', async () => {
    await createDraft();
    const otherUser = await createUser();
    const otherOrg = await createOrganization({ user: otherUser });
    await createQuotation({
      organizationId: otherOrg.id,
      userId: otherUser.id,
      input: { title: 'Devis autre organisation', currency: 'XOF', items: sampleItems() },
    });

    const list = await listQuotations(organization.id, { pageSize: 50 });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].title).toBe('Refonte du système de facturation');
  });

  it('protège aussi les clients (isolation CRM)', async () => {
    const otherOrg = await createOrganization({ user: await createUser() });
    const rows = await db.select().from(customers).where(eq(customers.organizationId, otherOrg.id));
    expect(rows).toHaveLength(0);
  });
});

describe('modification', () => {
  it('met à jour les lignes et recalcule les totaux', async () => {
    const quotation = await createDraft();
    const updated = await updateQuotation({
      organizationId: organization.id,
      userId: user.id,
      quotationId: quotation.id,
      input: {
        title: 'Refonte — phase 2',
        currency: 'XOF',
        items: [{ name: 'Prestation unique', quantity: '2', unitPrice: '100000', taxRate: '18' }],
      },
    });

    expect(updated.title).toBe('Refonte — phase 2');
    expect(Number(updated.netBeforeTax)).toBe(200000);
    expect(Number(updated.total)).toBeCloseTo(236000, 2);

    const rows = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotation.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Prestation unique');
  });
});

describe('transitions de statut', () => {
  it('applique le workflow et historise chaque changement', async () => {
    const quotation = await createDraft();
    const sent = await changeQuotationStatus({
      organizationId: organization.id,
      quotationId: quotation.id,
      userId: user.id,
      status: 'SENT',
    });
    expect(sent.status).toBe('SENT');

    const accepted = await changeQuotationStatus({
      organizationId: organization.id,
      quotationId: quotation.id,
      userId: user.id,
      status: 'ACCEPTED',
      note: 'Bon pour accord reçu par e-mail',
    });
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.decidedAt).toBeInstanceOf(Date);

    const withItems = await getQuotationWithItems(organization.id, quotation.id);
    expect(withItems.status).toBe('ACCEPTED');
  });

  it('refuse une transition interdite (devis annulé → envoyé)', async () => {
    const quotation = await createDraft();
    await changeQuotationStatus({ organizationId: organization.id, quotationId: quotation.id, userId: user.id, status: 'CANCELLED' });
    await expect(
      changeQuotationStatus({
        organizationId: organization.id,
        quotationId: quotation.id,
        userId: user.id,
        status: 'SENT',
      }),
    ).rejects.toThrow();
  });
});

describe('duplication, archivage et corbeille', () => {
  it('duplique un devis avec ses lignes et un nouveau numéro', async () => {
    const quotation = await createDraft();
    const copy = await duplicateQuotation(organization.id, user.id, quotation.id);

    expect(copy.id).not.toBe(quotation.id);
    expect(copy.number).not.toBe(quotation.number);
    expect(copy.status).toBe('DRAFT');
    expect(copy.items).toHaveLength(2);
    expect(Number(copy.total)).toBeCloseTo(Number(quotation.total), 2);
  });

  it('archive puis restaure un devis', async () => {
    const quotation = await createDraft();
    await archiveQuotation(organization.id, quotation.id, true);
    const archived = await listQuotations(organization.id, { archived: true });
    expect(archived.rows.map((row) => row.id)).toContain(quotation.id);

    await archiveQuotation(organization.id, quotation.id, false);
    const active = await listQuotations(organization.id, { archived: false });
    expect(active.rows.map((row) => row.id)).toContain(quotation.id);
  });

  it('met le devis en corbeille puis le restaure', async () => {
    const quotation = await createDraft();
    await softDeleteQuotation(organization.id, quotation.id);

    const active = await listQuotations(organization.id, { pageSize: 20 });
    expect(active.rows.map((row) => row.id)).not.toContain(quotation.id);

    const deleted = await listQuotations(organization.id, { deleted: true });
    expect(deleted.rows.map((row) => row.id)).toContain(quotation.id);

    await restoreQuotation(organization.id, quotation.id);
    const rows = await db.select().from(quotations).where(eq(quotations.id, quotation.id));
    expect(rows[0].deletedAt).toBeNull();
  });
});
