import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { quotations } from '@/db/schema';
import { loadImageDataUri } from './assets';
import { renderQuotationPdf } from './pdf';
import { renderQuotationDocx } from './docx';
import { renderQuotationXlsx } from './xlsx';
import { buildDocumentData, type QuotationDocumentData, type CompanySnapshot } from '@/lib/services/quotations';
import { sanitizeFileName } from '@/lib/utils';

/**
 * Façade d'export : produit le document réel du devis enregistré dans le format demandé.
 * Aucun fichier statique : tout est généré à partir des données en base.
 */

export type ExportFormat = 'pdf' | 'docx' | 'xlsx';

export const EXPORT_FORMATS: { value: ExportFormat; label: string; extension: string; mimeType: string; description: string }[] = [
  {
    value: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'Document prêt à imprimer et à envoyer, texte sélectionnable.',
  },
  {
    value: 'docx',
    label: 'Word',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description: 'Document Word entièrement modifiable (tableaux et styles conservés).',
  },
  {
    value: 'xlsx',
    label: 'Excel',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'Classeur Excel avec formules, formats de devise et mise en page d’impression.',
  },
];

export interface GeneratedDocument {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  format: ExportFormat;
}

/** Nom de fichier normalisé : MON-DEVIS_DEV-2026-0001_CLIENT.pdf */
export function buildFileName(quotationNumber: string, customerName: string | null | undefined, format: ExportFormat): string {
  const extension = EXPORT_FORMATS.find((entry) => entry.value === format)?.extension ?? format;
  const customer = sanitizeFileName(customerName || 'CLIENT').toUpperCase();
  const number = sanitizeFileName(quotationNumber).toUpperCase();
  return `MON-DEVIS_${number}_${customer}.${extension}`;
}

export interface GenerateOptions {
  organizationId: string;
  quotationId: string;
  format: ExportFormat;
  watermark?: boolean;
  footerNote?: string | null;
}

/** Charge le devis, prépare les données de rendu puis génère le document. */
export async function generateQuotationDocument(options: GenerateOptions): Promise<GeneratedDocument> {
  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.organizationId, options.organizationId), eq(quotations.id, options.quotationId)))
    .limit(1);

  if (!quotation) throw new Error('Devis introuvable.');

  const items = await db.query.quotationItems.findMany({
    where: (table, { eq: equals }) => equals(table.quotationId, options.quotationId),
    orderBy: (table, { asc }) => [asc(table.position)],
  });

  const company = quotation.companySnapshot as unknown as CompanySnapshot | null;
  const logoDataUri = await loadImageDataUri(company?.logoUrl ?? null);

  const data = buildDocumentData({
    quotation,
    items,
    watermark: options.watermark,
    logoDataUri,
  });

  const format = EXPORT_FORMATS.find((entry) => entry.value === options.format);
  if (!format) throw new Error(`Format d'export inconnu : ${options.format}`);

  const buffer = await renderDocument(data, options);

  return {
    buffer,
    fileName: buildFileName(quotation.number, data.customer?.companyName || data.customer?.name, options.format),
    mimeType: format.mimeType,
    format: options.format,
  };
}

/** Rendu bas niveau à partir de données déjà assemblées (utilisé par les tests). */
export async function renderDocument(data: QuotationDocumentData, options: { format: ExportFormat; watermark?: boolean; footerNote?: string | null }): Promise<Buffer> {
  switch (options.format) {
    case 'pdf':
      return renderQuotationPdf(data, { watermark: options.watermark, footerNote: options.footerNote });
    case 'docx':
      return renderQuotationDocx(data, { watermark: options.watermark });
    case 'xlsx':
      return renderQuotationXlsx(data);
    default:
      throw new Error(`Format d'export inconnu : ${options.format}`);
  }
}
