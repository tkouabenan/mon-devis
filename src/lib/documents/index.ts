import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { customers, quotations } from '@/db/schema';
import { buildDocumentData, type QuotationDocumentData } from '@/lib/quotation-document';
import { listItems } from '@/lib/services/quotations';
import { renderQuotationPdf, type PdfOptions } from '@/lib/documents/pdf';
import { renderQuotationDocx } from '@/lib/documents/docx';
import { renderQuotationXlsx } from '@/lib/documents/xlsx';
import { prepareLogo } from '@/lib/documents/logo';

/**
 * Façade des exports de documents.
 *
 *   generateQuotationDocument({ organizationId, quotationId, format: 'pdf' })
 *
 * Charge le devis depuis la base, assemble les données de rendu puis délègue
 * au générateur du format demandé. Les exports sont toujours recalculés depuis
 * les lignes stockées : impossible de produire un PDF incohérent avec l'écran.
 */

export type ExportFormat = 'pdf' | 'docx' | 'xlsx';

export interface ExportFormatDefinition {
  format: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
  description: string;
}

export const EXPORT_FORMATS: ExportFormatDefinition[] = [
  {
    format: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'Prêt à envoyer : mise en page A4, texte sélectionnable, plusieurs pages si nécessaire.',
  },
  {
    format: 'docx',
    label: 'Word',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description: 'Entièrement éditable dans Word, LibreOffice ou Google Docs.',
  },
  {
    format: 'xlsx',
    label: 'Excel',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'Tableur avec formules : quantités, remises, TVA et totaux recalculés automatiquement.',
  },
];

export function getExportFormat(format: string): ExportFormatDefinition {
  return EXPORT_FORMATS.find((definition) => definition.format === format) ?? EXPORT_FORMATS[0];
}

/**
 * Nom de fichier normalisé : MON-DEVIS_DEV-2026-0001_CLIENT.pdf
 *
 * Les accents sont translittérés et les séparateurs normalisés car ce nom
 * traverse des systèmes de fichiers, des clients de messagerie et des URL.
 */
export function buildFileName(quotationNumber: string, customerName: string | null | undefined, format: ExportFormat): string {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

  const safeNumber = normalize(quotationNumber || 'DEVIS') || 'DEVIS';
  const safeCustomer = normalize(customerName || 'CLIENT') || 'CLIENT';
  return `MON-DEVIS_${safeNumber}_${safeCustomer}.${getExportFormat(format).extension}`;
}

export interface GenerateDocumentOptions {
  organizationId: string;
  quotationId: string;
  format: ExportFormat;
  /** Forcé par la formule d'abonnement (plan gratuit). */
  watermark?: boolean;
}

export interface GeneratedDocument {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  format: ExportFormat;
  quotationNumber: string;
  customerName: string | null;
  /**
   * Valeur de la tête de lecture du navigateur : les documents sont transmis
   * via une réponse HTTP, jamais écrits sur le disque du serveur.
   */
  size: number;
}

export async function generateQuotationDocument(options: GenerateDocumentOptions): Promise<GeneratedDocument> {
  const { organizationId, quotationId, format } = options;

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId), isNull(quotations.deletedAt)))
    .limit(1);

  if (!quotation) {
    throw new Error('Devis introuvable.');
  }

  const items = await listItems(quotationId);

  const logoUrl = (quotation.companySnapshot as { logoUrl?: string | null } | null)?.logoUrl ?? null;

  const preparedLogo = await prepareLogo(logoUrl);

  const data = buildDocumentData({
    quotation,
    items,
    watermark: options.watermark ?? false,
    logoDataUri: preparedLogo?.dataUri ?? null,
  });

  const buffer = await renderDocument(data, { format, watermark: options.watermark });
  const customerName = data.customer?.companyName || data.customer?.name || null;

  return {
    buffer,
    fileName: buildFileName(quotation.number, customerName, format),
    mimeType: getExportFormat(format).mimeType,
    format,
    quotationNumber: quotation.number,
    customerName,
    size: buffer.byteLength,
  };
}

export interface RenderDocumentOptions {
  format: ExportFormat;
  /** Filigrane « MON DEVIS » (plan gratuit). */
  watermark?: boolean;
  /** Mention de bas de page (ex. lien d'acceptation en ligne). */
  footerNote?: string;
}

/** Rendu pur (aucun accès base) : utilisé par l'API, les tests et les aperçus. */
export async function renderDocument(data: QuotationDocumentData, options: RenderDocumentOptions): Promise<Buffer> {
  switch (options.format) {
    case 'pdf':
      return renderQuotationPdf(data, { watermark: options.watermark, footerNote: options.footerNote });
    case 'docx':
      return renderQuotationDocx(data);
    case 'xlsx':
      return renderQuotationXlsx(data);
    default:
      throw new Error(`Format d'export inconnu : ${String(options.format)}`);
  }
}

/** Charge un devis et ses données de rendu (aperçu, impression, partage). */
export async function getQuotationDocumentData(organizationId: string, quotationId: string): Promise<QuotationDocumentData> {
  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId), isNull(quotations.deletedAt)))
    .limit(1);

  if (!quotation) throw new Error('Devis introuvable.');

  const items = await listItems(quotationId);
  const logoUrl = (quotation.companySnapshot as { logoUrl?: string | null } | null)?.logoUrl ?? null;
  const preparedLogo = await prepareLogo(logoUrl);

  return buildDocumentData({ quotation, items, logoDataUri: preparedLogo?.dataUri ?? null });
}

export { renderQuotationPdf, renderQuotationDocx, renderQuotationXlsx };
export type { QuotationDocumentData };
