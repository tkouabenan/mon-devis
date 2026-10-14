import type { Quotation, QuotationItem } from '@/db/schema';
import type { CompanySnapshot, CustomerSnapshot, QuotationDocumentData } from '@/lib/services/quotations';
import { buildDocumentData } from '@/lib/services/quotations';

/** Données de test réalistes : entreprise ivoirienne facturant en FCFA. */
export const companyFixture: CompanySnapshot = {
  name: 'BÂTIR & CONSEIL SARL',
  logoUrl: null,
  addressLine1: 'Rue des Jardins, Cocody',
  addressLine2: 'Immeuble Alpha, 3e étage',
  postalCode: '00225',
  city: 'Abidjan',
  country: "Côte d'Ivoire",
  countryCode: 'CI',
  phone: '+225 07 07 07 07 07',
  email: 'contact@batiretconseil.ci',
  website: 'www.batiretconseil.ci',
  registrationNumber: 'CI-ABJ-2019-B-12345',
  taxId: '2019456789X',
  legalInfo: 'SARL au capital de 5 000 000 FCFA',
  bankDetails: 'BANQUE ATLANTIQUE — IBAN CI93 0001 2345 6789 0123 4567 89',
  paymentInfo: 'Paiement par virement bancaire ou mobile money (Orange Money / Wave).',
  signatureLabel: 'La Direction',
};

export const customerFixture: CustomerSnapshot = {
  id: 'customer-1',
  type: 'COMPANY',
  name: 'Mme Awa Traoré',
  companyName: 'RÉSIDENCE LES PALMIERS',
  email: 'awa.traore@lespalmiers.ci',
  phone: '+225 01 02 03 04 05',
  addressLine1: 'Boulevard Latrille',
  addressLine2: 'Lot 42',
  postalCode: '00225',
  city: 'Abidjan',
  country: "Côte d'Ivoire",
  countryCode: 'CI',
  taxId: '2018112233Y',
};

const baseQuotation: Quotation = {
  id: 'quotation-1',
  organizationId: 'org-1',
  customerId: 'customer-1',
  createdById: 'user-1',
  number: 'DEV-2026-0001',
  title: 'Devis rénovation villa',
  status: 'SENT',
  reference: 'REF-2026-14',
  customerReference: 'CMD-2026-77',
  currency: 'XOF',
  locale: 'fr-FR',
  issueDate: new Date('2026-02-10T08:00:00Z'),
  validUntil: new Date('2026-03-12T08:00:00Z'),
  sentAt: new Date('2026-02-10T09:00:00Z'),
  decidedAt: null,
  decisionSource: null,
  viewedAt: null,
  templateId: null,
  templateKey: 'moderne',
  customization: null,
  pricesIncludeTax: false,
  subtotal: '0',
  lineDiscountTotal: '0',
  globalDiscountType: null,
  globalDiscountValue: '0',
  globalDiscountTotal: '0',
  netBeforeTax: '0',
  taxTotal: '0',
  total: '0',
  amountDue: '0',
  depositAmount: '0',
  companySnapshot: companyFixture as never,
  customerSnapshot: customerFixture as never,
  terms: {
    validityPeriod: 'Ce devis est valable 30 jours à compter de sa date d’émission.',
    paymentTerms: 'Acompte de 40 % à la commande, solde à la réception des travaux.',
    deliveryTime: 'Exécution sous 3 semaines après validation.',
    warranty: 'Garantie de 12 mois sur les travaux réalisés.',
    legalMentions: "TVA appliquée conformément au Code général des impôts ivoirien.",
    paymentInstructions: null,
    specialConditions: null,
    notes: null,
    blocks: [],
  } as never,
  notes: 'Merci de nous retourner ce devis signé avec la mention « Bon pour accord ».',
  internalNotes: null,
  isArchived: false,
  deletedAt: null,
  createdAt: new Date('2026-02-10T08:00:00Z'),
  updatedAt: new Date('2026-02-10T08:00:00Z'),
};

function item(partial: Partial<QuotationItem> & { name: string; quantity: string; unitPrice: string }): QuotationItem {
  return {
    id: `item-${partial.name.replace(/\s+/g, '-').toLowerCase()}`,
    quotationId: 'quotation-1',
    productId: null,
    position: 0,
    description: null,
    unit: 'unité',
    discountType: null,
    discountValue: '0',
    taxRate: '18',
    lineGross: '0',
    lineDiscount: '0',
    lineNet: '0',
    lineTax: '0',
    lineTotal: '0',
    ...partial,
  };
}

export const itemsFixture: QuotationItem[] = [
  item({
    name: 'Travaux de maçonnerie',
    description: 'Reprise des murs du salon, enduit et finitions.',
    unit: 'm²',
    quantity: '45',
    unitPrice: '12500',
    position: 0,
  }),
  item({
    name: 'Peinture intérieure haut de gamme',
    description: 'Application de deux couches, marque Sikkens.',
    unit: 'm²',
    quantity: '120',
    unitPrice: '4500',
    discountType: 'PERCENTAGE',
    discountValue: '5',
    position: 1,
  }),
  item({
    name: 'Carrelage grès cérame 60×60',
    description: 'Fourniture et pose, joint époxy.',
    unit: 'm²',
    quantity: '38.5',
    unitPrice: '18900',
    position: 2,
  }),
  item({
    name: 'Main d’œuvre électricité',
    description: 'Mise aux normes du tableau électrique.',
    unit: 'forfait',
    quantity: '1',
    unitPrice: '450000',
    discountType: 'FIXED',
    discountValue: '25000',
    position: 3,
  }),
];

export function buildFixtureData(overrides: Partial<Parameters<typeof buildDocumentData>[0]> = {}): QuotationDocumentData {
  return buildDocumentData({
    quotation: baseQuotation,
    items: itemsFixture,
    watermark: false,
    logoDataUri: null,
    ...overrides,
  });
}

export { baseQuotation };
