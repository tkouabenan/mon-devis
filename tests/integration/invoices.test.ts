import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { invoiceItems, invoicePayments, invoices, quotations } from '@/db/schema';
import { NotFoundError, QuotaError } from '@/lib/auth/guards';
import { changeQuotationStatus, createQuotation } from '@/lib/services/quotations';
import {
  changeInvoiceStatus,
  createInvoice,
  createInvoiceFromQuotation,
  deleteInvoicePayment,
  getInvoiceStats,
  getInvoiceWithDetails,
  listInvoices,
  listInvoicesForQuotation,
  markOverdueInvoices,
  nextInvoiceNumber,
  recordInvoicePayment,
  summarizePayments,
  updateInvoice,
} from '@/lib/services/invoices';
import { generateInvoiceDocument } from '@/lib/documents';
import { assertCanCreate, incrementUsage } from '@/lib/services/subscription';
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

/** Devis accepté prêt à être converti. */
async function acceptedQuotation(customerId?: string) {
  const customer = customerId ? null : await createCustomerRecord(organization.id);
  const quotation = await createQuotation({
    organizationId: organization.id,
    userId: user.id,
    input: { title: 'Mission acceptée', currency: 'XOF', customerId: customerId ?? customer?.id ?? null, items: sampleItems() },
  });
  await changeQuotationStatus({ organizationId: organization.id, quotationId: quotation.id, userId: user.id, status: 'SENT' });
  return changeQuotationStatus({ organizationId: organization.id, quotationId: quotation.id, userId: user.id, status: 'ACCEPTED' });
}

describe('numérotation des factures', () => {
  it('utilise une séquence distincte de celle des devis', async () => {
    const number = await nextInvoiceNumber(organization.id);
    expect(number).toMatch(/^FAC-\d{4}-0001$/);
  });
});

describe('instantané émetteur (mentions de l’entreprise)', () => {
  it('fige les mentions de l’entreprise dès la création d’une facture', async () => {
    const invoice = await createInvoice({
      organizationId: organization.id,
      userId: user.id,
      input: { title: 'Facture directe', currency: 'XOF', items: sampleItems() },
    });

    const snapshot = invoice.companySnapshot as unknown as { name?: string; taxId?: string | null } | null;
    // Sans cet instantané, la facture serait générée sans bloc émetteur.
    expect(snapshot).not.toBeNull();
    expect(snapshot?.name).toBe(`Société ${organization.name}`);
    expect(snapshot?.taxId).toBe('CI-TEST-0001');
  });

  it('reprend les mentions du devis lors de la conversion', async () => {
    const quotation = await createQuotation({
      organizationId: organization.id,
      userId: user.id,
      input: { title: 'Mission', currency: 'XOF', items: sampleItems() },
    });
    await changeQuotationStatus({
      organizationId: organization.id,
      quotationId: quotation.id,
      userId: user.id,
      status: 'ACCEPTED',
    });

    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    const snapshot = invoice.companySnapshot as unknown as { name?: string } | null;

    expect(snapshot?.name).toBe(`Société ${organization.name}`);
    const document = await generateInvoiceDocument({ organizationId: organization.id, invoiceId: invoice.id, format: 'pdf' });
    expect(document.buffer.byteLength).toBeGreaterThan(1000);
  });
});

