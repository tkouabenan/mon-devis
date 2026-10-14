import PDFDocument from 'pdfkit';
import type { QuotationDocumentData } from '@/lib/quotation-document';
import type { TemplateStyle } from '@/lib/templates';

/**
 * Générateur PDF (A4, texte sélectionnable, multi-pages).
 *
 * Principes :
 *  - mise en page A4 portrait, marges issues du modèle ;
 *  - en-tête rejoué sur les pages suivantes, tableau paginé avec ligne d'en-tête répétée ;
 *  - caractères normalisés pour l'encodage WinAnsi des polices standard (pas de tofu) ;
 *  - filigrane « MON DEVIS » sur les devis du plan gratuit.
 */

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4 en points
const FOOTER_RESERVED = 42;

export interface PdfOptions {
  /** Ajoute un filigrane discret (plan gratuit). */
  watermark?: boolean;
  /** Mention complémentaire imprimée dans le pied de page (ex. lien d'acceptation). */
  footerNote?: string;
}

/* -------------------------------------------------------------------------- */
/* Utilitaires texte                                                          */
/* -------------------------------------------------------------------------- */

/**
 * pdfkit encode les polices standard en WinAnsi : certains caractères
 * typographiques (espaces fines insécables d'Intl, tirets longs…) doivent être
 * translittérés, sinon ils apparaissent sous forme de caractères parasites.
 */
const CHAR_REPLACEMENTS: Record<string, string> = {
  '\u202f': ' ',
  '\u00a0': ' ',
  '\u2009': ' ',
  '\u2007': ' ',
  '\u2011': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2019': "'",
  '\u2018': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2026': '...',
  '\u2212': '-',
  '\u00b7': '-',
  '\u2192': '->',
  '\u2044': '/',
};

function pdfText(value: string | null | undefined): string {
  if (!value) return '';
  let output = '';
  for (const character of value) {
    const replacement = CHAR_REPLACEMENTS[character];
    if (replacement !== undefined) {
      output += replacement;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0xff) {
      output += character;
      continue;
    }
    // Latin étendu / typographie courante acceptée par WinAnsi.
    if ('\u20ac\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2020\u2021\u2022\u2030\u2039\u203a\u2122'.includes(character)) {
      output += character;
      continue;
    }
    output += ' ';
  }
  return output.replace(/\s{2,}/g, ' ').trim();
}

function amount(value: unknown, currency: string, decimals?: number): string {
  const numeric = Number(value ?? 0);
  const digits = decimals ?? currencyDecimals(currency);
  const formatted = (Number.isFinite(numeric) ? numeric : 0).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const symbol = currencySymbol(currency);
  // Les devises symboliques (€, $, £) sont collées au montant, les codes (FCFA) en sont séparés.
  const separator = symbol.length > 1 ? ' ' : '\u00a0';
  return pdfText(`${formatted}${separator}${symbol}`);
}

function currencyDecimals(currency: string): number {
  return ['XOF', 'XAF', 'JPY'].includes(currency.toUpperCase()) ? 0 : 2;
}

function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    XOF: 'FCFA',
    XAF: 'FCFA',
    EUR: '€',
    USD: '$',
    GBP: '£',
  };
  return symbols[currency.toUpperCase()] ?? currency.toUpperCase();
}

