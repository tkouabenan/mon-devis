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
  };
}