describe('conversion d’un devis accepté', () => {
  it('copie les lignes et les totaux du devis', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });

    expect(invoice.quotationId).toBe(quotation.id);
    expect(invoice.sourceQuotationNumber).toBe(quotation.number);
    expect(invoice.status).toBe('DRAFT');
    expect(Number(invoice.total)).toBeCloseTo(Number(quotation.total), 2);

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Étude de faisabilité');

    const updatedQuotation = await db.select().from(quotations).where(eq(quotations.id, quotation.id));
    expect(updatedQuotation[0].status).toBe('ACCEPTED');
  });

  it('refuse la conversion d’un devis non accepté', async () => {
    const customer = await createCustomerRecord(organization.id);
    const quotation = await createQuotation({
      organizationId: organization.id,
      userId: user.id,
      input: { title: 'Encore en brouillon', currency: 'XOF', customerId: customer.id, items: sampleItems() },
    });

    await expect(
      createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id }),
    ).rejects.toThrow();

    const invoice = await createInvoiceFromQuotation({
      organizationId: organization.id,
      userId: user.id,
      quotationId: quotation.id,
      options: { allowNonAccepted: true },
    });
    expect(invoice.status).toBe('DRAFT');
  });

  it('conserve les données de la facture après modification du devis', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });

    // Le devis est modifié après coup : la facture ne doit pas bouger.
    await db.update(quotations).set({ title: 'Devis renommé', total: '1.00' }).where(eq(quotations.id, quotation.id));

    const details = await getInvoiceWithDetails(organization.id, invoice.id);
    expect(details?.invoice.title).toBe('Mission acceptée');
    expect(Number(details?.invoice.total)).toBeCloseTo(Number(invoice.total), 2);
    expect(details?.items).toHaveLength(2);
  });

  it('autorise plusieurs factures (acompte puis solde) pour un même devis', async () => {
    const quotation = await acceptedQuotation();
    const first = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    const second = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });

    const linked = await listInvoicesForQuotation(organization.id, quotation.id);
    expect(linked.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('ne laisse pas une autre organisation convertir le devis', async () => {
    const quotation = await acceptedQuotation();
    const otherOrg = await createOrganization({ user: await createUser() });
    await expect(
      createInvoiceFromQuotation({ organizationId: otherOrg.id, userId: otherOrg.userId, quotationId: quotation.id }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('règlements', () => {
  it('passe la facture en « paiement partiel » puis « payée »', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });

    const total = Number(invoice.total);
    const partial = await recordInvoicePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      userId: user.id,
      amount: (total / 2).toFixed(2),
      method: 'MOBILE_MONEY',
      reference: 'WAVE-2026-0001',
    });
    expect(partial.invoice.status).toBe('PARTIALLY_PAID');

    const summary = summarizePayments(partial.invoice, []);
    expect(summary.amountPaid).toBeCloseTo(total / 2, 2);
    expect(summary.balance).toBeCloseTo(total / 2, 2);

    const settled = await recordInvoicePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      userId: user.id,
      amount: (total / 2).toFixed(2),
      method: 'BANK_TRANSFER',
    });
    expect(settled.invoice.status).toBe('PAID');
    expect(settled.statusChanged).toBe(true);

    const payments = await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, invoice.id));
    expect(payments).toHaveLength(2);
  });

  it('recalcule le statut après suppression d’un règlement', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });
    const payment = await recordInvoicePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      userId: user.id,
      amount: invoice.total,
      method: 'CASH',
    });
    expect(payment.invoice.status).toBe('PAID');

    const [createdPayment] = await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, invoice.id));
    await deleteInvoicePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      paymentId: createdPayment.id,
      userId: user.id,
    });
    const details = await getInvoiceWithDetails(organization.id, invoice.id);
    expect(Number(details?.invoice.amountPaid)).toBe(0);
    expect(details?.invoice.status).not.toBe('PAID');
  });
});

describe('échéances et statut automatique', () => {
  it('marque en retard les factures échues non réglées', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });

    await db
      .update(invoices)
      .set({ dueDate: new Date(Date.now() - 5 * 86_400_000) })
      .where(eq(invoices.id, invoice.id));

    const updated = await markOverdueInvoices(organization.id);
    expect(updated).toBeGreaterThanOrEqual(1);

    const [row] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(row.status).toBe('OVERDUE');
  });

  it('ne marque pas en retard une facture réglée', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });
    await recordInvoicePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      userId: user.id,
      amount: invoice.total,
      method: 'BANK_TRANSFER',
    });
    await db.update(invoices).set({ dueDate: new Date(Date.now() - 10 * 86_400_000) }).where(eq(invoices.id, invoice.id));
    await markOverdueInvoices(organization.id);

    const [row] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(row.status).toBe('PAID');
  });
});

describe('brouillons et émission', () => {
  it('autorise la modification d’un brouillon mais pas d’une facture émise', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });

    const updated = await updateInvoice({
      organizationId: organization.id,
      userId: user.id,
      invoiceId: invoice.id,
      input: {
        title: 'Facture ajustée',
        currency: 'XOF',
        items: [{ name: 'Ligne unique', quantity: '1', unitPrice: '500000', taxRate: '18' }],
      },
    });
    expect(updated.title).toBe('Facture ajustée');
    expect(Number(updated.total)).toBeCloseTo(590000, 2);

    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });
    await expect(
      updateInvoice({
        organizationId: organization.id,
        userId: user.id,
        invoiceId: invoice.id,
        input: { title: 'Interdit', currency: 'XOF', items: [{ name: 'X', quantity: '1', unitPrice: '1', taxRate: '0' }] },
      }),
    ).rejects.toThrow();
  });

  it('interdit un statut de règlement saisi manuellement', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await db.update(invoices).set({ status: 'SENT' }).where(eq(invoices.id, invoice.id));

    await expect(
      changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'PAID' }),
    ).rejects.toThrow();
  });
});

