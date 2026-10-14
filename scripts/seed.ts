#!/usr/bin/env tsx
/**
 * Jeu de données de démonstration MON DEVIS.
 *
 * ⚠️ Données de DÉMONSTRATION uniquement : ce script refuse de s'exécuter en
 * production (sauf --force explicite) et ne crée aucun paiement réel.
 * Les devis sont générés via les services métier : numérotation, instantanés,
 * calculs et historiques de statut sont donc identiques à ceux de l'application.
 *
 * Usage : npm run db:seed [-- --reset]
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '@/db';
import {
  applicationSettings,
  auditLogs,
  companyProfiles,
  customers,
  notificationPreferences,
  organizationMembers,
  organizationSettings,
  organizations,
  products,
  quotationApprovalEvents,
  quotationShares,
  quotationStatusHistory,
  quotations,
  sessions,
  subscriptionPlans,
  subscriptions,
  usageCounters,
  users,
  emailMessages,
  notifications,
  quotations as quotationsTable,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { hashPassword, generateToken, hashToken } from '@/lib/auth/password';
import { createQuotation, changeQuotationStatus, getOrganizationSettings } from '@/lib/services/quotations';
import { DEFAULT_PLANS } from '@/lib/plans';
import { saveFile } from '@/lib/storage';
import { calculateQuotation } from '@/lib/quotation-calculator';
import { toMoneyString } from '@/lib/money';
import type { QuotationStatus } from '@/db/schema';

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                */
/* -------------------------------------------------------------------------- */

// Générateur pseudo-aléatoire déterministe : le jeu de démonstration est reproductible.
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20260214);

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9, 30, 0, 0);
  return date;
}

function roundTo50(value: number): number {
  return Math.max(500, Math.round(value / 50) * 50);
}

/** Logo de démonstration (SVG monogramme) converti et stocké localement. */
async function createDemoLogo(organizationId: string, monogram: string, primary: string, secondary: string): Promise<string | null> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" width="320" height="96">
  <rect width="96" height="96" rx="20" fill="${primary}"/>
  <path d="M24 66 L24 30 L48 52 L72 30 L72 66" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="112" y="46" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="bold" fill="${secondary}">${monogram}</text>
  <text x="112" y="70" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#64748B">DEVIS PROFESSIONNELS</text>
