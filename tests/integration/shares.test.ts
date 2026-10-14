import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, quotationApprovalEvents, quotationShares, quotations } from '@/db/schema';
import { createQuotation } from '@/lib/services/quotations';
import { createShare, listShares, recordDecision, resolveShareToken, revokeShare } from '@/lib/services/shares';
import { createOrganization, createUser, resetDatabase, sampleItems, seedPlans, type TestOrganization, type TestUser } from './helpers';

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

async function quotationWithShare() {
  const quotation = await createQuotation({
    organizationId: organization.id,
    userId: user.id,
    input: { title: 'Mission à valider', currency: 'XOF', items: sampleItems() },
  });
  const share = await createShare({ organizationId: organization.id, quotationId: quotation.id, userId: user.id, expiresInDays: 15 });
  const token = share.url.split('/').pop() as string;
  return { quotation, share, token };
}

describe('liens de partage', () => {
  it('ne stocke jamais le jeton en clair', async () => {
    const { share, token } = await quotationWithShare();
    const [row] = await db.select().from(quotationShares).where(eq(quotationShares.id, share.id));

    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenPrefix).toBe(token.slice(0, 8));
    expect(share.url).toContain('/d/');
  });

  it('passe un brouillon en « envoyé » dès la création du lien', async () => {
    const { quotation } = await quotationWithShare();
    const [row] = await db.select().from(quotations).where(eq(quotations.id, quotation.id));
    expect(row.status).toBe('SENT');
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it('enregistre la consultation avec horodatage et événement', async () => {
    const { token, quotation } = await quotationWithShare();
    const resolved = await resolveShareToken(token, { ip: '41.207.0.1', userAgent: 'Mozilla/5.0' });

    expect(resolved?.quotation.number).toBe(quotation.number);
    const [shareRow] = await db.select().from(quotationShares).where(eq(quotationShares.tokenHash, (await db.select().from(quotationShares))[0].tokenHash));
    expect(shareRow.viewCount).toBeGreaterThanOrEqual(1);
    expect(shareRow.lastViewedAt).toBeInstanceOf(Date);

    const events = await db.select().from(quotationApprovalEvents).where(eq(quotationApprovalEvents.quotationId, quotation.id));
    expect(events.some((event) => event.action === 'VIEWED')).toBe(true);
    // L'adresse IP n'est jamais stockée en clair.
    expect(events[0].ipHash).not.toBe('41.207.0.1');
  });

  it('rejette un jeton invalide, expiré ou révoqué', async () => {
    const { token, share } = await quotationWithShare();
    expect(await resolveShareToken('jeton-invalide-de-vingt-caracteres-minimum')).toBeNull();

    await revokeShare(organization.id, share.id, user.id);
    expect(await resolveShareToken(token)).toBeNull();

    const list = await listShares(organization.id, (await db.select().from(quotationShares))[0].quotationId);
    expect(list[0].revokedAt).toBeInstanceOf(Date);
  });

  it('refuse un jeton expiré', async () => {
    const { token, share } = await quotationWithShare();
    await db.update(quotationShares).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(quotationShares.id, share.id));
    expect(await resolveShareToken(token)).toBeNull();
  });
});

describe('décision du client', () => {
  it('accepte un devis, historise l’événement et notifie l’entreprise', async () => {
    const { token, quotation } = await quotationWithShare();
    const result = await recordDecision({
      token,
      action: 'ACCEPT',
      actorName: 'Awa Traoré',
      actorEmail: 'awa@client.ci',
      ip: '41.207.0.9',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('ACCEPTED');

    const [row] = await db.select().from(quotations).where(eq(quotations.id, quotation.id));
    expect(row.status).toBe('ACCEPTED');
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(row.decisionSource).toBe('CUSTOMER_LINK');

    const events = await db.select().from(quotationApprovalEvents).where(eq(quotationApprovalEvents.quotationId, quotation.id));
    expect(events.some((event) => event.action === 'APPROVED' && event.actorName === 'Awa Traoré')).toBe(true);

    const alerts = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(alerts.some((alert) => alert.type === 'QUOTATION_ACCEPTED')).toBe(true);
  });

  it('refuse un devis avec motif', async () => {
    const { token, quotation } = await quotationWithShare();
    const result = await recordDecision({ token, action: 'REJECT', feedback: 'Budget trop élevé cette année.' });

    expect(result.success).toBe(true);
    expect(result.status).toBe('REJECTED');

    const [row] = await db.select().from(quotations).where(eq(quotations.id, quotation.id));
    expect(row.status).toBe('REJECTED');

    const events = await db.select().from(quotationApprovalEvents).where(eq(quotationApprovalEvents.quotationId, quotation.id));
    const rejection = events.find((event) => event.action === 'REJECTED');
    expect(rejection?.feedback).toBe('Budget trop élevé cette année.');
  });

  it('enregistre une demande de modification sans clore le devis', async () => {
    const { token, quotation } = await quotationWithShare();
    const result = await recordDecision({ token, action: 'REQUEST_CHANGE', feedback: 'Pouvez-vous ajuster les quantités ?' });

    expect(result.success).toBe(true);
    expect(result.status).toBe('PENDING');

    const [row] = await db.select().from(quotations).where(eq(quotations.id, quotation.id));
    expect(row.status).toBe('PENDING');
    expect(row.decidedAt).toBeNull();
  });

  it('interdit de décider deux fois', async () => {
    const { token } = await quotationWithShare();
    await recordDecision({ token, action: 'ACCEPT' });
    const second = await recordDecision({ token, action: 'REJECT', feedback: 'Changement d’avis' });
    expect(second.success).toBe(false);
    expect(second.message).toMatch(/déjà/);
  });

  it('refuse les décisions sur un devis annulé', async () => {
    const { token, quotation } = await quotationWithShare();
    await db.update(quotations).set({ status: 'CANCELLED' }).where(eq(quotations.id, quotation.id));
    const result = await recordDecision({ token, action: 'ACCEPT' });
    expect(result.success).toBe(false);
  });

  it('rejette un jeton inconnu', async () => {
    const result = await recordDecision({ token: 'inconnu-jeton-de-trente-deux-caracteres', action: 'ACCEPT' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalide|expiré|révoqué/i);
  });
});