describe('statistiques de facturation', () => {
  it('agrège le facturé, l’encaissé et l’impayé par devise', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });
    await recordInvoicePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      userId: user.id,
      amount: (Number(invoice.total) / 4).toFixed(2),
      method: 'MOBILE_MONEY',
    });

    const stats = await getInvoiceStats(
      organization.id,
      { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) },
      'XOF',
    );
    expect(stats.count).toBe(1);
    expect(stats.totalBilled).toBeCloseTo(Number(invoice.total), 2);
    expect(stats.totalPaid).toBeCloseTo(Number(invoice.total) / 4, 2);
    expect(stats.outstanding).toBeCloseTo((Number(invoice.total) * 3) / 4, 2);
    expect(stats.paymentMethods.some((entry) => entry.method === 'MOBILE_MONEY')).toBe(true);
  });
});

describe('limites de formule', () => {
  it('bloque la 6e facture du plan gratuit', async () => {
    for (let index = 0; index < 5; index += 1) {
      await incrementUsage(organization.id, 'invoices_created');
    }
    await expect(assertCanCreate(organization.id, 'invoice')).rejects.toThrow(QuotaError);
  });

  it('autorise un nombre illimité de factures en plan Pro', async () => {
    const proOrg = await createOrganization({ user: await createUser(), planCode: 'pro' });
    for (let index = 0; index < 25; index += 1) {
      await incrementUsage(proOrg.id, 'invoices_created');
    }
    await expect(assertCanCreate(proOrg.id, 'invoice')).resolves.toBeUndefined();
  });
});

describe('exports de facture', () => {
  it('génère un PDF, un Word et un Excel contenant les données réelles', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    await changeInvoiceStatus({ organizationId: organization.id, invoiceId: invoice.id, userId: user.id, status: 'SENT' });

    const pdf = await generateInvoiceDocument({ organizationId: organization.id, invoiceId: invoice.id, format: 'pdf' });
    expect(pdf.mimeType).toBe('application/pdf');
    expect(pdf.fileName).toMatch(new RegExp(`^MON-DEVIS_${invoice.number.replace(/-/g, '-')}_`));
    expect(pdf.size).toBeGreaterThan(1000);
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');

    const docx = await generateInvoiceDocument({ organizationId: organization.id, invoiceId: invoice.id, format: 'docx' });
    expect(docx.mimeType).toContain('wordprocessingml');
    expect(docx.size).toBeGreaterThan(2000);

    const xlsx = await generateInvoiceDocument({ organizationId: organization.id, invoiceId: invoice.id, format: 'xlsx' });
    expect(xlsx.mimeType).toContain('spreadsheetml');
    expect(xlsx.size).toBeGreaterThan(2000);
  });

  it('refuse l’export d’une facture d’une autre organisation', async () => {
    const quotation = await acceptedQuotation();
    const invoice = await createInvoiceFromQuotation({ organizationId: organization.id, userId: user.id, quotationId: quotation.id });
    const otherOrg = await createOrganization({ user: await createUser() });

    await expect(generateInvoiceDocument({ organizationId: otherOrg.id, invoiceId: invoice.id, format: 'pdf' })).rejects.toThrow();
  });
});

describe('création directe et isolation', () => {
  it('permet de créer une facture sans devis d’origine', async () => {
    const customer = await createCustomerRecord(organization.id);
    const invoice = await createInvoice({
      organizationId: organization.id,
      userId: user.id,
      input: {
        title: 'Facture directe',
        customerId: customer.id,
        currency: 'XOF',
        items: [{ name: 'Heure de conseil', quantity: '10', unitPrice: '25000', taxRate: '18' }],
      },
    });
    expect(invoice.number).toMatch(/^FAC-/);
    expect(Number(invoice.total)).toBeCloseTo(295000, 2);
    expect(invoice.quotationId).toBeNull();
  });

  it('cloisonne la liste des factures par organisation', async () => {
    const otherOrg = await createOrganization({ user: await createUser() });
    await createInvoice({
      organizationId: otherOrg.id,
      userId: otherOrg.userId,
      input: { title: 'Facture voisine', currency: 'XOF', items: [{ name: 'X', quantity: '1', unitPrice: '1000', taxRate: '0' }] },
    });

    const list = await listInvoices(organization.id, { pageSize: 20 });
    expect(list.rows).toHaveLength(0);
    expect(list.total).toBe(0);
  });
});