</svg>`;
  try {
    const stored = await saveFile({
      scope: 'logos',
      organizationId,
      fileName: 'logo.svg',
      buffer: Buffer.from(svg, 'utf8'),
      mimeType: 'image/svg+xml',
    });
    return stored.url;
  } catch (error) {
    console.warn('[seed] logo non enregistré :', error instanceof Error ? error.message : error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Données de référence                                                       */
/* -------------------------------------------------------------------------- */

const CUSTOMER_SEEDS = [
  {
    type: 'COMPANY' as const,
    name: 'Mme Awa Traoré',
    companyName: 'Résidence Les Palmiers',
    email: 'awa.traore@lespalmiers.ci',
    phone: '+225 01 02 03 04 05',
    addressLine1: 'Boulevard Latrille, Lot 42',
    city: 'Abidjan',
    taxId: '2018112233Y',
  },
  {
    type: 'COMPANY' as const,
    name: 'M. Yao Konan',
    companyName: 'Groupe SIFCA Distribution',
    email: 'y.konan@sifca-distribution.ci',
    phone: '+225 27 21 75 00 00',
    addressLine1: 'Zone industrielle de Vridi',
    city: 'Abidjan',
    taxId: '1993541288K',
  },
  {
    type: 'COMPANY' as const,
    name: 'Dr Fatou Bamba',
    companyName: 'Clinique Saint-Jean',
    email: 'direction@clinique-saintjean.ci',
    phone: '+225 27 22 44 66 88',
    addressLine1: 'Rue du Commerce, Plateau',
    city: 'Abidjan',
    taxId: '2004556677B',
  },
  {
    type: 'COMPANY' as const,
    name: 'M. Ibrahim Coulibaly',
    companyName: 'Hôtel Ivoire Confort',
    email: 'i.coulibaly@ivoireconfort.ci',
    phone: '+225 05 88 99 00 11',
    addressLine1: 'Avenue Chardy, Cocody',
    city: 'Abidjan',
    taxId: '2012778899C',
  },
  {
    type: 'INDIVIDUAL' as const,
    name: 'Mme Nadège Assi',
    companyName: null,
    email: 'nadege.assi@gmail.com',
    phone: '+225 07 45 12 33 21',
    addressLine1: 'Riviera Palmeraie, Rue L112',
    city: 'Abidjan',
    taxId: null,
  },
  {
    type: 'COMPANY' as const,
    name: 'M. Serge N’Guessan',
    companyName: 'Établissements N’Guessan & Frères',
    email: 'contact@nguessan-freres.ci',
    phone: '+225 01 55 66 77 88',
    addressLine1: 'Marché de Treichville, Box 218',
    city: 'Abidjan',
    taxId: '2001332211A',
  },
  {
    type: 'COMPANY' as const,
    name: 'Mme Clarisse Diomandé',
    companyName: 'École Internationale Les Genêts',
    email: 'administration@lesgenets.ci',
    phone: '+225 27 22 11 44 55',
    addressLine1: 'Rue Pierre et Marie Curie, Cocody',
    city: 'Abidjan',
    taxId: '2009887766D',
  },
  {
    type: 'COMPANY' as const,
    name: 'M. Karim Ouattara',
    companyName: 'Boulangerie Le Fournil d’Abidjan',
    email: 'karim@fournil-abidjan.ci',
    phone: '+225 05 12 34 56 78',
    addressLine1: 'Rue des Brasseurs, Marcory',
    city: 'Abidjan',
    taxId: '2016554433F',
  },
];

const PRODUCT_SEEDS = [
  { name: 'Travaux de maçonnerie', category: 'Construction & BTP', unit: 'm²', unitPrice: 12500, code: 'BTP-001' },
  { name: 'Peinture intérieure (2 couches)', category: 'Construction & BTP', unit: 'm²', unitPrice: 4500, code: 'BTP-002' },
  { name: 'Peinture extérieure façade', category: 'Construction & BTP', unit: 'm²', unitPrice: 5800, code: 'BTP-003' },
  { name: 'Carrelage grès cérame 60×60 (fourni et posé)', category: 'Fourniture de matériel', unit: 'm²', unitPrice: 18900, code: 'BTP-004' },
  { name: 'Faux plafond en staff', category: 'Construction & BTP', unit: 'm²', unitPrice: 14500, code: 'BTP-005' },
  { name: 'Électricité — mise aux normes du tableau', category: 'Construction & BTP', unit: 'forfait', unitPrice: 450000, code: 'ELE-001' },
  { name: 'Plomberie — installation sanitaire complète', category: 'Construction & BTP', unit: 'forfait', unitPrice: 680000, code: 'PLB-001' },
  { name: 'Menuiserie aluminium sur mesure', category: 'Fourniture de matériel', unit: 'm²', unitPrice: 78000, code: 'MEN-001' },
  { name: 'Main d’œuvre qualifiée', category: 'Main d’œuvre', unit: 'jour', unitPrice: 25000, code: 'MO-001' },
  { name: 'Audit énergétique de bâtiment', category: 'Conseil', unit: 'forfait', unitPrice: 750000, code: 'CON-001' },
  { name: 'Assistance à maîtrise d’ouvrage', category: 'Conseil', unit: 'mois', unitPrice: 1250000, code: 'CON-002' },
  { name: 'Étude de plans et métrés', category: 'Conseil', unit: 'forfait', unitPrice: 350000, code: 'CON-003' },
  { name: 'Contrat de maintenance préventive', category: 'Maintenance', unit: 'mois', unitPrice: 150000, code: 'MTN-001' },
  { name: 'Intervention urgente (24h)', category: 'Maintenance', unit: 'heure', unitPrice: 35000, code: 'MTN-002' },
  { name: 'Location de matériel de chantier', category: 'Transport', unit: 'jour', unitPrice: 85000, code: 'LOC-001' },
  { name: 'Transport et évacuation des gravats', category: 'Transport', unit: 'forfait', unitPrice: 180000, code: 'TRA-001' },
  { name: 'Formation sécurité chantier (10 personnes)', category: 'Formation', unit: 'session', unitPrice: 420000, code: 'FOR-001' },
  { name: 'Nettoyage de fin de chantier', category: 'Prestation de services', unit: 'm²', unitPrice: 1500, code: 'NET-001' },
];

const QUOTATION_TITLES = [
  'Rénovation complète villa duplex',
  'Aménagement d’un plateau de bureaux',
  'Construction d’un entrepôt logistique',
  'Réfection de la toiture et étanchéité',
  'Mise aux normes électriques du siège',
  'Travaux de peinture et décoration',
  'Extension d’une salle de réunion',
  'Réaménagement de la réception client',
  'Installation sanitaire — aile est',
  'Réhabilitation de trois salles de classe',
  'Carrelage et faïence des blocs sanitaires',
  'Audit énergétique et préconisations',
  'Maintenance annuelle des installations',
  'Construction d’un mur de clôture',
  'Aménagement d’une terrasse extérieure',
  'Réparation urgente après dégât des eaux',
  'Étude technique préalable au chantier',
  'Fourniture et pose de menuiseries',
];

const VALIDITY_BLOCKS = [
  'Ce devis est valable 30 jours à compter de sa date d’émission.',
  'Devis valable 45 jours. Passé ce délai, les prix pourront être révisés selon l’évolution des coûts matériaux.',
];

const PAYMENT_BLOCKS = [
  'Acompte de 40 % à la commande, solde à la réception des travaux.',
  'Paiement à 30 jours fin de mois par virement bancaire.',
  'Règlement en trois échéances : 30 % à la commande, 40 % à mi-parcours, 30 % à la livraison.',
];

/* -------------------------------------------------------------------------- */
/* Semis                                                                      */
/* -------------------------------------------------------------------------- */

async function resetDatabase(): Promise<void> {
  console.log('[seed] réinitialisation des données…');
  await db.execute(sql`
    TRUNCATE TABLE
      quotation_approval_events, quotation_shares, quotation_status_history, quotation_items,
      quotations, products, customers, company_profiles, organization_settings, organization_invites,
      organization_members, subscriptions, payments, notifications, notification_preferences,
      email_messages, support_tickets, audit_logs, usage_counters, auth_tokens, sessions,
      organizations, users, subscription_plans, application_settings, quotation_templates
    RESTART IDENTITY CASCADE
  `);
}

async function seedPlans(): Promise<Map<string, string>> {
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
      .onConflictDoUpdate({
        target: subscriptionPlans.code,
        set: {
          name: plan.name,
          tagline: plan.tagline,
          description: plan.description,
          features: plan.features,
          limits: plan.limits as unknown as Record<string, unknown>,
          sortOrder: plan.sortOrder,
          updatedAt: new Date(),
        },
      })
      .returning({ id: subscriptionPlans.id, code: subscriptionPlans.code });
    ids.set(row.code, row.id);
  }
  console.log(`[seed] ${ids.size} plans d’abonnement configurés (tarifs à définir dans l’administration)`);
  return ids;
}

async function seedApplicationSettings(): Promise<void> {
  const settings: { key: string; value: unknown; description: string }[] = [
    {
      key: 'platform.general',
      value: {
        supportEmail: 'support@mon-devis.app',
        defaultCurrency: 'XOF',
        defaultLocale: 'fr-FR',
        defaultCountry: 'CI',
        signupEnabled: true,
        emailVerificationRequired: false,
        maintenanceMode: false,
      },
      description: 'Paramètres généraux de la plateforme',
    },
    {
      key: 'platform.pricing',
      value: {
        currency: 'EUR',
        showYearlyByDefault: true,
        yearlyDiscountPercent: 20,
        // Les tarifs réels sont définis plan par plan dans l’administration.
        configured: false,
      },
      description: 'Configuration tarifaire (les prix affichés proviennent des plans)',
    },
    {
      key: 'platform.features',
      value: {
        publicQuotationSharing: true,
        onlineApproval: true,
        docxExport: true,
        xlsxExport: true,
        emailNotifications: true,
        mobileMoney: false,
        registrationRequiresInvite: false,
      },
      description: 'Indicateurs de fonctionnalités (feature flags)',
    },
    {
      key: 'content.landing',
      value: {
        tagline: 'Créez des devis professionnels en quelques clics.',
        supportTagline: 'Créez, personnalisez, envoyez et suivez vos devis depuis une seule plateforme.',
      },
      description: 'Contenus éditoriaux modifiables de la page d’accueil',
    },
  ];

  for (const setting of settings) {
    await db
      .insert(applicationSettings)
      .values({ key: setting.key, value: setting.value as never, description: setting.description })
      .onConflictDoUpdate({
        target: applicationSettings.key,
        set: { value: setting.value as never, description: setting.description, updatedAt: new Date() },
      });
  }
  console.log('[seed] paramètres de la plateforme initialisés');
}

interface SeededUser {
  id: string;
  email: string;
  name: string;
}

async function seedUser(input: {
  email: string;
  name: string;
  password: string;
  isPlatformAdmin?: boolean;
  phone?: string;
}): Promise<SeededUser> {
  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      phone: input.phone ?? null,
      passwordHash,
      emailVerifiedAt: new Date(),
      isPlatformAdmin: input.isPlatformAdmin ?? false,
      locale: 'fr-FR',
      theme: 'SYSTEM',
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  await db.insert(notificationPreferences).values({ userId: row.id }).onConflictDoNothing();
  return row;
}

interface SeededOrganization {
  id: string;
  name: string;
  subscriptionPlanCode: string;
}

async function seedOrganization(input: {
  name: string;
  slug: string;
  ownerId: string;
  members: { userId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' }[];
  planId: string;
  planCode: string;
  planInterval: 'MONTHLY' | 'YEARLY';
  currency: string;
  companyName: string;
  logoMonogram: string;
  quoteCount: number;
  customersSubset?: number;
  statusMix?: Partial<Record<QuotationStatus, number>>;
}): Promise<SeededOrganization> {
  const [organization] = await db
    .insert(organizations)
    .values({ name: input.name, slug: input.slug, ownerId: input.ownerId })
    .returning({ id: organizations.id });

  await db.insert(organizationMembers).values(
    input.members.map((member) => ({
      organizationId: organization.id,
      userId: member.userId,
      role: member.role,
    })),
  );

  await db.insert(organizationSettings).values({
    organizationId: organization.id,
    defaultCurrency: input.currency,
    defaultTaxRate: input.currency === 'EUR' ? '20' : '18',
    defaultValidityDays: 30,
    defaultTemplateKey: 'moderne',
    numberingFormat: 'DEV-{YYYY}-{SEQ:4}',
    defaultPaymentTerms: PAYMENT_BLOCKS[0],
    defaultTerms: 'TVA appliquée conformément à la réglementation en vigueur.',
    brandColor: '#2563EB',
    brandColorSecondary: '#0F172A',
  });

  const logoUrl = await createDemoLogo(organization.id, input.companyName, '#2563EB', '#0F172A');

  const [company] = await db
    .insert(companyProfiles)
    .values({
      organizationId: organization.id,
      name: input.companyName,
      isDefault: true,
      logoUrl,
      logoMimeType: logoUrl ? 'image/svg+xml' : null,
      addressLine1: 'Rue des Jardins, Cocody',
      addressLine2: 'Immeuble Alpha, 3e étage',
      postalCode: '00225',
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      countryCode: 'CI',
      phone: '+225 27 22 49 50 51',
      email: input.slug === 'sarl-batir-conseil' ? 'contact@batiretconseil.ci' : 'hello@monstudio.design',
      website: input.slug === 'sarl-batir-conseil' ? 'www.batiretconseil.ci' : 'www.monstudio.design',
      registrationNumber: 'CI-ABJ-2019-B-12345',
      taxId: '2019456789X',
      legalInfo: 'SARL au capital de 5 000 000 FCFA — RCCM Abidjan',
      bankDetails: 'BANQUE ATLANTIQUE — IBAN CI93 0001 2345 6789 0123 4567 89\nOrange Money Pro : +225 27 22 49 50 51',
      paymentInfo: 'Paiement par virement bancaire, chèque ou mobile money. Aucun escompte pour paiement anticipé.',
      signatureLabel: 'La Direction',
    })
    .returning();

  // Clients
  const customerRows = await db
    .insert(customers)
    .values(
      CUSTOMER_SEEDS.slice(0, input.customersSubset ?? CUSTOMER_SEEDS.length).map((customer) => ({
        organizationId: organization.id,
        type: customer.type,
        name: customer.name,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
        addressLine1: customer.addressLine1,
        city: customer.city,
        postalCode: '00225',
        country: "Côte d'Ivoire",
        countryCode: 'CI',
        taxId: customer.taxId,
      })),
    )
    .returning();

  // Catalogue
  const productRows = await db
    .insert(products)
    .values(
      PRODUCT_SEEDS.map((product) => ({
        organizationId: organization.id,
        name: product.name,
        code: product.code,
        description: `${product.name} — prestation réalisée par nos équipes qualifiées.`,
        category: product.category,
        unit: product.unit,
        unitPrice: String(product.unitPrice),
        taxRate: input.currency === 'EUR' ? '20' : '18',
        currency: input.currency,
      })),
    )
    .returning();

  // Devis répartis sur les 6 derniers mois
  const statuses: QuotationStatus[] = [];
  const mix = input.statusMix ?? { ACCEPTED: 0.38, SENT: 0.22, PENDING: 0.12, REJECTED: 0.12, EXPIRED: 0.08, DRAFT: 0.05, CANCELLED: 0.03 };
  const total = input.quoteCount;
  Object.entries(mix).forEach(([status, ratio]) => {
    const count = Math.round(total * (ratio ?? 0));
    for (let index = 0; index < count; index += 1) statuses.push(status as QuotationStatus);
  });
  while (statuses.length < total) statuses.push('SENT');
  statuses.length = total;

  const createdQuotationIds: { id: string; status: QuotationStatus; createdById: string }[] = [];

  for (let index = 0; index < statuses.length; index += 1) {
    const status = statuses[index]!;
    const customer = pick(customerRows);
    const issueDate = daysAgo(randomInt(3, 175));
    const validUntil = new Date(issueDate.getTime() + (pick([15, 30, 30, 45, 60]) as number) * 24 * 60 * 60 * 1000);
    const lineCount = randomInt(2, 6);
    const chosen = new Set<string>();
    const lines = Array.from({ length: lineCount }, () => {
      let product = pick(productRows);
      let guard = 0;
      while (chosen.has(product.id) && guard < 10) {
        product = pick(productRows);
        guard += 1;
      }
      chosen.add(product.id);
      const quantity = product.unit === 'forfait' ? 1 : Math.max(1, roundTo50(randomInt(1, 60) * (product.unit === 'm²' ? 1 : 1)) / 50);
      const discountType = random() > 0.72 ? 'PERCENTAGE' : null;
      return {
        productId: product.id,
        name: product.name,
        description: product.description,
        unit: product.unit,
        quantity,
        unitPrice: Number(product.unitPrice),
        discountType: discountType as 'PERCENTAGE' | null,
        discountValue: discountType ? pick([3, 5, 7.5, 10]) : 0,
        taxRate: Number(product.taxRate),
      };
    });

    const globalDiscount = random() > 0.75 ? { type: 'PERCENTAGE' as const, value: pick([2.5, 5, 7.5]) } : null;
    const totals = calculateQuotation({
      lines,
      globalDiscountType: globalDiscount?.type ?? null,
      globalDiscountValue: globalDiscount?.value ?? 0,
      pricesIncludeTax: false,
    });

    const author = input.members[index % input.members.length]!;

    const quotation = await createQuotation({
      organizationId: organization.id,
      userId: author.userId,
      input: {
        title: QUOTATION_TITLES[index % QUOTATION_TITLES.length]!,
        customerId: customer.id,
        currency: input.currency,
        issueDate,
        validUntil,
        status: 'DRAFT',
        templateKey: pick(['minimaliste', 'moderne', 'corporate', 'services', 'btp', 'freelance', 'elegant', 'commercial']),
        pricesIncludeTax: false,
        globalDiscountType: globalDiscount?.type ?? null,
        globalDiscountValue: globalDiscount?.value ?? 0,
        depositAmount: Number(totals.total) > 1_000_000 ? Math.round(Number(totals.total) * 0.4) : 0,
        companyProfileId: company.id,
        notes: pick([
          'Merci de nous retourner ce devis signé avec la mention « Bon pour accord ».',
          'Devis établi après visite technique du site. Les quantités définitives seront confirmées au démarrage.',
          'Ce devis inclut la fourniture des matériaux et la main d’œuvre.',
        ]),
        terms: {
          validityPeriod: pick(VALIDITY_BLOCKS),
          paymentTerms: pick(PAYMENT_BLOCKS),
          deliveryTime: pick(['Démarrage des travaux sous 10 jours ouvrés.', 'Exécution sur 3 semaines après validation.', 'Livraison sous 5 semaines, planning détaillé joint.']),
          warranty: 'Garantie de 12 mois sur les travaux réalisés, hors usure normale.',
          legalMentions: 'TVA appliquée conformément au Code général des impôts ivoirien.',
        },
        items: lines,
      },
    });

    createdQuotationIds.push({ id: quotation.id, status, createdById: author.userId });

    // Progression du statut selon le cycle de vie réel
    if (status !== 'DRAFT') {
      await changeQuotationStatus({
        organizationId: organization.id,
        userId: author.userId,
        quotationId: quotation.id,
        status: 'SENT',
        note: 'Devis transmis au client par e-mail.',
        force: true,
      });
    }
    if (status === 'ACCEPTED' || status === 'REJECTED') {
      await changeQuotationStatus({
        organizationId: organization.id,
        userId: author.userId,
        quotationId: quotation.id,
        status,
        source: random() > 0.5 ? 'CUSTOMER_LINK' : 'MANUAL',
        note: status === 'ACCEPTED' ? 'Accord du client confirmé.' : 'Devis refusé — budget non validé.',
        force: true,
      });
    } else if (status === 'PENDING') {
      await changeQuotationStatus({
        organizationId: organization.id,
        userId: author.userId,
        quotationId: quotation.id,
        status: 'PENDING',
        note: 'En attente de validation interne côté client.',
        force: true,
      });
    } else if (status === 'EXPIRED') {
      await changeQuotationStatus({
        organizationId: organization.id,
        userId: author.userId,
        quotationId: quotation.id,
        status: 'EXPIRED',
        source: 'SYSTEM',
        note: 'Expiration automatique (date de validité dépassée).',
        force: true,
      });
    } else if (status === 'CANCELLED') {
      await changeQuotationStatus({
        organizationId: organization.id,
        userId: author.userId,
        quotationId: quotation.id,
        status: 'CANCELLED',
        note: 'Devis annulé — projet reporté.',
        force: true,
      });
    }
  }

  // Partages et décisions client pour quelques devis
  const accepted = createdQuotationIds.filter((quotation) => quotation.status === 'ACCEPTED').slice(0, 4);
  for (const quotation of accepted) {
    const token = generateToken(24);
    const [share] = await db
      .insert(quotationShares)
      .values({
        quotationId: quotation.id,
        createdById: quotation.createdById,
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, 8),
        expiresAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        viewCount: randomInt(1, 5),
        lastViewedAt: daysAgo(randomInt(1, 8)),
      })
      .returning({ id: quotationShares.id });

    await db.insert(quotationApprovalEvents).values([
      {
        quotationId: quotation.id,
        shareId: share.id,
        action: 'VIEWED',
        actorName: 'Service achats du client',
        actorEmail: 'achats@client.ci',
        userAgent: 'Mozilla/5.0 (Linux; Android 13)',
      },
      {
        quotationId: quotation.id,
        shareId: share.id,
        action: 'APPROVED',
        actorName: 'Direction du client',
        actorEmail: 'direction@client.ci',
        feedback: 'Devis conforme à notre attente. Bon pour accord.',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    ]);
  }

  // Abonnement
  const now = new Date();
  const periodEnd = new Date(now);
  if (input.planInterval === 'YEARLY') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.insert(subscriptions).values({
    organizationId: organization.id,
    planId: input.planId,
    status: 'ACTIVE',
    interval: input.planInterval,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    provider: 'MANUAL',
  });

  // Compteurs d’usage alignés sur les données réellement créées
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const createdThisMonth = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(quotationsTable)
    .where(sql`${quotationsTable.organizationId} = ${organization.id} and to_char(${quotationsTable.createdAt}, 'YYYY-MM') = ${period}`);

  await db.insert(usageCounters).values({
    organizationId: organization.id,
    metric: 'quotations_created',
    period,
    value: Number(createdThisMonth[0]?.value ?? 0),
  });

  console.log(`[seed] organisation « ${input.name} » : ${statuses.length} devis, ${customerRows.length} clients, ${productRows.length} produits`);

  return { id: organization.id, name: input.name, subscriptionPlanCode: input.planCode };
}

async function seedNotifications(userId: string, organizationId: string, quotationIds: string[]): Promise<void> {
  const items: { type: (typeof notifications.$inferInsert)['type']; title: string; body: string; link: string }[] = [
    {
      type: 'QUOTATION_ACCEPTED',
      title: 'Devis accepté 🎉',
      body: 'Résidence Les Palmiers a accepté votre devis. Pensez à planifier le démarrage du chantier.',
      link: '/devis',
    },
    {
      type: 'QUOTATION_VIEWED',
      title: 'Devis consulté par le client',
      body: 'Le lien de partage de votre devis a été ouvert il y a quelques minutes.',
      link: '/devis',
    },
    {
      type: 'QUOTATION_EXPIRING',
      title: 'Devis bientôt expiré',
      body: 'Un devis arrive à expiration dans 3 jours. Relancez votre client pour sécuriser la vente.',
      link: '/devis?filtre=expirant',
    },
    {
      type: 'EXPORT_READY',
      title: 'Export PDF disponible',
      body: 'Votre devis a été exporté au format PDF et est prêt à être téléchargé.',
      link: '/devis',
    },
  ];

  await db.insert(notifications).values(
    items.map((item, index) => ({
      userId,
      organizationId,
      type: item.type,
      title: item.title,
      body: item.body,
      link: quotationIds[index] ? `${item.link}` : item.link,
      readAt: index >= 2 ? new Date() : null,
      createdAt: daysAgo(index),
    })),
  );
}

async function main(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const forced = process.argv.includes('--force');
  if (isProduction && !forced) {
    console.error(
      "[seed] refus d'exécuter le jeu de démonstration en production. Utilisez --force uniquement si vous savez ce que vous faites.",
    );
    process.exit(1);
  }

  const shouldReset = process.argv.includes('--reset');
  const startedAt = Date.now();

  if (shouldReset) await resetDatabase();

  const planIds = await seedPlans();
  await seedApplicationSettings();

  // Comptes
  const owner = await seedUser({
    email: 'demo@mon-devis.app',
    name: 'Aïcha Konaté',
    password: 'Demo2026!',
    phone: '+225 07 07 07 07 07',
  });
  const teammate = await seedUser({
    email: 'commercial@mon-devis.app',
    name: 'Yann Bamba',
    password: 'Demo2026!',
    phone: '+225 05 05 05 05 05',
  });
  const platformAdmin = await seedUser({
    email: 'admin@mon-devis.app',
    name: 'Administrateur MON DEVIS',
    password: 'Admin2026!',
    isPlatformAdmin: true,
  });
  const secondOwner = await seedUser({
    email: 'studio@mon-devis.app',
    name: 'Mariam Diallo',
    password: 'Demo2026!',
  });

  console.log('[seed] comptes créés :');
  console.log('        demo@mon-devis.app / Demo2026!        (propriétaire — plan Pro)');
  console.log('        commercial@mon-devis.app / Demo2026!  (membre de l’équipe)');
  console.log('        studio@mon-devis.app / Demo2026!      (second compte — plan gratuit)');
  console.log('        admin@mon-devis.app / Admin2026!      (administrateur plateforme)');

  // Organisations
  const mainOrg = await seedOrganization({
    name: 'Bâtir & Conseil SARL',
    slug: 'sarl-batir-conseil',
    ownerId: owner.id,
    members: [
      { userId: owner.id, role: 'OWNER' },
      { userId: teammate.id, role: 'MEMBER' },
    ],
    planId: planIds.get('pro')!,
    planCode: 'pro',
    planInterval: 'MONTHLY',
    currency: 'XOF',
    companyName: 'BÂTIR & CONSEIL SARL',
    logoMonogram: 'BÂTIR & CONSEIL',
    quoteCount: 42,
  });

  await seedOrganization({
    name: 'Studio Créatif Abidjan',
    slug: 'studio-creatif-abidjan',
    ownerId: secondOwner.id,
    members: [{ userId: secondOwner.id, role: 'OWNER' }],
    planId: planIds.get('free')!,
    planCode: 'free',
    planInterval: 'MONTHLY',
    currency: 'EUR',
    companyName: 'STUDIO CRÉATIF ABIDJAN',
    logoMonogram: 'STUDIO CRÉATIF',
    quoteCount: 4,
    customersSubset: 3,
    statusMix: { SENT: 0.5, DRAFT: 0.25, ACCEPTED: 0.25 },
  });

  const adminOrg = await seedOrganization({
    name: 'MON DEVIS (compte de démonstration plateforme)',
    slug: 'mon-devis-interne',
    ownerId: platformAdmin.id,
    members: [{ userId: platformAdmin.id, role: 'OWNER' }],
    planId: planIds.get('business')!,
    planCode: 'business',
    planInterval: 'YEARLY',
    currency: 'EUR',
    companyName: 'MON DEVIS',
    logoMonogram: 'MON DEVIS',
    quoteCount: 3,
    customersSubset: 2,
    statusMix: { ACCEPTED: 0.34, SENT: 0.33, DRAFT: 0.33 },
  });

  // Notifications (utilisateur de démonstration)
  const recentQuotations = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(sql`${quotations.organizationId} = ${mainOrg.id}`)
    .orderBy(sql`${quotations.createdAt} desc`)
    .limit(4);
  await seedNotifications(owner.id, mainOrg.id, recentQuotations.map((row) => row.id));

  // Journal d’audit initial
  await db.insert(auditLogs).values([
    {
      organizationId: mainOrg.id,
      actorUserId: owner.id,
      action: 'organization.created',
      entity: 'organization',
      entityId: mainOrg.id,
      metadata: { source: 'seed' },
    },
    {
      organizationId: mainOrg.id,
      actorUserId: owner.id,
      action: 'company.updated',
      entity: 'company_profile',
      entityId: null,
      metadata: { source: 'seed' },
    },
  ]);

  await db.insert(emailMessages).values({
    to: 'demo@mon-devis.app',
    subject: 'Bienvenue sur MON DEVIS',
    template: 'welcome',
    status: 'SKIPPED',
    provider: 'console',
    bodyPreview: 'Aucun fournisseur d’e-mail configuré : message non envoyé (voir EMAIL_DRIVER).',
  });

  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[seed] jeu de démonstration prêt en ${duration}s.`);
  console.log('[seed] connectez-vous sur http://localhost:3000/connexion avec demo@mon-devis.app / Demo2026!');
  console.log('[seed] les tarifs des plans sont volontairement à 0 : définissez-les dans Administration → Tarifs.\n');

  await pool.end();
}

main().catch(async (error) => {
  console.error('[seed] échec :', error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});

// Réexport inutilisé conservé pour la lisibilité des imports (évite les avertissements de lint).
void [organizationSettings, sessions, quotations, quotationStatusHistory, createHash, newId];