function quantity(value: unknown): string {
  const numeric = Number(value ?? 0);
  const decimals = Number.isInteger(numeric) ? 0 : 2;
  return pdfText(numeric.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
}

function dateFr(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fontFor(family: string, bold = false, italic = false): string {
  const base = family.replace(/-(Bold|Oblique|Italic)$/i, '');
  if (base === 'Times') return bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman';
  if (base === 'Courier') return bold ? 'Courier-Bold' : 'Courier';
  return bold ? 'Helvetica-Bold' : italic ? 'Helvetica-Oblique' : 'Helvetica';
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(int)) return [0, 0, 0];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function mix(hex: string, ratio: number, target: [number, number, number] = [255, 255, 255]): string {
  const [r, g, b] = hexToRgb(hex);
  const blend = (a: number, t: number) => Math.round(a + (t - a) * ratio);
  return `#${[blend(r, target[0]), blend(g, target[1]), blend(b, target[2])]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

/* -------------------------------------------------------------------------- */
/* Rendu                                                                      */
/* -------------------------------------------------------------------------- */

interface Column {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'right' | 'center';
  flex?: boolean;
}

interface TableOptions {
  /** Largeur disponible. */
  width: number;
  /** Positions absolues des colonnes (pré-calculées). */
  columns: Column[];
}

type Doc = PDFKit.PDFDocument;

export async function renderQuotationPdf(data: QuotationDocumentData, options: PdfOptions = {}): Promise<Buffer> {
  const { quotation, items, company, customer, terms, style, totals, labels } = data;
  const currency = quotation.currency;
  const padding = style.pagePadding;
  const headingFont = style.typography.headingFont;
  const bodyFont = style.typography.bodyFont;
  const baseSize = style.typography.baseSize;
  const muted = style.colors.muted;
  const textColor = style.colors.text;
  const watermark = options.watermark ?? data.watermark;

  const doc = new PDFDocument({
    size: PAGE_SIZE,
    margins: { top: padding, bottom: padding + FOOTER_RESERVED, left: padding, right: padding },
    bufferPages: true,
    info: {
      Title: `${labels.documentTitle} ${quotation.number}`,
      Author: pdfText(company?.name ?? 'MON DEVIS'),
      Subject: pdfText(quotation.title ?? labels.documentTitle),
      Creator: 'MON DEVIS',
      Producer: 'MON DEVIS',
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const contentWidth = doc.page.width - padding * 2;
  const pageBottom = () => doc.page.height - padding - FOOTER_RESERVED;

  /* --- En-tête ---------------------------------------------------------- */

  const companyLines = company
    ? [
        company.addressLine1,
        company.addressLine2,
        [company.postalCode, company.city].filter(Boolean).join(' ') || null,
        company.country,
        company.phone,
        company.email,
        company.website,
        [company.taxId ? `N° fiscal : ${company.taxId}` : null, company.registrationNumber ? `RCCM : ${company.registrationNumber}` : null]
          .filter(Boolean)
          .join(' · ') || null,
      ].filter((line): line is string => Boolean(line && String(line).trim()))
    : [];

  let cursorY = padding;

  if (style.layout.header === 'banner') {
    const bannerHeight = 108;
    doc.save();
    doc.rect(0, 0, doc.page.width, bannerHeight).fill(style.colors.headerBackground);
    if (style.layout.accentBar) doc.rect(0, bannerHeight, doc.page.width, 4).fill(style.colors.accent);
    doc.restore();

    if (data.logoDataUri && style.visibility.logo) {
      drawLogo(doc, data.logoDataUri, padding, 22, 150, 44);
    } else if (company) {
      doc
        .font(headingFont === 'Times-Roman' ? 'Times-Bold' : 'Helvetica-Bold')
        .fontSize(baseSize + 7)
        .fillColor(style.colors.headerText)
        .text(pdfText(company.name), padding, 30, { width: contentWidth * 0.55 });
    }

    doc
      .font(fontFor(headingFont, true))
      .fontSize(style.typography.titleSize)
      .fillColor(style.colors.headerText)
      .text(labels.badge, padding, 26, { width: contentWidth, align: 'right', characterSpacing: style.typography.letterSpacing });
    doc
      .font(fontFor(bodyFont))
      .fontSize(baseSize)
      .fillColor(style.colors.headerText)
      .text(pdfText(quotation.number), padding, 26 + style.typography.titleSize + 4, { width: contentWidth, align: 'right' });
    if (style.visibility.validityDate && quotation.validUntil) {
      doc
        .fontSize(baseSize - 1)
        .text(`${labels.validityLabel} ${dateFr(quotation.validUntil)}`, padding, 26 + style.typography.titleSize + 4 + baseSize + 3, {
          width: contentWidth,
          align: 'right',
        });
    }

    cursorY = bannerHeight + 22;
  } else if (style.layout.header === 'split') {
    const boxWidth = contentWidth * 0.42;
    const boxX = doc.page.width - padding - boxWidth;
    const boxHeight = 92 + (style.visibility.validityDate && quotation.validUntil ? 14 : 0);

    doc.save();
    doc.rect(boxX, padding, boxWidth, boxHeight).fill(style.colors.headerBackground);
    if (style.layout.accentBar) doc.rect(boxX, padding, 4, boxHeight).fill(style.colors.accent);
    doc.restore();

    doc
      .font(fontFor(headingFont, true))
      .fontSize(style.typography.titleSize)
      .fillColor(style.colors.headerText)
      .text(labels.badge, boxX + 16, padding + 16, { width: boxWidth - 32 });
    doc
      .font(fontFor(bodyFont))
      .fontSize(baseSize)
      .fillColor(style.colors.headerText)
      .text(pdfText(quotation.number), boxX + 16, padding + 16 + style.typography.titleSize + 6, { width: boxWidth - 32 });
    doc
      .fontSize(baseSize - 1)
      .text(`Émis le ${dateFr(quotation.issueDate)}`, boxX + 16, padding + 16 + style.typography.titleSize + 6 + baseSize + 4, {
        width: boxWidth - 32,
      });
    if (style.visibility.validityDate && quotation.validUntil) {
      doc.text(`${labels.validityLabel} ${dateFr(quotation.validUntil)}`, boxX + 16, doc.y + 1, { width: boxWidth - 32 });
    }

    let leftY = padding;
    if (data.logoDataUri && style.visibility.logo) {
      const logoHeight = drawLogo(doc, data.logoDataUri, padding, leftY, 150, 46);
      leftY += logoHeight + 8;
    }
    doc
      .font(fontFor(headingFont, true))
      .fontSize(baseSize + 5)
      .fillColor(textColor)
      .text(pdfText(company?.name ?? ''), padding, leftY, { width: contentWidth - boxWidth - 24 });
    leftY = doc.y + 4;
    doc.font(fontFor(bodyFont)).fontSize(baseSize - 1).fillColor(muted);
    for (const line of companyLines) {
      doc.text(pdfText(String(line)), padding, leftY, { width: contentWidth - boxWidth - 24 });
      leftY = doc.y;
    }

    cursorY = Math.max(padding + boxHeight, leftY) + style.sectionGap * 0.7;
  } else {
    // « classic » et « minimal » partagent la même colonne d'en-tête.
    const rightWidth = contentWidth * 0.42;
    const leftWidth = contentWidth - rightWidth - 16;
    let leftY = padding;

    if (data.logoDataUri && style.visibility.logo) {
      const logoHeight = drawLogo(doc, data.logoDataUri, padding, leftY, 140, style.layout.header === 'minimal' ? 40 : 50);
      leftY += logoHeight + 10;
    }

    doc
      .font(fontFor(headingFont, true))
      .fontSize(style.layout.header === 'minimal' ? baseSize + 4 : baseSize + 7)
      .fillColor(textColor)
      .text(pdfText(company?.name ?? ''), padding, leftY, { width: leftWidth });
    leftY = doc.y + 4;

    doc.font(fontFor(bodyFont)).fontSize(baseSize - 1).fillColor(muted);
    for (const line of companyLines) {
      doc.text(pdfText(String(line)), padding, leftY, { width: leftWidth });
      leftY = doc.y;
    }

    const rightX = doc.page.width - padding - rightWidth;
    let rightY = padding;
    doc
      .font(fontFor(headingFont, true))
      .fontSize(style.typography.titleSize)
      .fillColor(style.colors.primary)
      .text(labels.badge, rightX, rightY, {
        width: rightWidth,
        align: 'right',
        characterSpacing: style.typography.letterSpacing,
      });
    rightY = doc.y + 4;
    doc.font(fontFor(bodyFont)).fontSize(baseSize).fillColor(textColor).text(pdfText(quotation.number), rightX, rightY, {
      width: rightWidth,
      align: 'right',
    });
    rightY = doc.y + 2;
    doc.fontSize(baseSize - 1).fillColor(muted);
    doc.text(`Émis le ${dateFr(quotation.issueDate)}`, rightX, rightY, { width: rightWidth, align: 'right' });
    rightY = doc.y;
    if (style.visibility.validityDate && quotation.validUntil) {
      doc.text(`${labels.validityLabel} ${dateFr(quotation.validUntil)}`, rightX, rightY, { width: rightWidth, align: 'right' });
      rightY = doc.y;
    }
    if (quotation.reference) {
      doc.text(`Référence : ${pdfText(quotation.reference)}`, rightX, rightY, { width: rightWidth, align: 'right' });
      rightY = doc.y;
    }

    cursorY = Math.max(leftY, rightY) + 10;
    doc
      .moveTo(padding, cursorY)
      .lineTo(doc.page.width - padding, cursorY)
      .lineWidth(0.8)
      .strokeColor(style.colors.border)
      .stroke();
    cursorY += style.sectionGap * 0.6;
  }

  /* --- Bandeau client + méta -------------------------------------------- */

  const clientBoxWidth = contentWidth * 0.56;
  const metaBoxWidth = contentWidth - clientBoxWidth - 16;
  const boxTop = cursorY;

  if (customer) {
    doc
      .font(fontFor(headingFont, true))
      .fontSize(baseSize - 1)
      .fillColor(style.colors.primary)
      .text(style.typography.uppercaseTitles ? 'CLIENT' : 'Client', padding, boxTop, { width: clientBoxWidth });

    let clientY = doc.y + 3;
    doc.font(fontFor(bodyFont, true)).fontSize(baseSize).fillColor(textColor);
    doc.text(pdfText(customer.companyName || customer.name), padding, clientY, { width: clientBoxWidth });
    clientY = doc.y + 1;
    doc.font(fontFor(bodyFont)).fontSize(baseSize - 1).fillColor(muted);

    const clientLines = [
      customer.companyName ? customer.name : null,
      customer.addressLine1,
      customer.addressLine2,
      [customer.postalCode, customer.city].filter(Boolean).join(' ') || null,
      customer.country,
      customer.email,
      customer.phone,
      customer.taxId ? `N° fiscal : ${customer.taxId}` : null,
    ].filter((line): line is string => Boolean(line && String(line).trim()));

    for (const line of clientLines) {
      doc.text(pdfText(String(line)), padding, clientY, { width: clientBoxWidth });
      clientY = doc.y;
    }

    // Colonne de droite : informations de suivi.
    const metaX = padding + clientBoxWidth + 16;
    let metaY = boxTop;
    const metaRows: [string, string][] = [
      ['Numéro', pdfText(quotation.number)],
      ['Date d’émission', dateFr(quotation.issueDate)],
    ];
    if (style.visibility.validityDate) metaRows.push([labels.validityLabel, dateFr(quotation.validUntil)]);
    metaRows.push(['Devise', currency]);
    if (quotation.customerReference) metaRows.push(['Votre référence', pdfText(quotation.customerReference)]);
    if (quotation.status) metaRows.push(['Statut', pdfText(labels.statusLabel(quotation.status))]);
    for (const [label, value] of data.metaRows) metaRows.push([pdfText(label), pdfText(value)]);

    doc.save();
    doc.roundedRect(metaX, metaY, metaBoxWidth, metaRows.length * (baseSize + 7) + 14, style.table.borderRadius || 6).fill(mix(style.colors.primary, 0.94));
    doc.restore();

    metaY += 7;
    for (const [label, value] of metaRows) {
      doc.font(fontFor(bodyFont)).fontSize(baseSize - 2).fillColor(muted).text(pdfText(label), metaX + 10, metaY, { width: metaBoxWidth * 0.45 });
      doc
        .font(fontFor(bodyFont, true))
        .fontSize(baseSize - 2)
        .fillColor(textColor)
        .text(pdfText(value), metaX + metaBoxWidth * 0.45, metaY, { width: metaBoxWidth * 0.5, align: 'right' });
      metaY += baseSize + 7;
    }

    cursorY = Math.max(clientY, metaY) + style.sectionGap * 0.55;
  }

  /* --- Titre du document ------------------------------------------------- */

  if (quotation.title && quotation.title.trim() && quotation.title.trim() !== labels.documentTitle) {
    doc
      .font(fontFor(headingFont, true))
      .fontSize(baseSize + 2)
      .fillColor(textColor)
      .text(pdfText(quotation.title), padding, cursorY, { width: contentWidth });
    cursorY = doc.y + 10;
  }

  /* --- Tableau des lignes ------------------------------------------------ */

  const showUnit = style.visibility.unitColumn;
  const showDiscount = style.visibility.discountColumn && items.some((item) => Number(item.discountValue) > 0);
  const showTax = style.visibility.taxColumn && items.some((item) => Number(item.taxRate) > 0);

  const fixedWidths: { key: string; label: string; width: number; align: 'left' | 'right' | 'center' }[] = [];
  if (showUnit) fixedWidths.push({ key: 'unit', label: 'Unité', width: 52, align: 'left' });
  fixedWidths.push({ key: 'quantity', label: 'Qté', width: 46, align: 'right' });
  fixedWidths.push({
    key: 'unitPrice',
    label: quotation.pricesIncludeTax ? 'P.U. TTC' : 'P.U. HT',
    width: 76,
    align: 'right',
  });
  if (showDiscount) fixedWidths.push({ key: 'discount', label: 'Remise', width: 56, align: 'right' });
  if (showTax) fixedWidths.push({ key: 'tax', label: 'TVA', width: 46, align: 'right' });
  fixedWidths.push({ key: 'total', label: quotation.pricesIncludeTax ? 'Total TTC' : 'Total HT', width: 84, align: 'right' });

  const fixedTotal = fixedWidths.reduce((sum, column) => sum + column.width, 0);
  const columns: Column[] = [{ key: 'name', label: 'Désignation', width: contentWidth - fixedTotal, align: 'left', flex: true }, ...fixedWidths];

  const tableTop = cursorY;
  let y = renderTableHeader(doc, columns, tableTop, style, padding);

  const cellPaddingX = 5;
  const cellPaddingY = Math.max(4, style.table.cellPadding);

  items.forEach((item, index) => {
    const line = totals.lines[index];
    const lineTotal = line ? line.lineTotal : item.lineTotal;
    const nameCell = style.visibility.itemDescriptions && item.description ? `${item.name}\n${item.description}` : item.name;
    const values: Record<string, string> = {
      name: pdfText(nameCell),
      unit: pdfText(item.unit ?? ''),
      quantity: quantity(item.quantity),
      unitPrice: amount(item.unitPrice, currency),
      discount:
        Number(item.discountValue) > 0
          ? item.discountType === 'PERCENTAGE'
            ? `${quantity(item.discountValue)} %`
            : amount(item.discountValue, currency)
          : '-',
      tax: Number(item.taxRate) > 0 ? `${quantity(item.taxRate)} %` : '-',
      total: amount(lineTotal, currency),
    };

    const nameColumn = columns[0];
    const nameHeight = doc
      .font(fontFor(bodyFont))
      .fontSize(baseSize - 1)
      .heightOfString(values.name || ' ', { width: nameColumn.width - cellPaddingX * 2, lineGap: 1 });
    const rowHeight = Math.max(nameHeight + cellPaddingY * 2, baseSize + cellPaddingY * 2 + 4);

    if (y + rowHeight > pageBottom()) {
      doc.addPage();
      y = renderTableHeader(doc, columns, padding, style, padding);
    }

    // Fond alterné (style « striped »).
    if (style.table.style === 'striped' && index % 2 === 1) {
      doc.save();
      doc.rect(padding, y, contentWidth, rowHeight).fill(mix(style.colors.primary, 0.95));
      doc.restore();
    }

    let x = padding;
    columns.forEach((column) => {
      const cellTextValue = values[column.key] ?? '';
      const cellY = y + cellPaddingY;

      doc
        .font(fontFor(bodyFont, column.key === 'total'))
        .fontSize(baseSize - 1)
        .fillColor(column.key === 'name' ? textColor : muted)
        .text(cellTextValue, x + cellPaddingX, cellY, {
          width: column.width - cellPaddingX * 2,
          align: column.align,
          lineGap: 1,
          ellipsis: true,
        });
      x += column.width;
    });

    y += rowHeight;

    // Séparateurs de lignes.
    if (style.table.style === 'lined' || style.table.style === 'boxed') {
      doc
        .moveTo(padding, y)
        .lineTo(doc.page.width - padding, y)
        .lineWidth(0.5)
        .strokeColor(mix(style.colors.border, 0.35))
        .stroke();
    }
  });

  if (style.table.style === 'boxed') {
    doc
      .rect(padding, tableTop, contentWidth, y - tableTop)
      .lineWidth(0.7)
      .strokeColor(style.colors.border)
      .stroke();
  }

  y += style.sectionGap * 0.5;
  cursorY = y;

  /* --- Totaux ------------------------------------------------------------ */

  const totalsWidth = Math.min(268, contentWidth * 0.55);
  const totalsX = doc.page.width - padding - totalsWidth;
  const rows: { label: string; value: string; emphasis?: boolean; muted?: boolean }[] = [];

  rows.push({ label: 'Sous-total', value: amount(totals.subtotal, currency) });
  if (Number(totals.lineDiscountTotal) > 0) {
    rows.push({ label: 'Remises sur lignes', value: `- ${amount(totals.lineDiscountTotal, currency)}` });
  }
  if (Number(totals.globalDiscountTotal) > 0) {
    rows.push({ label: 'Remise globale', value: `- ${amount(totals.globalDiscountTotal, currency)}` });
  }
  rows.push({ label: 'Total HT', value: amount(totals.netBeforeTax, currency) });

  if (style.visibility.taxBreakdown && totals.taxBreakdown.length > 0) {
    for (const entry of totals.taxBreakdown) {
      rows.push({ label: `TVA ${quantity(entry.taxRate)} %`, value: amount(entry.amount, currency), muted: true });
    }
  } else {
    rows.push({ label: 'TVA', value: amount(totals.taxTotal, currency) });
  }

  rows.push({ label: 'Total TTC', value: amount(totals.total, currency), emphasis: true });
  if (Number(totals.depositAmount) > 0) {
    rows.push({ label: 'Acompte à la commande', value: amount(totals.depositAmount, currency) });
    rows.push({ label: 'Reste à payer', value: amount(totals.amountDue, currency), emphasis: true });
  }
  for (const row of data.totalRows) {
    rows.push({ label: row.label, value: amount(row.amount, currency), emphasis: row.emphasis, muted: row.muted });
  }

  const rowHeight = baseSize + 9;
  const totalsHeight = rows.length * rowHeight + 8;

  if (cursorY + totalsHeight > pageBottom()) {
    doc.addPage();
    cursorY = padding;
  }

  let totalsY = cursorY;
  doc.save();
  doc
    .roundedRect(totalsX, totalsY, totalsWidth, totalsHeight, style.table.borderRadius || 6)
    .fill(mix(style.colors.primary, 0.96));
  doc.restore();

  totalsY += 4;
  rows.forEach((row) => {
    if (row.emphasis && style.layout.highlightedTotal) {
      doc.save();
      doc.rect(totalsX, totalsY, totalsWidth, rowHeight).fill(style.colors.primary);
      doc.restore();
      doc
        .font(fontFor(bodyFont, true))
        .fontSize(baseSize + 1)
        .fillColor('#FFFFFF')
        .text(pdfText(row.label), totalsX + 10, totalsY + 5, { width: totalsWidth * 0.5 })
        .fillColor('#FFFFFF')
        .text(pdfText(row.value), totalsX + totalsWidth * 0.5, totalsY + 5, { width: totalsWidth * 0.5 - 10, align: 'right' });
    } else {
      doc
        .font(fontFor(bodyFont, Boolean(row.emphasis)))
        .fontSize(baseSize)
        .fillColor(row.muted ? muted : textColor)
        .text(pdfText(row.label), totalsX + 10, totalsY + 5, { width: totalsWidth * 0.5 });
      doc
        .font(fontFor(bodyFont, Boolean(row.emphasis)))
        .fontSize(baseSize)
        .fillColor(textColor)
        .text(pdfText(row.value), totalsX + totalsWidth * 0.5, totalsY + 5, { width: totalsWidth * 0.5 - 10, align: 'right' });
    }
    totalsY += rowHeight;
  });

  cursorY += totalsHeight + style.sectionGap * 0.6;

  /* --- Conditions, paiement, notes -------------------------------------- */

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageBottom()) {
      doc.addPage();
      cursorY = padding;
    }
  };

  const writeSection = (title: string, body: string) => {
    if (!body || !body.trim()) return;
    ensureSpace(46);
    doc
      .font(fontFor(headingFont, true))
      .fontSize(baseSize - 1)
      .fillColor(style.colors.primary)
      .text(pdfText(style.typography.uppercaseTitles ? title.toUpperCase() : title), padding, cursorY, { width: contentWidth });
    cursorY = doc.y + 3;
    doc.font(fontFor(bodyFont)).fontSize(baseSize - 1).fillColor(muted).text(pdfText(body), padding, cursorY, {
      width: contentWidth,
      lineGap: 2,
    });
    cursorY = doc.y + style.sectionGap * 0.5;
  };

  if (style.visibility.terms) {
    writeSection(labels.validitySection, terms.validityPeriod ?? '');
    writeSection('Conditions de paiement', terms.paymentTerms ?? '');
    writeSection('Délai de livraison / exécution', terms.deliveryTime ?? '');
    writeSection('Garantie', terms.warranty ?? '');
    writeSection('Conditions particulières', terms.specialConditions ?? '');
    for (const block of terms.blocks ?? []) {
      writeSection(block.label, block.content);
    }
  }

  for (const extra of data.extraSections) {
    writeSection(extra.title, extra.body);
  }

  if (style.visibility.notes && terms.notes && terms.notes.trim()) {
    writeSection('Notes', terms.notes);
  }

  if (style.visibility.paymentInfo && terms.paymentInstructions && terms.paymentInstructions.trim()) {
    ensureSpace(60);
    doc.save();
    doc.roundedRect(padding, cursorY, contentWidth, 8 + doc.heightOfString(pdfText(terms.paymentInstructions), { width: contentWidth - 24 }) + 20, 6)
      .fill(mix(style.colors.accent, 0.9));
    doc.restore();
    doc
      .font(fontFor(headingFont, true))
      .fontSize(baseSize - 1)
      .fillColor(textColor)
      .text('MODALITÉS DE RÈGLEMENT', padding + 12, cursorY + 8, { width: contentWidth - 24 });
    doc
      .font(fontFor(bodyFont))
      .fontSize(baseSize - 1)
      .fillColor(muted)
      .text(pdfText(terms.paymentInstructions), padding + 12, doc.y + 2, { width: contentWidth - 24, lineGap: 2 });
    cursorY = doc.y + 16;
  }

  if (style.visibility.bankDetails && company?.bankDetails && company.bankDetails.trim()) {
    writeSection('Coordonnées bancaires', company.bankDetails);
  }

  /* --- Signatures -------------------------------------------------------- */

  if (style.visibility.signature) {
    const signatureHeight = 74;
    ensureSpace(signatureHeight + 24);
    const half = (contentWidth - 24) / 2;

    doc.font(fontFor(bodyFont)).fontSize(baseSize - 2).fillColor(muted);
    doc.text(pdfText(labels.signatureLabel), padding, cursorY, { width: half });
    doc.text(pdfText(company?.signatureLabel ?? 'Pour l’entreprise'), padding + half + 24, cursorY, { width: half });

    const lineY = cursorY + 46;
    doc
      .moveTo(padding, lineY)
      .lineTo(padding + half, lineY)
      .lineWidth(0.6)
      .strokeColor(style.colors.border)
      .stroke();
    doc
      .moveTo(padding + half + 24, lineY)
      .lineTo(padding + half + 24 + half, lineY)
      .lineWidth(0.6)
      .strokeColor(style.colors.border)
      .stroke();

    doc.fontSize(baseSize - 3).fillColor(muted);
    doc.text('Nom, date et signature', padding, lineY + 4, { width: half });
    doc.text('Nom, date et signature', padding + half + 24, lineY + 4, { width: half });

    cursorY = lineY + 26;
  }

  if (terms.legalMentions && terms.legalMentions.trim()) {
    ensureSpace(30);
    doc.font(fontFor(bodyFont)).fontSize(baseSize - 3).fillColor(muted).text(pdfText(terms.legalMentions), padding, cursorY, {
      width: contentWidth,
      lineGap: 1.5,
    });
  }

  /* --- Pieds de page, filigrane ----------------------------------------- */

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index - range.start + 1;

    // pdfkit ajoute automatiquement une page lorsqu'on écrit sous la marge basse :
    // on l'annule le temps d'écrire le pied de page, sinon chaque pied de page
    // engendre une page supplémentaire.
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // Emplacement du pied de page : juste sous la zone de contenu, dans la marge basse.
    const footerTop = doc.page.height - padding - FOOTER_RESERVED + 6;

    if (style.layout.footerBand) {
      doc.save();
      doc.rect(0, footerTop - 8, doc.page.width, doc.page.height - (footerTop - 8)).fill(style.colors.headerBackground);
      doc.restore();
    }

    const footerColor = style.layout.footerBand ? style.colors.headerText : muted;
    const footerY = footerTop + (style.layout.footerBand ? 6 : 2);
    const baseFooter =
      (company
        ? [
            company.name,
            company.taxId ? `N° fiscal ${company.taxId}` : null,
            company.registrationNumber ? `RCCM ${company.registrationNumber}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'MON DEVIS') + ` · ${labels.documentTitle} ${quotation.number}`;
    const footerText = options.footerNote ? `${baseFooter} · ${options.footerNote}` : baseFooter;

    doc
      .font(fontFor(bodyFont))
      .fontSize(baseSize - 4)
      .fillColor(footerColor)
      .text(pdfText(footerText), padding, footerY, { width: contentWidth - 90, lineBreak: false, ellipsis: true, height: 14 });

    doc
      .font(fontFor(bodyFont))
      .fontSize(baseSize - 4)
      .fillColor(footerColor)
      .text(`Page ${pageNumber} / ${range.count}`, doc.page.width - padding - 90, footerY, {
        width: 90,
        align: 'right',
        lineBreak: false,
        height: 14,
      });

    if (watermark) {
      doc.save();
      doc.rotate(-32, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc
        .font(fontFor(headingFont, true))
        .fontSize(58)
        .fillColor(textColor)
        .opacity(0.06)
        .text('MON DEVIS', 0, doc.page.height / 2 - 30, { width: doc.page.width, align: 'center', lineBreak: false });
      doc.opacity(1);
      doc.restore();
    }

    doc.page.margins.bottom = previousBottomMargin;
  }

  doc.end();
  return done;
}

function renderTableHeader(doc: Doc, columns: Column[], y: number, style: TemplateStyle, padding: number): number {
  const baseSize = style.typography.baseSize;
  const height = baseSize + 12;
  const width = columns.reduce((sum, column) => sum + column.width, 0);

  if (style.table.headerStyle === 'filled') {
    doc.save();
    doc.rect(padding, y, width, height).fill(style.colors.tableHeaderBackground);
    doc.restore();
  }

  let x = padding;
  for (const column of columns) {
    doc
      .font(fontFor(style.typography.headingFont, true))
      .fontSize(baseSize - 2)
      .fillColor(style.table.headerStyle === 'filled' ? style.colors.tableHeaderText : style.colors.primary)
      .text(pdfText(style.typography.uppercaseTitles ? column.label.toUpperCase() : column.label), x + 5, y + 7, {
        width: column.width - 10,
        align: column.align,
        lineBreak: false,
        ellipsis: true,
      });
    x += column.width;
  }

  doc
    .moveTo(padding, y + height)
    .lineTo(padding + width, y + height)
    .lineWidth(style.table.headerStyle === 'underlined' ? 1.2 : 0.6)
    .strokeColor(style.colors.border)
    .stroke();

  return y + height;
}

function drawLogo(doc: Doc, dataUri: string, x: number, y: number, maxWidth: number, maxHeight: number): number {
  try {
    const base64 = dataUri.includes(',') ? dataUri.slice(dataUri.indexOf(',') + 1) : dataUri;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.byteLength === 0) return 0;
    const openImage = (doc as unknown as { openImage(data: Buffer): { width: number; height: number } }).openImage;
    if (typeof openImage !== 'function') return 0;
    const image = openImage.call(doc, buffer);
    const ratio = image.width / image.height;
    let width = maxWidth;
    let height = width / ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
    doc.image(buffer, x, y, { width, height });
    return height;
  } catch {
    // Logo illisible (format non pris en charge) : on continue sans image.
    return 0;
  }
}

function quotationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Brouillon',
    SENT: 'Envoyé',
    PENDING: 'En attente',
    ACCEPTED: 'Accepté',
    REJECTED: 'Refusé',
    EXPIRED: 'Expiré',
    CANCELLED: 'Annulé',
  };
  return labels[status] ?? status;
}
