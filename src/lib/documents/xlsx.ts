import ExcelJS from 'exceljs';
import type { QuotationDocumentData } from '@/lib/quotation-document';

/**
 * Générateur XLSX : un tableur de travail, pas une image figée du devis.
 *
 *  - chaque ligne du devis est une vraie ligne de tableur (quantité, prix, remise, TVA) ;
 *  - les totaux sont des formules Excel vivantes : modifier une quantité, un prix
 *    ou un taux met immédiatement à jour le total HT, la TVA et le total TTC ;
 *  - les formats de nombre respectent la devise (FCFA sans décimale, EUR/USD à deux décimales) ;
 *  - mise en page prête à imprimer : A4, ajustement en largeur, ligne d'en-tête répétée.
 *
 * Colonnes : A # · B Désignation · C Description · D Unité · E Quantité ·
 *            F Prix unitaire · G Remise · H Total ligne HT · I TVA % · J Montant TVA
 */

function hex(color: string): string {
  return color.replace('#', '').toUpperCase().padStart(6, '0').slice(0, 6);
}

function currencyDecimals(currency: string): number {
  return ['XOF', 'XAF', 'JPY'].includes(currency.toUpperCase()) ? 0 : 2;
}

function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA', EUR: '€', USD: '$', GBP: '£' };
  return symbols[currency.toUpperCase()] ?? currency.toUpperCase();
}

