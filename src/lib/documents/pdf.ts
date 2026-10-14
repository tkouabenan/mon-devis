import PDFDocument from 'pdfkit';
import { currencyDecimals, getCurrency } from '@/lib/currency';
import type { QuotationDocumentData } from '@/lib/services/quotations';
import type { TemplateStyle } from '@/lib/templates';

/**
 * Génération PDF des devis (A4, texte sélectionnable, prêt à imprimer).
 *
 * Le document reprend fidèlement les données enregistrées (logo, coordonnées,
 * lignes, remises, TVA, conditions) et gère automatiquement les sauts de page,
 * la répétition de l'en-tête de tableau et la numérotation des pages.
 */

/** Convertit toute valeur numérique (Decimal, chaîne, nombre) en nombre sûr. */
function toNumeric(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const candidate = value as { toNumber?: () => number; toString: () => string };
  if (typeof candidate.toNumber === 'function') {
    const parsed = candidate.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(candidate.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

const PAGE = { width: 595.28, height: 841.89 };
const FOOTER_RESERVED = 56;

export interface PdfOptions {
  watermark?: boolean;
  /** Mention affichée dans le pied de page (ex. validité de l'acceptation en ligne). */
  footerNote?: string | null;
}

interface Cursor {
  y: number;
}

/** pdfkit (polices standard WinAnsi) ne gère pas les espaces fines insécables d'Intl. */
function pdfSafe(value: string): string {
  return value
    .replace(/\u202f|\u00a0|\u2009|\u2007|\u2060/g, ' ')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/…/g, '...')
    .replace(/\u2026/g, '...');
}

function formatAmount(value: unknown, currency: string, locale: string): string {
  const decimals = currencyDecimals(currency);
  const safe = toNumeric(value);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
  return pdfSafe(`${formatted} ${getCurrency(currency).symbol}`);
}

function formatNumber(value: unknown, decimals = 2): string {
  const safe = toNumeric(value);
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(safe);
  return pdfSafe(formatted);
}

function formatDateFr(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return pdfSafe(
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date),
  );
}

function addressLines(entity: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}): string[] {
  const lines: string[] = [];
  if (entity.addressLine1) lines.push(entity.addressLine1);
  if (entity.addressLine2) lines.push(entity.addressLine2);
  const cityLine = [entity.postalCode, entity.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (entity.country) lines.push(entity.country);
  return lines.map(pdfSafe);
}

function splitToWidth(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.widthOfString(candidate) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (doc.widthOfString(word) > width) {
        // Découpe des mots très longs (URL, référence…).
        let chunk = '';
        for (const char of word) {
          if (doc.widthOfString(chunk + char) <= width) chunk += char;
          else {
            lines.push(chunk);
            chunk = char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function renderQuotationPdf(data: QuotationDocumentData, options: PdfOptions = {}): Promise<Buffer> {
  const { quotation, items, company, customer, terms, style, totals } = data;
  const locale = quotation.locale || 'fr-FR';
  const currency = quotation.currency;

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: style.pagePadding, bottom: style.pagePadding, left: style.pagePadding, right: style.pagePadding },
    bufferPages: true,
    info: {
      Title: `${quotation.title} ${quotation.number}`,
      Author: company?.name ?? 'MON DEVIS',
      Subject: `Devis ${quotation.number}`,
      Creator: 'MON DEVIS',
      Producer: 'MON DEVIS',
    },
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const marginLeft = style.pagePadding;
  const contentWidth = PAGE.width - style.pagePadding * 2;
  const right = PAGE.width - style.pagePadding;

  const headingFont = style.typography.headingFont;
  const bodyFont = style.typography.bodyFont;
  const baseSize = style.typography.baseSize;

  const cursor: Cursor = { y: style.pagePadding };

  const newPage = () => {
    doc.addPage();
    cursor.y = style.pagePadding;
  };

  const ensureSpace = (needed: number) => {
    if (cursor.y + needed > PAGE.height - FOOTER_RESERVED - style.pagePadding) newPage();
  };

  // ---------------------------------------------------------------------
  // En-tête du document selon le modèle
  // ---------------------------------------------------------------------
  const logo = data.logoDataUri;

  const drawLogo = (x: number, y: number, maxWidth: number, maxHeight: number, align: 'left' | 'right' = 'left'): number => {
    if (!style.visibility.logo || !logo) return 0;
    const buffer = Buffer.from(logo.split(',')[1] ?? '', 'base64');
    if (buffer.byteLength === 0) return 0;
    try {
      const scaled = (doc as unknown as { openImage: (input: Buffer) => { width: number; height: number } }).openImage(buffer);
      const ratio = scaled.width / scaled.height;
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      const drawX = align === 'right' ? x - width : x;
      doc.image(buffer, drawX, y, { width, height });
      return height;
    } catch {
      return 0;
    }
  };

  const companyName = pdfSafe(company?.name ?? '');
  const companyContacts = [
    ...addressLines(company ?? {}),
    company?.phone ? `Tél. : ${company.phone}` : null,
    company?.email ? company.email : null,
    company?.website ? company.website : null,
    company?.registrationNumber ? `RCCM : ${company.registrationNumber}` : null,
    company?.taxId ? `N° contribuable : ${company.taxId}` : null,
  ].filter(Boolean) as string[];

  const titleText = pdfSafe((quotation.title || 'Devis').toUpperCase());

  const drawTitleBlock = (x: number, y: number, width: number, align: 'left' | 'right', color: string) => {
    doc.fillColor(color).font(headingFont).fontSize(style.typography.titleSize);
    doc.text(titleText, x, y, { width, align: align === 'right' ? 'right' : 'left', characterSpacing: style.typography.letterSpacing });
    doc.font(bodyFont).fontSize(baseSize + 1).fillColor(style.colors.muted);
    doc.text(pdfSafe(`N° ${quotation.number}`), x, doc.y + 2, { width, align: align === 'right' ? 'right' : 'left' });
    return doc.y;
  };

  const drawCompanyBlock = (x: number, y: number, width: number, align: 'left' | 'right' = 'left') => {
    doc.fillColor(style.colors.secondary).font(headingFont).fontSize(baseSize + 2);
    doc.text(companyName || 'Votre entreprise', x, y, { width, align });
    doc.font(bodyFont).fontSize(baseSize - 0.5).fillColor(style.colors.muted);
    companyContacts.forEach((line) => {
      doc.text(pdfSafe(line), { width, align });
    });
    return doc.y;
  };

  const metaRows = [
    ['Date d’émission', formatDateFr(quotation.issueDate)],
    ...(style.visibility.validityDate && quotation.validUntil ? [['Valable jusqu’au', formatDateFr(quotation.validUntil)]] : []),
    ['Devise', pdfSafe(currency)],
    ...(quotation.reference ? [['Référence', pdfSafe(quotation.reference)]] : []),
    ...(quotation.customerReference ? [['Réf. client', pdfSafe(quotation.customerReference)]] : []),
  ] as [string, string][];

  const drawMetaTable = (x: number, y: number, width: number) => {
    doc.font(bodyFont).fontSize(baseSize - 0.5);
    let currentY = y;
    metaRows.forEach(([label, value]) => {
      doc.fillColor(style.colors.muted).text(label, x, currentY, { width: width * 0.45, continued: false });
      doc.fillColor(style.colors.text).text(value, x + width * 0.45, currentY, { width: width * 0.55, align: 'right' });
      currentY = doc.y + 3;
    });
    return currentY;
  };

  const headerHeight = 118;

  switch (style.layout.header) {
    case 'banner': {
      doc.rect(0, 0, PAGE.width, headerHeight).fill(style.colors.headerBackground);
      const logoHeight = drawLogo(marginLeft, 30, 150, 52);
      doc.fillColor(style.colors.headerText).font(headingFont).fontSize(18);
      doc.text(titleText, marginLeft, logoHeight > 0 ? 34 + logoHeight : 48, { width: contentWidth * 0.6 });
      doc.font(bodyFont).fontSize(baseSize + 1);
      doc.text(pdfSafe(`N° ${quotation.number}`), marginLeft, doc.y + 2, { width: contentWidth * 0.6 });
      doc.font(bodyFont).fontSize(baseSize).fillColor(style.colors.headerText);
      doc.text(
        pdfSafe(companyName),
        marginLeft + contentWidth * 0.62,
        40,
        { width: contentWidth * 0.38, align: 'right' },
      );
      doc.fontSize(baseSize - 1);
      [company?.city, company?.country, company?.phone, company?.email].filter(Boolean).slice(0, 4).forEach((line) => {
        doc.text(pdfSafe(String(line)), { width: contentWidth * 0.38, align: 'right' });
      });
      cursor.y = headerHeight + 22;
      const metaBottom = drawMetaTable(marginLeft + contentWidth * 0.55, cursor.y, contentWidth * 0.45);
      const customerBottom = drawCustomerBlock(marginLeft, cursor.y, contentWidth * 0.48);
      cursor.y = Math.max(metaBottom, customerBottom) + style.sectionGap * 0.5;
      break;
    }
    case 'split': {
      const leftWidth = contentWidth * 0.55;
      const logoHeight = drawLogo(marginLeft, cursor.y, 130, 46);
      const companyY = cursor.y + (logoHeight > 0 ? logoHeight + 10 : 0);
      const companyBottom = drawCompanyBlock(marginLeft, companyY, leftWidth);
      doc.rect(marginLeft + contentWidth * 0.58, cursor.y, contentWidth * 0.42, 74).fill(style.colors.primary);
      doc.fillColor('#FFFFFF').font(headingFont).fontSize(style.typography.titleSize - 2);
      doc.text(titleText, marginLeft + contentWidth * 0.58 + 14, cursor.y + 16, {
        width: contentWidth * 0.42 - 28,
        align: 'left',
      });
      doc.font(bodyFont).fontSize(baseSize + 1);
      doc.text(pdfSafe(`N° ${quotation.number}`), { width: contentWidth * 0.42 - 28 });
      doc.fontSize(baseSize - 0.5);
      doc.text(formatDateFr(quotation.issueDate), { width: contentWidth * 0.42 - 28 });
      if (style.visibility.validityDate && quotation.validUntil) {
        doc.text(pdfSafe(`Valable jusqu’au ${formatDateFr(quotation.validUntil)}`), { width: contentWidth * 0.42 - 28 });
      }
      cursor.y = Math.max(companyBottom, cursor.y + 74) + style.sectionGap * 0.6;
      cursor.y = drawCustomerBlock(marginLeft, cursor.y, contentWidth * 0.6) + style.sectionGap * 0.5;
      break;
    }
    case 'classic': {
      const logoHeight = drawLogo(marginLeft, cursor.y, 130, 48);
      const companyBottom = drawCompanyBlock(marginLeft, cursor.y + (logoHeight > 0 ? logoHeight + 10 : 0), contentWidth * 0.55);
      const titleBottom = drawTitleBlock(marginLeft + contentWidth * 0.55, cursor.y + 4, contentWidth * 0.45, 'right', style.colors.primary);
      cursor.y = Math.max(companyBottom, titleBottom) + 16;
      doc.moveTo(marginLeft, cursor.y).lineTo(right, cursor.y).lineWidth(0.8).strokeColor(style.colors.border).stroke();
      cursor.y += 16;
      cursor.y = drawMetaTable(marginLeft + contentWidth * 0.55, cursor.y, contentWidth * 0.45);
      const customerBottom = drawCustomerBlock(marginLeft, cursor.y < cursor.y ? cursor.y : cursor.y, contentWidth * 0.5);
      cursor.y = Math.max(cursor.y, customerBottom) + style.sectionGap * 0.5;
      break;
    }
    default: {
      // « minimal »
      doc.fillColor(style.colors.secondary).font(headingFont).fontSize(style.typography.titleSize);
      doc.text(titleText, marginLeft, cursor.y, { width: contentWidth * 0.5 });
      doc.font(bodyFont).fontSize(baseSize + 1).fillColor(style.colors.primary);
      doc.text(pdfSafe(`N° ${quotation.number}`), marginLeft, doc.y + 2, { width: contentWidth * 0.5 });
      const logoHeight = drawLogo(right, cursor.y, 120, 44, 'right');
      doc.font(bodyFont).fontSize(baseSize).fillColor(style.colors.text);
      doc.text(pdfSafe(companyName), marginLeft + contentWidth * 0.55, cursor.y + (logoHeight > 0 ? logoHeight + 6 : 0), {
        width: contentWidth * 0.45,
        align: 'right',
      });
      doc.fontSize(baseSize - 0.5).fillColor(style.colors.muted);
      companyContacts.slice(0, 4).forEach((line) => {
        doc.text(pdfSafe(line), { width: contentWidth * 0.45, align: 'right' });
      });
      cursor.y = Math.max(doc.y, cursor.y + 60) + 18;
      doc.moveTo(marginLeft, cursor.y).lineTo(right, cursor.y).lineWidth(0.8).strokeColor(style.colors.border).stroke();
      cursor.y += 16;
      const metaBottom = drawMetaTable(marginLeft + contentWidth * 0.55, cursor.y, contentWidth * 0.45);
      const customerBottom = drawCustomerBlock(marginLeft, cursor.y, contentWidth * 0.5);
      cursor.y = Math.max(metaBottom, customerBottom) + style.sectionGap * 0.5;
      break;
    }
  }

  function drawCustomerBlock(x: number, y: number, width: number): number {
    doc.fillColor(style.colors.muted).font(bodyFont).fontSize(baseSize - 1.5);
    doc.text(pdfSafe('ADRESSE AU CLIENT'), x, y, { width, characterSpacing: 0.6 });
    doc.fillColor(style.colors.secondary).font(headingFont).fontSize(baseSize + 1);
    doc.text(pdfSafe(customer?.companyName || customer?.name || 'Client à préciser'), x, doc.y + 3, { width });
    doc.font(bodyFont).fontSize(baseSize - 0.5).fillColor(style.colors.text);
    if (customer?.companyName && customer?.name) doc.text(pdfSafe(customer.name), { width });
    addressLines(customer ?? {}).forEach((line) => doc.text(pdfSafe(line), { width }));
    if (customer?.phone) doc.text(pdfSafe(`Tél. : ${customer.phone}`), { width });
    if (customer?.email) doc.text(pdfSafe(customer.email), { width });
    if (customer?.taxId) doc.text(pdfSafe(`N° contribuable : ${customer.taxId}`), { width });
    return doc.y;
  }

  // ---------------------------------------------------------------------
  // Tableau des lignes
  // ---------------------------------------------------------------------
  const showUnitColumn = style.visibility.unitColumn;
  const showDiscountColumn = style.visibility.discountColumn;
  const showTaxColumn = style.visibility.taxColumn;

  const columns = (() => {
    const list: { key: string; label: string; width: number; align: 'left' | 'right' | 'center' }[] = [];
    const numericWidth = (fraction: number) => contentWidth * fraction;
    list.push({ key: 'designation', label: 'Désignation', width: 0, align: 'left' });
    if (showUnitColumn) list.push({ key: 'unit', label: 'Unité', width: 0.09, align: 'center' });
    list.push({ key: 'quantity', label: 'Qté', width: 0.09, align: 'right' });
    list.push({
      key: 'unitPrice',
      label: quotation.pricesIncludeTax ? 'P.U. TTC' : 'P.U. HT',
      width: 0.14,
      align: 'right',
    });
    if (showDiscountColumn) list.push({ key: 'discount', label: 'Remise', width: 0.11, align: 'right' });
    if (showTaxColumn) list.push({ key: 'tax', label: 'TVA', width: 0.09, align: 'right' });
    list.push({ key: 'total', label: quotation.pricesIncludeTax ? 'Total TTC' : 'Total HT', width: 0.15, align: 'right' });

    const fixed = list.filter((column) => column.width > 0).reduce((sum, column) => sum + column.width, 0);
    const designation = list.find((column) => column.key === 'designation')!;
    designation.width = 1 - fixed;
    list.forEach((column) => {
      if (column.key !== 'designation') column.width = numericWidth(column.width);
    });
    designation.width = numericWidth(designation.width);
    return list;
  })();

  const cellPadding = style.table.cellPadding * 0.4;
  const headerRowHeight = 22;

  const drawTableHeader = (y: number) => {
    const headerFill = style.table.headerStyle === 'filled' ? style.colors.tableHeaderBackground : null;
    if (headerFill) doc.rect(marginLeft, y, contentWidth, headerRowHeight).fill(headerFill);
    doc.font(headingFont).fontSize(baseSize - 1).fillColor(style.colors.tableHeaderText);
    let x = marginLeft;
    columns.forEach((column) => {
      const textX = column.align === 'right' ? x : x + cellPadding;
      const textWidth = column.align === 'right' ? column.width - cellPadding : column.width - cellPadding;
      doc.text(pdfSafe(column.label.toUpperCase()), textX, y + 7, {
        width: textWidth,
        align: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
        characterSpacing: 0.4,
      });
      x += column.width;
    });
    if (style.table.headerStyle === 'underlined') {
      doc.moveTo(marginLeft, y + headerRowHeight).lineTo(right, y + headerRowHeight).lineWidth(0.8).strokeColor(style.colors.primary).stroke();
    } else if (style.table.headerStyle === 'plain') {
      doc.moveTo(marginLeft, y + headerRowHeight).lineTo(right, y + headerRowHeight).lineWidth(0.5).strokeColor(style.colors.border).stroke();
    }
    return y + headerRowHeight;
  };

  ensureSpace(80);
  doc.fillColor(style.colors.muted).font(bodyFont).fontSize(baseSize - 1.5);
  doc.text(pdfSafe('DÉTAIL DES PRESTATIONS'), marginLeft, cursor.y, { width: contentWidth, characterSpacing: 0.6 });
  cursor.y = doc.y + 6;
  cursor.y = drawTableHeader(cursor.y);

  const rowValues = items.map((item, index) => {
    const line = totals.lines[index];
    const discountLabel =
      item.discountType === 'PERCENTAGE'
        ? `${formatNumber(item.discountValue, 2)} %`
        : Number(item.discountValue) > 0
          ? formatAmount(item.discountValue, currency, locale)
          : '—';
    return {
      item,
      line,
      designation: item.name,
      description: item.description,
      unit: item.unit,
      quantity: formatNumber(item.quantity, 2),
      unitPrice: formatAmount(item.unitPrice, currency, locale),
      discount: discountLabel,
      tax: `${formatNumber(item.taxRate, 2)} %`,
      total: formatAmount(quotation.pricesIncludeTax ? line.lineTotal : line.lineNet, currency, locale),
    };
  });

  const drawRow = (row: (typeof rowValues)[number], index: number) => {
    const designationWidth = columns[0].width - cellPadding * 2;
    doc.font(bodyFont).fontSize(baseSize);
    const nameLines = splitToWidth(doc, pdfSafe(row.designation), designationWidth);
    const descLines =
      style.visibility.itemDescriptions && row.description
        ? splitToWidth(doc.font(bodyFont).fontSize(baseSize - 1), pdfSafe(row.description), designationWidth)
        : [];
    const rowHeight = Math.max(19, nameLines.length * (baseSize + 3) + descLines.length * (baseSize + 1) + 9);

    ensureSpace(rowHeight + 4);
    if (cursor.y === style.pagePadding) {
      // Nouvelle page : répéter l'en-tête de tableau.
      cursor.y = drawTableHeader(cursor.y);
    }

    if (style.table.style === 'striped' && index % 2 === 1) {
      doc.rect(marginLeft, cursor.y, contentWidth, rowHeight).fill(style.colors.tableAltRow);
    }
    if (style.table.style === 'boxed') {
      doc.rect(marginLeft, cursor.y, contentWidth, rowHeight).lineWidth(0.4).strokeColor(style.colors.border).stroke();
    }
    if (style.table.style === 'lined' && index > 0) {
      doc.moveTo(marginLeft, cursor.y).lineTo(right, cursor.y).lineWidth(0.4).strokeColor(style.colors.border).stroke();
    }

    let x = marginLeft;
    // Désignation + description
    doc.fillColor(style.colors.text).font(bodyFont).fontSize(baseSize);
    let textY = cursor.y + 6;
    nameLines.forEach((line) => {
      doc.text(line, x + cellPadding, textY, { width: designationWidth });
      textY += baseSize + 3;
    });
    if (descLines.length > 0) {
      doc.fillColor(style.colors.muted).fontSize(baseSize - 1);
      descLines.forEach((line) => {
        doc.text(line, x + cellPadding, textY, { width: designationWidth });
        textY += baseSize + 1;
      });
    }
    x += columns[0].width;

    columns.slice(1).forEach((column) => {
      const value =
        column.key === 'unit'
          ? pdfSafe(row.unit ?? '')
          : column.key === 'quantity'
            ? row.quantity
            : column.key === 'unitPrice'
              ? row.unitPrice
              : column.key === 'discount'
                ? row.discount
                : column.key === 'tax'
                  ? row.tax
                  : row.total;
      doc.font(bodyFont).fontSize(baseSize).fillColor(style.colors.text);
      doc.text(value, x, cursor.y + 6, { width: column.width - cellPadding, align: 'right' });
      x += column.width;
    });

    if (style.table.style === 'boxed') {
      let dividerX = marginLeft;
      columns.forEach((column, columnIndex) => {
        dividerX += column.width;
        if (columnIndex < columns.length - 1) {
          doc.moveTo(dividerX, cursor.y).lineTo(dividerX, cursor.y + rowHeight).lineWidth(0.4).strokeColor(style.colors.border).stroke();
        }
      });
    }

    cursor.y += rowHeight;
  };

  rowValues.forEach(drawRow);

  if (rowValues.length === 0) {
    ensureSpace(40);
    doc.fillColor(style.colors.muted).font(bodyFont).fontSize(baseSize);
    doc.text(pdfSafe('Aucune ligne enregistrée sur ce devis.'), marginLeft + cellPadding, cursor.y + 8, { width: contentWidth - cellPadding });
    cursor.y += 32;
  }

  doc.moveTo(marginLeft, cursor.y).lineTo(right, cursor.y).lineWidth(0.8).strokeColor(style.colors.border).stroke();
  cursor.y += 14;

  // ---------------------------------------------------------------------
  // Totaux
  // ---------------------------------------------------------------------
  const totalsWidth = Math.min(280, contentWidth * 0.55);
  const totalsX = right - totalsWidth;

  const totalsRows: { label: string; value: string; emphasis?: boolean; muted?: boolean }[] = [];
  totalsRows.push({ label: 'Sous-total', value: formatAmount(totals.subtotal, currency, locale), muted: true });
  if (Number(totals.lineDiscountTotal) > 0) {
    totalsRows.push({ label: 'Remises sur lignes', value: `- ${formatAmount(totals.lineDiscountTotal, currency, locale)}`, muted: true });
  }
  if (Number(totals.globalDiscountTotal) > 0) {
    totalsRows.push({ label: 'Remise globale', value: `- ${formatAmount(totals.globalDiscountTotal, currency, locale)}`, muted: true });
  }
  totalsRows.push({ label: 'Total HT', value: formatAmount(totals.netBeforeTax, currency, locale) });
  if (style.visibility.taxBreakdown && totals.taxBreakdown.length > 0) {
    totals.taxBreakdown.forEach((entry) => {
      totalsRows.push({
        label: `TVA ${formatNumber(entry.taxRate, 2)} %`,
        value: formatAmount(entry.amount, currency, locale),
        muted: true,
      });
    });
  } else {
    totalsRows.push({ label: 'TVA', value: formatAmount(totals.taxTotal, currency, locale), muted: true });
  }
  totalsRows.push({ label: 'Total TTC', value: formatAmount(totals.total, currency, locale), emphasis: true });
  if (Number(totals.depositAmount) > 0) {
    totalsRows.push({ label: 'Acompte à la commande', value: formatAmount(totals.depositAmount, currency, locale), muted: true });
    totalsRows.push({ label: 'Reste à payer', value: formatAmount(totals.amountDue, currency, locale), emphasis: true });
  }

  const totalsRowHeight = 17;
  const totalsHeight = totalsRows.length * totalsRowHeight + 16;
  ensureSpace(totalsHeight + 10);

  if (style.layout.highlightedTotal) {
    doc.rect(totalsX - 10, cursor.y - 4, totalsWidth + 10, totalsHeight + 4).fillOpacity(0.06).fill(style.colors.primary).fillOpacity(1);
  }

  let totalsY = cursor.y + 4;
  totalsRows.forEach((row, index) => {
    const isTotalLine = row.emphasis && row.label === 'Total TTC';
    if (isTotalLine) {
      doc.rect(totalsX - 10, totalsY - 3, totalsWidth + 10, totalsRowHeight + 6).fill(style.colors.primary);
      doc.fillColor('#FFFFFF').font(headingFont).fontSize(baseSize + 1.5);
    } else {
      doc.fillColor(row.muted ? style.colors.muted : style.colors.text)
        .font(row.emphasis ? headingFont : bodyFont)
        .fontSize(baseSize + (row.emphasis ? 1 : 0));
    }
    doc.text(pdfSafe(row.label), totalsX, totalsY, { width: totalsWidth * 0.55 });
    doc.text(pdfSafe(row.value), totalsX + totalsWidth * 0.45, totalsY, { width: totalsWidth * 0.55 - 8, align: 'right' });
    totalsY += totalsRowHeight + (isTotalLine ? 6 : 0);
    if (index === totalsRows.length - 1) totalsY += 0;
  });

  cursor.y = totalsY + style.sectionGap * 0.4;

  // ---------------------------------------------------------------------
  // Conditions, paiement, notes
  // ---------------------------------------------------------------------
  const sectionBlocks: { title: string; body: string }[] = [];
  const pushBlock = (title: string, value: string | null | undefined) => {
    if (value && value.trim().length > 0) sectionBlocks.push({ title, body: value.trim() });
  };

  if (style.visibility.terms) {
    pushBlock('Validité du devis', terms.validityPeriod);
    pushBlock('Conditions de paiement', terms.paymentTerms);
    pushBlock('Délai de livraison / exécution', terms.deliveryTime);
    pushBlock('Garantie', terms.warranty);
    pushBlock('Conditions particulières', terms.specialConditions);
    pushBlock('Mentions légales', terms.legalMentions);
    (terms.blocks ?? []).forEach((block) => pushBlock(block.label, block.content));
  }
  if (style.visibility.paymentInfo) pushBlock('Modalités de règlement', company?.paymentInfo);
  if (style.visibility.bankDetails) pushBlock('Coordonnées bancaires', company?.bankDetails);
  if (style.visibility.notes) pushBlock('Notes', quotation.notes ?? terms.notes);

  if (sectionBlocks.length > 0) {
    ensureSpace(40);
    doc.moveTo(marginLeft, cursor.y).lineTo(right, cursor.y).lineWidth(0.5).strokeColor(style.colors.border).stroke();
    cursor.y += 14;
  }

  sectionBlocks.forEach((block) => {
    doc.font(headingFont).fontSize(baseSize - 1).fillColor(style.colors.muted);
    const labelHeight = doc.heightOfString(pdfSafe(block.title.toUpperCase()), { width: contentWidth });
    doc.font(bodyFont).fontSize(baseSize - 0.5);
    const lines = splitToWidth(doc, pdfSafe(block.body), contentWidth);
    const bodyHeight = lines.length * (baseSize + 2.5);
    ensureSpace(labelHeight + bodyHeight + 16);
    doc.fillColor(style.colors.muted).font(headingFont).fontSize(baseSize - 1);
    doc.text(pdfSafe(block.title.toUpperCase()), marginLeft, cursor.y, { width: contentWidth, characterSpacing: 0.5 });
    doc.fillColor(style.colors.text).font(bodyFont).fontSize(baseSize - 0.5);
    doc.text(lines.join('\n'), marginLeft, doc.y + 3, { width: contentWidth, lineGap: 2 });
    cursor.y = doc.y + 10;
  });

  // ---------------------------------------------------------------------
  // Signatures
  // ---------------------------------------------------------------------
  if (style.visibility.signature) {
    ensureSpace(96);
    const boxWidth = contentWidth * 0.45;
    const boxY = cursor.y + 8;
    doc.font(headingFont).fontSize(baseSize - 1).fillColor(style.colors.muted);
    doc.text(pdfSafe('BON POUR ACCORD — LE CLIENT'), marginLeft, boxY, { width: boxWidth });
    doc.text(pdfSafe('L’ENTREPRISE'), right - boxWidth, boxY, { width: boxWidth, align: 'right' });
    doc.rect(marginLeft, boxY + 16, boxWidth, 54).lineWidth(0.5).strokeColor(style.colors.border).stroke();
    doc.rect(right - boxWidth, boxY + 16, boxWidth, 54).lineWidth(0.5).strokeColor(style.colors.border).stroke();
    doc.font(bodyFont).fontSize(baseSize - 1.5).fillColor(style.colors.muted);
    doc.text(pdfSafe('Date et signature précédées de la mention « Bon pour accord »'), marginLeft, boxY + 74, { width: boxWidth });
    doc.text(pdfSafe(company?.signatureLabel || companyName), right - boxWidth, boxY + 74, { width: boxWidth, align: 'right' });
    cursor.y = boxY + 92;
  }

  // ---------------------------------------------------------------------
  // Filigrane (plan gratuit)
  // ---------------------------------------------------------------------
  if (options.watermark) {
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.save();
      doc.rotate(-30, { origin: [PAGE.width / 2, PAGE.height / 2] });
      doc.fillColor(style.colors.primary).fillOpacity(0.07).font(headingFont).fontSize(62);
      doc.text('MON DEVIS', 0, PAGE.height / 2 - 40, { width: PAGE.width, align: 'center' });
      doc.restore();
      doc.fillOpacity(1);
    }
  }

  // ---------------------------------------------------------------------
  // Pied de page et numérotation
  // ---------------------------------------------------------------------
  const range = doc.bufferedPageRange();
  const legalLine = [
    companyName,
    company?.addressLine1,
    [company?.postalCode, company?.city].filter(Boolean).join(' '),
    company?.country,
    company?.registrationNumber ? `RCCM ${company.registrationNumber}` : null,
    company?.taxId ? `N° contribuable ${company.taxId}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const footerY = PAGE.height - FOOTER_RESERVED + 6;
    if (style.layout.footerBand) {
      doc.rect(0, PAGE.height - FOOTER_RESERVED + 14, PAGE.width, FOOTER_RESERVED - 14).fill(style.colors.headerBackground);
      doc.fillColor(style.colors.headerText);
    } else {
      doc.moveTo(marginLeft, footerY - 6).lineTo(right, footerY - 6).lineWidth(0.5).strokeColor(style.colors.border).stroke();
      doc.fillColor(style.colors.muted);
    }
    doc.font(bodyFont).fontSize(baseSize - 2);
    doc.text(
      pdfSafe(
        options.footerNote
          ? options.footerNote
          : legalLine || `${companyName || 'MON DEVIS'} — Document généré avec MON DEVIS`,
      ),
      marginLeft,
      footerY,
      { width: contentWidth - 70, align: 'left', lineBreak: false, ellipsis: true },
    );
    doc.text(pdfSafe(`Page ${index - range.start + 1} / ${range.count}`), right - 70, footerY, {
      width: 70,
      align: 'right',
    });
  }

  doc.end();
  return done;
}
