/**
 * Données de rendu d'un document de devis (module pur, sans accès à la base).
 * Partagé par les générateurs PDF/DOCX/XLSX, l'aperçu de l'éditeur et l'API publique.
 */
import { calculateQuotation, type QuotationTotals } from '@/lib/quotation-calculator';
import { mergeTemplateStyle, type TemplateCustomization, type TemplateStyle } from '@/lib/templates';
import type { Quotation, QuotationItem } from '@/db/schema';

export interface CompanySnapshot {
  name: string;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  legalInfo: string | null;
  bankDetails: string | null;
  paymentInfo: string | null;
  signatureLabel: string | null;
}

export interface CustomerSnapshot {
  id: string | null;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  taxId: string | null;
}

export interface QuotationTerms {
  validityPeriod?: string | null;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  warranty?: string | null;
  specialConditions?: string | null;
  paymentInstructions?: string | null;
  notes?: string | null;
  legalMentions?: string | null;
  blocks?: { id: string; label: string; content: string }[];
}

/* -------------------------------------------------------------------------- */
/* Étiquettes de document (devis ou facture)                                  */
/* -------------------------------------------------------------------------- */

export type DocumentKind = 'QUOTATION' | 'INVOICE';

/**
 * Libellés du document : le même moteur de rendu produit devis et factures.
 * Les générateurs PDF/DOCX/XLSX ne contiennent donc aucune mention « Devis »
 * codée en dur : tout passe par ces étiquettes.
 */
export interface DocumentLabels {
  kind: DocumentKind;
  /** Nom du type de document : « Devis », « Facture ». */
  documentTitle: string;
  /** Titre affiché en grand dans l'en-tête : « DEVIS », « FACTURE ». */
  badge: string;
  /** Nom de la feuille de calcul (« Devis », « Facture »). */
  sheetName: string;
  /** Libellé de la date limite : « Valable jusqu'au », « Échéance ». */
  validityLabel: string;
  /** Titre de la section de validité (devis). */
  validitySection: string;
  /** Mention de signature. */
  signatureLabel: string;
  /** Conversion du statut technique en libellé français. */
  statusLabel: (status: string) => string;
}

const QUOTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  PENDING: 'En attente',
  ACCEPTED: 'Accepté',
  REJECTED: 'Refusé',
  EXPIRED: 'Expiré',
  CANCELLED: 'Annulé',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
};

export const DOCUMENT_LABELS: Record<DocumentKind, DocumentLabels> = {
  QUOTATION: {
    kind: 'QUOTATION',
    documentTitle: 'Devis',
    badge: 'DEVIS',
    sheetName: 'Devis',
    validityLabel: 'Valable jusqu’au',
    validitySection: 'Validité du devis',
    signatureLabel: 'Bon pour accord — signature du client',
    statusLabel: (status) => QUOTATION_STATUS_LABELS[status] ?? status,
  },
  INVOICE: {
    kind: 'INVOICE',
    documentTitle: 'Facture',
    badge: 'FACTURE',
    sheetName: 'Facture',
    validityLabel: 'Échéance',
    validitySection: 'Conditions de règlement',
    signatureLabel: 'Signature et cachet',
    statusLabel: (status) => INVOICE_STATUS_LABELS[status] ?? status,
  },
};

/** Ligne de total complémentaire (acompte, règlements, solde dû…). */
export interface DocumentTotalRow {
  label: string;
  amount: number;
  emphasis?: boolean;
  muted?: boolean;
}

/** Section de texte additionnelle (conditions spécifiques, règlements…). */
export interface DocumentSection {
  title: string;
  body: string;
}

export interface QuotationDocumentData {
  quotation: Quotation;
  items: QuotationItem[];
  company: CompanySnapshot | null;
  customer: CustomerSnapshot | null;
  terms: QuotationTerms;
  style: TemplateStyle;
  totals: QuotationTotals;
  /** Filigrane MON DEVIS (plan gratuit). */
  watermark: boolean;
  /** Logo encodé en base64 pour les générateurs PDF/DOCX. */
  logoDataUri: string | null;
  /** Type de document : le même moteur sert les devis et les factures. */
  kind: DocumentKind;
  /** Libellés français dépendant du type de document. */
  labels: DocumentLabels;
  /** Lignes de méta supplémentaires (n° de devis d'origine, solde…). */
  metaRows: [string, string][];
  /** Lignes de totaux supplémentaires (règlements, solde dû). */
  totalRows: DocumentTotalRow[];
  /** Sections de texte supplémentaires. */
  extraSections: DocumentSection[];
}

/**
 * Assemble toutes les données nécessaires au rendu d'un devis (aperçu, PDF, DOCX, XLSX).
 * Les totaux sont recalculés depuis les lignes stockées : aucune divergence possible
 * entre ce qui est affiché et ce qui est exporté.
 */
export function buildDocumentData(params: {
  quotation: Quotation;
  items: QuotationItem[];
  style?: TemplateStyle;
  watermark?: boolean;
  logoDataUri?: string | null;
  kind?: DocumentKind;
  labels?: DocumentLabels;
  metaRows?: [string, string][];
  totalRows?: DocumentTotalRow[];
  extraSections?: DocumentSection[];
}): QuotationDocumentData {
  const { quotation, items } = params;
  const totals = calculateQuotation({
    lines: items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountType: item.discountType,
      discountValue: item.discountValue,
      taxRate: item.taxRate,
    })),
    globalDiscountType: quotation.globalDiscountType,
    globalDiscountValue: quotation.globalDiscountValue,
    pricesIncludeTax: quotation.pricesIncludeTax,
    depositAmount: quotation.depositAmount,
  });

  const style =
    params.style ??
    mergeTemplateStyle(quotation.templateKey, quotation.customization as unknown as TemplateCustomization | null);

  return {
    quotation,
    items,
    company: quotation.companySnapshot as unknown as CompanySnapshot | null,
    customer: quotation.customerSnapshot as unknown as CustomerSnapshot | null,
    terms: (quotation.terms as unknown as QuotationTerms) ?? {},
    style,
    totals,
    watermark: params.watermark ?? false,
    logoDataUri: params.logoDataUri ?? null,
    kind: params.kind ?? 'QUOTATION',
    labels: params.labels ?? DOCUMENT_LABELS[params.kind ?? 'QUOTATION'],
    metaRows: params.metaRows ?? [],
    totalRows: params.totalRows ?? [],
    extraSections: params.extraSections ?? [],
  };
}

/** Alias sémantique : le même conteneur de données sert devis et factures. */
export type BusinessDocumentData = QuotationDocumentData;