function numberFormat(currency: string, decimals = currencyDecimals(currency)): string {
  const zeros = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
  return `#,##0${zeros}" ${currencySymbol(currency)}"`;
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function dateFr(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mixHex(hexColor: string, ratio: number): string {
  const clean = hexColor.replace('#', '');
  const int = Number.parseInt(clean.length === 3 ? clean.repeat(2) : clean, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const blend = (value: number) => Math.round(value + (255 - value) * ratio);
  return `#${[blend(r), blend(g), blend(b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  PENDING: 'En attente',
  ACCEPTED: 'Accepté',
  REJECTED: 'Refusé',
  EXPIRED: 'Expiré',
  CANCELLED: 'Annulé',
};

const THIN = (color: string) => ({ style: 'thin' as const, color: { argb: `FF${hex(color)}` } });

export async function renderQuotationXlsx(data: QuotationDocumentData): Promise<Buffer> {
  const { quotation, items, company, customer, terms, style, totals, labels } = data;
  const currency = quotation.currency;
  const moneyFormat = numberFormat(currency);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MON DEVIS';
  workbook.lastModifiedBy = 'MON DEVIS';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `${labels.documentTitle} ${quotation.number}`;
  workbook.subject = quotation.title ?? labels.documentTitle;
  workbook.company = company?.name ?? 'MON DEVIS';

  const sheet = workbook.addWorksheet(labels.sheetName, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
    properties: { defaultRowHeight: 16 },
  });

  /* --- Colonnes --------------------------------------------------------- */

  const showUnit = style.visibility.unitColumn;
  const showDiscount = style.visibility.discountColumn;
  const showTax = style.visibility.taxColumn;

  sheet.columns = [
    { key: 'position', width: 5 },
    { key: 'name', width: 36 },
    { key: 'description', width: 30 },
    { key: 'unit', width: 10 },
    { key: 'quantity', width: 10 },
    { key: 'unitPrice', width: 17 },
    { key: 'discount', width: 13 },
    { key: 'lineNet', width: 17 },
    { key: 'taxRate', width: 9 },
    { key: 'lineTax', width: 15 },
  ];

  // Les colonnes masquées par le modèle restent présentes : les formules de total restent valides.
  if (!showUnit) sheet.getColumn('unit').hidden = true;
  if (!showDiscount) sheet.getColumn('discount').hidden = true;
  if (!showTax) sheet.getColumn('taxRate').hidden = true;

  const lastColumn = 'J';

  /* --- Bandeau de titre ------------------------------------------------- */

  sheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${company?.name ?? 'MON DEVIS'} — ${labels.badge} ${quotation.number}`;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(style.colors.primary)}` } };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(`A2:${lastColumn}2`);
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = [
    quotation.title && quotation.title.trim() ? quotation.title.trim() : labels.documentTitle,
    `Émis le ${dateFr(quotation.issueDate)}`,
    style.visibility.validityDate && quotation.validUntil ? `${labels.validityLabel} ${dateFr(quotation.validUntil)}` : null,
    `Statut : ${labels.statusLabel(quotation.status)}`,
  ]
    .filter(Boolean)
    .join('   •   ');
  subtitleCell.font = { size: 9, italic: true, color: { argb: `FF${hex(style.colors.muted)}` } };
  subtitleCell.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(2).height = 20;

  /* --- Blocs émetteur / client ----------------------------------------- */

  const companyInfo: string[] = company
    ? [
        company.addressLine1,
        company.addressLine2,
        [company.postalCode, company.city].filter(Boolean).join(' ') || null,
        company.country,
        company.phone ? `Tél. : ${company.phone}` : null,
        company.email,
        company.website,
        company.taxId ? `N° fiscal : ${company.taxId}` : null,
        company.registrationNumber ? `RCCM : ${company.registrationNumber}` : null,
      ].filter((line): line is string => Boolean(line && String(line).trim()))
    : [];

  const customerInfo: string[] = customer
    ? [
        customer.companyName || customer.name,
        customer.companyName ? customer.name : null,
        customer.addressLine1,
        customer.addressLine2,
        [customer.postalCode, customer.city].filter(Boolean).join(' ') || null,
        customer.country,
        customer.email,
        customer.phone,
        customer.taxId ? `N° fiscal : ${customer.taxId}` : null,
      ].filter((line): line is string => Boolean(line && String(line).trim()))
    : [];

  sheet.getCell('A4').value = 'ÉMETTEUR';
  sheet.getCell('F4').value = 'CLIENT';
  for (const reference of ['A4', 'F4']) {
    sheet.getCell(reference).font = { size: 9, bold: true, color: { argb: `FF${hex(style.colors.primary)}` } };
  }

  const infoRows = Math.max(companyInfo.length, customerInfo.length, 5);
  for (let index = 0; index < infoRows; index += 1) {
    const rowNumber = 5 + index;
    const companyLine = companyInfo[index];
    const customerLine = customerInfo[index];

    if (companyLine) {
      sheet.mergeCells(`A${rowNumber}:E${rowNumber}`);
      const cell = sheet.getCell(`A${rowNumber}`);
      cell.value = companyLine;
      cell.font = { size: 9, bold: index === 0 };
    }
    if (customerLine) {
      sheet.mergeCells(`F${rowNumber}:${lastColumn}${rowNumber}`);
      const cell = sheet.getCell(`F${rowNumber}`);
      cell.value = customerLine;
      cell.font = { size: 9, bold: index === 0 };
    }
  }

  const metaStart = 5 + infoRows;
  const meta: [string, string][] = [
    ['Numéro', quotation.number],
    ['Date d’émission', dateFr(quotation.issueDate)],
    [labels.validityLabel, style.visibility.validityDate ? dateFr(quotation.validUntil) : '—'],
    ['Devise', currency],
    ['Référence', quotation.reference ?? '—'],
    ['Référence client', quotation.customerReference ?? '—'],
    ...data.metaRows,
  ];
  meta.forEach(([label, value], index) => {
    const rowNumber = metaStart + index;
    const labelCell = sheet.getCell(`A${rowNumber}`);
    labelCell.value = label;
    labelCell.font = { size: 9, color: { argb: `FF${hex(style.colors.muted)}` } };

    sheet.mergeCells(`B${rowNumber}:C${rowNumber}`);
    const valueCell = sheet.getCell(`B${rowNumber}`);
    valueCell.value = value;
    valueCell.font = { size: 9, bold: true };
  });

  /* --- Lignes du devis -------------------------------------------------- */

  const headerRowIndex = metaStart + meta.length + 1;
  const headerLabels = [
    '#',
    'Désignation',
    'Description',
    'Unité',
    'Quantité',
    quotation.pricesIncludeTax ? 'Prix unitaire TTC' : 'Prix unitaire HT',
    'Remise',
    'Total ligne HT',
    'TVA %',
    'Montant TVA',
  ];

  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.height = 26;
  headerLabels.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { size: 9, bold: true, color: { argb: `FF${hex(style.colors.tableHeaderText)}` } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(style.colors.tableHeaderBackground)}` } };
    cell.alignment = { vertical: 'middle', horizontal: index >= 4 ? 'center' : 'left', wrapText: true };
    cell.border = {
      top: THIN(style.colors.border),
      bottom: THIN(style.colors.border),
      left: THIN(style.colors.border),
      right: THIN(style.colors.border),
    };
  });

  const firstItemRow = headerRowIndex + 1;
  const lastItemRow = firstItemRow + Math.max(items.length, 1) - 1;

  items.forEach((item, index) => {
    const rowNumber = firstItemRow + index;
    const row = sheet.getRow(rowNumber);
    const line = totals.lines[index];
    const discountValue = toNumber(item.discountValue);
    const isPercentage = item.discountType === 'PERCENTAGE';
    const taxRate = toNumber(item.taxRate) / 100;

    row.getCell(1).value = index + 1;
    row.getCell(2).value = item.name;
    row.getCell(3).value = item.description ?? '';
    row.getCell(4).value = item.unit ?? '';
    row.getCell(5).value = toNumber(item.quantity, 1);
    row.getCell(6).value = toNumber(item.unitPrice);

    row.getCell(7).value = isPercentage ? discountValue / 100 : discountValue;
    row.getCell(7).numFmt = isPercentage ? '0.00%' : moneyFormat;

    // Total ligne HT : formule vivante adaptée au type de remise.
    const gross = `E${rowNumber}*F${rowNumber}`;
    const netFormula = !isPercentage && discountValue === 0
      ? gross
      : isPercentage
        ? `${gross}-(${gross}*G${rowNumber})`
        : `${gross}-G${rowNumber}`;
    const netCell = row.getCell(8);
    netCell.value = { formula: netFormula, result: toNumber(line ? line.lineNet : item.lineNet) };
    netCell.numFmt = moneyFormat;

    row.getCell(9).value = taxRate;
    row.getCell(9).numFmt = '0.00%';

    const taxCell = row.getCell(10);
    taxCell.value = { formula: `H${rowNumber}*I${rowNumber}`, result: toNumber(line ? line.lineTax : item.lineTax) };
    taxCell.numFmt = moneyFormat;

    row.getCell(2).font = { size: 9, bold: true };
    row.getCell(3).font = { size: 8, color: { argb: `FF${hex(style.colors.muted)}` } };

    for (let column = 1; column <= 10; column += 1) {
      const cell = row.getCell(column);
      if (column !== 2 && column !== 3 && !cell.font) cell.font = { size: 9 };
      cell.alignment = {
        vertical: 'middle',
        wrapText: column === 2 || column === 3,
        horizontal: column >= 5 ? (column === 7 || column === 9 ? 'center' : 'right') : 'left',
      };
      cell.border = { bottom: { style: 'hair', color: { argb: `FF${hex(style.colors.border)}` } } };
      if (style.table.style === 'striped' && index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(mixHex(style.colors.primary, 0.95))}` } };
      }
    }
    row.height = 18;
  });

  if (items.length === 0) {
    const emptyCell = sheet.getCell(`B${firstItemRow}`);
    emptyCell.value = 'Aucune ligne dans ce devis.';
    emptyCell.font = { size: 9, italic: true, color: { argb: `FF${hex(style.colors.muted)}` } };
  }

  /* --- Totaux : uniquement des formules --------------------------------- */

  const totalsStart = lastItemRow + 2;
  const lineRange = `H${firstItemRow}:H${lastItemRow}`;
  const taxRange = `J${firstItemRow}:J${lastItemRow}`;
  const grossRange = `SUMPRODUCT(E${firstItemRow}:E${lastItemRow},F${firstItemRow}:F${lastItemRow})`;

  interface TotalRow {
    label: string;
    formula: string;
    result: number;
    emphasis?: boolean;
  }

  const totalRows: TotalRow[] = [
    { label: 'Total des lignes HT (remises déduites)', formula: `SUM(${lineRange})`, result: toNumber(totals.subtotal) - toNumber(totals.lineDiscountTotal) },
    { label: 'Remises sur lignes', formula: `${grossRange}-SUM(${lineRange})`, result: toNumber(totals.lineDiscountTotal) },
  ];

  if (quotation.globalDiscountType === 'PERCENTAGE' && toNumber(quotation.globalDiscountValue) > 0) {
    totalRows.push({
      label: `Remise globale (${toNumber(quotation.globalDiscountValue)} %)`,
      formula: `(SUM(${lineRange}))*${toNumber(quotation.globalDiscountValue) / 100}`,
      result: toNumber(totals.globalDiscountTotal),
    });
  } else if (quotation.globalDiscountType === 'FIXED' && toNumber(quotation.globalDiscountValue) > 0) {
    totalRows.push({
      label: 'Remise globale',
      formula: `${toNumber(quotation.globalDiscountValue)}`,
      result: toNumber(totals.globalDiscountTotal),
    });
  } else {
    totalRows.push({ label: 'Remise globale', formula: '0', result: 0 });
  }

  const lineTotalsRow = totalsStart;
  const lineDiscountRow = totalsStart + 1;
  const globalDiscountRow = totalsStart + 2;
  const netRow = totalsStart + 3;
  const taxRow = totalsStart + 4;
  const totalRow = totalsStart + 5;

  totalRows.push({
    label: 'Total HT',
    formula: `H${lineTotalsRow}-H${globalDiscountRow}`,
    result: toNumber(totals.netBeforeTax),
  });
  totalRows.push({ label: 'TVA', formula: `SUM(${taxRange})`, result: toNumber(totals.taxTotal) });
  totalRows.push({
    label: 'TOTAL TTC',
    formula: `H${netRow}+H${taxRow}`,
    result: toNumber(totals.total),
    emphasis: true,
  });

  // Bloc de totaux : libellé fusionné F:G, valeur fusionnée H:J — chaque ligne
  // de total est ainsi référençable par sa cellule de valeur (colonne H).
  const addTotalRow = (rowNumber: number, row: TotalRow) => {
    sheet.mergeCells(`F${rowNumber}:G${rowNumber}`);
    const labelCell = sheet.getCell(`F${rowNumber}`);
    labelCell.value = row.label;
    labelCell.font = {
      size: 9,
      bold: row.emphasis,
      color: { argb: `FF${row.emphasis ? hex(style.colors.headerText) : hex(style.colors.muted)}` },
    };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

    sheet.mergeCells(`H${rowNumber}:${lastColumn}${rowNumber}`);
    const valueCell = sheet.getCell(`H${rowNumber}`);
    valueCell.value = { formula: row.formula, result: row.result };
    valueCell.numFmt = moneyFormat;
    valueCell.font = {
      size: row.emphasis ? 11 : 9,
      bold: true,
      color: { argb: `FF${row.emphasis ? hex(style.colors.headerText) : hex(style.colors.text)}` },
    };
    valueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

    if (row.emphasis) {
      for (const reference of [`F${rowNumber}`, `H${rowNumber}`]) {
        sheet.getCell(reference).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(style.colors.primary)}` } };
      }
      sheet.getRow(rowNumber).height = 24;
    }
  };

  totalRows.forEach((row, index) => addTotalRow(totalsStart + index, row));

  // Acompte et reste à payer (le cas échéant).
  let nextRow = totalRow + 1;
  if (toNumber(totals.depositAmount) > 0) {
    addTotalRow(nextRow, {
      label: 'Acompte à la commande',
      formula: `${toNumber(totals.depositAmount)}`,
      result: toNumber(totals.depositAmount),
    });
    nextRow += 1;
    addTotalRow(nextRow, {
      label: 'Reste à payer',
      formula: `H${totalRow}-H${nextRow - 1}`,
      result: toNumber(totals.amountDue),
      emphasis: true,
    });
    nextRow += 1;
  }

  for (const row of data.totalRows) {
    addTotalRow(nextRow, {
      label: row.label,
      formula: `${row.amount}`,
      result: row.amount,
      emphasis: row.emphasis,
    });
    nextRow += 1;
  }

  const noteCell = sheet.getCell(`A${nextRow + 1}`);
  noteCell.value = `Montants exprimés en ${currency}. Les totaux sont des formules : modifiez une quantité, un prix ou un taux pour les recalculer.`;
  noteCell.font = { size: 8, italic: true, color: { argb: `FF${hex(style.colors.muted)}` } };
  sheet.mergeCells(`A${nextRow + 1}:${lastColumn}${nextRow + 1}`);

  /* --- Impression ------------------------------------------------------- */

  sheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
  sheet.pageSetup.printArea = `A1:${lastColumn}${nextRow + 2}`;
  sheet.headerFooter = {
    oddHeader: `&L&"Arial,Bold"${company?.name ?? 'MON DEVIS'}&R${labels.documentTitle} ${quotation.number}`,
    oddFooter: `&L${dateFr(quotation.issueDate)} — ${currency}&CPage &P / &N`,
  };

  /* --- Feuille « Synthèse » --------------------------------------------- */

  const summary = workbook.addWorksheet('Synthèse');
  summary.columns = [{ width: 30 }, { width: 90 }];
  summary.mergeCells('A1:B1');
  const summaryTitle = summary.getCell('A1');
  summaryTitle.value = `${labels.documentTitle} ${quotation.number} — synthèse, conditions et mentions`;
  summaryTitle.font = { size: 12, bold: true, color: { argb: `FF${hex(style.colors.primary)}` } };

  const summaryRows: [string, string][] = [
    ['Émetteur', company?.name ?? '—'],
    ['Client', customer ? customer.companyName || customer.name : '—'],
    ['Objet', quotation.title ?? labels.documentTitle],
    ['Statut', labels.statusLabel(quotation.status)],
    ['Date d’émission', dateFr(quotation.issueDate)],
    [labels.validityLabel, style.visibility.validityDate ? dateFr(quotation.validUntil) : '—'],
    ['Devise', currency],
    ['Prix saisis', quotation.pricesIncludeTax ? 'TTC' : 'HT'],
    ['Modèle', `${style.name} (${style.key})`],
    ['Total HT', `${toNumber(totals.netBeforeTax).toLocaleString('fr-FR')} ${currency}`],
    ['TVA', `${toNumber(totals.taxTotal).toLocaleString('fr-FR')} ${currency}`],
    ['Total TTC', `${toNumber(totals.total).toLocaleString('fr-FR')} ${currency}`],
    ...data.totalRows.map((row) => [row.label, `${row.amount.toLocaleString('fr-FR')} ${currency}`] as [string, string]),
    ...data.extraSections.map((section) => [section.title, section.body] as [string, string]),
    [labels.validitySection, terms.validityPeriod ?? '—'],
    ['Conditions de paiement', terms.paymentTerms ?? '—'],
    ['Délai de livraison / exécution', terms.deliveryTime ?? '—'],
    ['Garantie', terms.warranty ?? '—'],
    ['Conditions particulières', terms.specialConditions ?? '—'],
    ['Modalités de règlement', terms.paymentInstructions ?? '—'],
    ['Coordonnées bancaires', company?.bankDetails ?? '—'],
    ['Notes', terms.notes ?? '—'],
    ['Mentions légales', terms.legalMentions ?? company?.legalInfo ?? '—'],
    ...(terms.blocks ?? []).map((block) => [block.label, block.content] as [string, string]),
  ];

  summaryRows.forEach(([label, value], index) => {
    const rowNumber = 3 + index;
    const labelCell = summary.getCell(`A${rowNumber}`);
    labelCell.value = label;
    labelCell.font = { size: 9, bold: true, color: { argb: `FF${hex(style.colors.muted)}` } };
    labelCell.alignment = { vertical: 'top' };

    const valueCell = summary.getCell(`B${rowNumber}`);
    valueCell.value = value && value.trim() ? value : '—';
    valueCell.font = { size: 9 };
    valueCell.alignment = { vertical: 'top', wrapText: true };
    summary.getRow(rowNumber).height = Math.max(16, Math.ceil(String(value ?? '').length / 95) * 14);
  });

  summary.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
