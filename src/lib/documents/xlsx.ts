import ExcelJS from 'exceljs';
import { currencyDecimals, getCurrency } from '@/lib/currency';
import type { QuotationDocumentData } from '@/lib/services/quotations';
import type { TemplateStyle } from '@/lib/templates';
import { toAmountNumber } from '@/lib/money';

/**
 * Génération Excel (.xlsx) : classeur structuré et modifiable.
 *
 * - les lignes sont saisies avec de vraies formules Excel (quantité × prix, remises,
 *   sous-totaux, TVA, total) : l'utilisateur peut modifier une quantité et les
 *   totaux se recalculent dans Excel ;
 * - formats numériques adaptés à la devise (FCFA sans décimale, EUR/USD à 2 décimales) ;
 * - mise en page prête à imprimer (A4 paysage, ajustement à la largeur, titres répétés).
 */

function argb(hexColor: string): string {
  return `FF${hexColor.replace('#', '').toUpperCase()}`;
}

function numberFormatFor(currency: string): string {
  const decimals = currencyDecimals(currency);
  const zeros = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
  return `#,##0${zeros} "${getCurrency(currency).symbol}"`;
}

function dateFr(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function addressString(entity: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}): string {
  return [
    entity.addressLine1,
    entity.addressLine2,
    [entity.postalCode, entity.city].filter(Boolean).join(' '),
    entity.country,
  ]
    .filter(Boolean)
    .join(', ');
}

export async function renderQuotationXlsx(data: QuotationDocumentData): Promise<Buffer> {
  const { quotation, items, company, customer, terms, style, totals } = data;
  const currency = quotation.currency;
  const numFmt = numberFormatFor(currency);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MON DEVIS';
  workbook.created = new Date();
  workbook.title = `${quotation.title} ${quotation.number}`;

  // --- Feuille principale ------------------------------------------------
  const sheet = workbook.addWorksheet('Devis', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
      printTitlesRow: '14:14',
    },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { key: 'position', width: 5 },
    { key: 'name', width: 38 },
    { key: 'description', width: 34 },
    { key: 'unit', width: 10 },
    { key: 'quantity', width: 9 },
    { key: 'unitPrice', width: 15 },
    { key: 'discount', width: 12 },
    { key: 'net', width: 15 },
    { key: 'taxRate', width: 9 },
    { key: 'taxAmount', width: 14 },
    { key: 'total', width: 16 },
  ];

  const lastColumn = 'K';

  // Bandeau de titre
  sheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = company?.name ? `${company.name} — ${quotation.title || 'Devis'}` : `Devis ${quotation.number}`;
  titleCell.font = { bold: true, size: 16, color: { argb: argb('#FFFFFF') } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(style.colors.primary) } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  // Coordonnées de l'entreprise
  sheet.mergeCells(`A3:E3`);
  sheet.getCell('A3').value = 'ÉMIS PAR';
  sheet.getCell('A3').font = { bold: true, size: 9, color: { argb: argb(style.colors.muted) } };
  sheet.mergeCells('A4:E4');
  sheet.getCell('A4').value = company?.name ?? 'Votre entreprise';
  sheet.getCell('A4').font = { bold: true, size: 12 };
  sheet.mergeCells('A5:E5');
  sheet.getCell('A5').value = addressString(company ?? {});
  sheet.getCell('A5').font = { size: 9, color: { argb: argb(style.colors.muted) } };
  sheet.mergeCells('A6:E6');
  sheet.getCell('A6').value = [company?.phone, company?.email, company?.website].filter(Boolean).join(' · ');
  sheet.getCell('A6').font = { size: 9, color: { argb: argb(style.colors.muted) } };
  sheet.mergeCells('A7:E7');
  sheet.getCell('A7').value = [
    company?.registrationNumber ? `RCCM : ${company.registrationNumber}` : null,
    company?.taxId ? `N° contribuable : ${company.taxId}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  sheet.getCell('A7').font = { size: 9, color: { argb: argb(style.colors.muted) } };

  // Informations du devis
  const metaLeft = 6;
  const metaRows: [string, string | number][] = [
    ['Numéro de devis', quotation.number],
    ['Date d’émission', dateFr(quotation.issueDate)],
    ['Valable jusqu’au', dateFr(quotation.validUntil)],
    ['Devise', currency],
    ['Référence', quotation.reference ?? '—'],
    ['Référence client', quotation.customerReference ?? '—'],
    ['Statut', quotation.status],
  ];
  sheet.getCell(metaLeft, 3).value = 'DEVIS';
  sheet.getCell(metaLeft, 3).font = { bold: true, size: 10, color: { argb: argb(style.colors.muted) } };
  metaRows.forEach(([label, value], index) => {
    sheet.getCell(`G${4 + index}`).value = label;
    sheet.getCell(`G${4 + index}`).font = { size: 9, color: { argb: argb(style.colors.muted) } };
    sheet.getCell(`I${4 + index}`).value = value;
    sheet.getCell(`I${4 + index}`).font = { size: 9, bold: true };
    sheet.mergeCells(`I${4 + index}:${lastColumn}${4 + index}`);
  });

  // Client
  sheet.getCell('A9').value = 'CLIENT';
  sheet.getCell('A9').font = { bold: true, size: 9, color: { argb: argb(style.colors.muted) } };
  sheet.mergeCells(`A9:E9`);
  sheet.getCell('A10').value = customer?.companyName || customer?.name || 'Client à préciser';
  sheet.getCell('A10').font = { bold: true, size: 11 };
  sheet.mergeCells(`A10:E10`);
  sheet.getCell('A11').value = [addressString(customer ?? {}), customer?.phone, customer?.email].filter(Boolean).join(' · ');
  sheet.getCell('A11').font = { size: 9, color: { argb: argb(style.colors.muted) } };
  sheet.mergeCells(`A11:E11`);
  sheet.getCell('A12').value = customer?.taxId ? `N° contribuable : ${customer.taxId}` : '';
  sheet.getCell('A12').font = { size: 9, color: { argb: argb(style.colors.muted) } };
  sheet.mergeCells(`A12:E12`);

  // --- Tableau des lignes ------------------------------------------------
  const headerRowIndex = 14;
  const headerRow = sheet.getRow(headerRowIndex);
  const showUnit = style.visibility.unitColumn;
  const showDiscount = style.visibility.discountColumn;
  const showTax = style.visibility.taxColumn;

  const headers = ['N°', 'Désignation', 'Description', 'Unité', 'Qté', quotation.pricesIncludeTax ? 'P.U. TTC' : 'P.U. HT', 'Remise', 'Total net', 'TVA %', 'Montant TVA', 'TOTAL'];
  headers.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, size: 9, color: { argb: argb(style.colors.tableHeaderText) } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(style.colors.tableHeaderBackground) } };
    cell.alignment = { vertical: 'middle', horizontal: index >= 4 ? 'right' : 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: argb(style.colors.border) } },
      bottom: { style: 'thin', color: { argb: argb(style.colors.border) } },
      left: { style: 'thin', color: { argb: argb(style.colors.border) } },
      right: { style: 'thin', color: { argb: argb(style.colors.border) } },
    };
  });
  headerRow.height = 26;

  const firstItemRow = headerRowIndex + 1;
  const pricesIncludeTax = quotation.pricesIncludeTax;

  items.forEach((item, index) => {
    const rowIndex = firstItemRow + index;
    const line = totals.lines[index];
    const row = sheet.getRow(rowIndex);
    const quantity = toAmountNumber(item.quantity);
    const unitPrice = toAmountNumber(item.unitPrice);
    const discountValue = toAmountNumber(item.discountValue);
    const taxRate = toAmountNumber(item.taxRate);

    row.getCell(1).value = index + 1;
    row.getCell(2).value = item.name;
    row.getCell(3).value = item.description ?? '';
    row.getCell(4).value = item.unit;
    row.getCell(5).value = quantity;
    row.getCell(6).value = unitPrice;
    row.getCell(7).value =
      item.discountType === 'PERCENTAGE'
        ? discountValue / 100
        : discountValue;
    // Total net de la ligne : formule Excel vivante.
    row.getCell(8).value = {
      formula: item.discountType === 'PERCENTAGE' ? `E${rowIndex}*F${rowIndex}*(1-G${rowIndex})` : `E${rowIndex}*F${rowIndex}-G${rowIndex}`,
      result: toAmountNumber(line.lineNetBeforeGlobal),
    };
    row.getCell(9).value = taxRate / 100;
    row.getCell(10).value = { formula: `H${rowIndex}*I${rowIndex}`, result: toAmountNumber(line.lineTax) };
    row.getCell(11).value = { formula: `H${rowIndex}+J${rowIndex}`, result: toAmountNumber(line.lineTotal) };

    [5, 6, 7, 8, 9, 10, 11].forEach((columnIndex) => {
      const cell = row.getCell(columnIndex);
      cell.numFmt = [7, 9].includes(columnIndex) ? '0.00%' : numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (columnIndex === 5) cell.numFmt = '#,##0.####';
    });
    row.getCell(7).numFmt = item.discountType === 'PERCENTAGE' ? '0.00%' : numFmt;
    row.getCell(11).font = { bold: true, size: 10 };
    row.getCell(3).alignment = { wrapText: true, vertical: 'middle' };
    row.getCell(2).font = { bold: true, size: 9 };
    row.font = { ...row.font, size: 9 };

    if (style.table.style === 'striped' && index % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(style.colors.tableAltRow) } };
      });
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'hair', color: { argb: argb(style.colors.border) } },
        bottom: { style: 'hair', color: { argb: argb(style.colors.border) } },
        left: { style: 'hair', color: { argb: argb(style.colors.border) } },
        right: { style: 'hair', color: { argb: argb(style.colors.border) } },
      };
    });
  });

  if (!showUnit) {
    sheet.getColumn(4).hidden = true;
  }
  if (!showDiscount) {
    sheet.getColumn(7).hidden = true;
  }
  if (!showTax) {
    sheet.getColumn(9).hidden = true;
    sheet.getColumn(10).hidden = true;
  }

  const lastItemRow = firstItemRow + Math.max(items.length, 1) - 1;

  // --- Totaux ------------------------------------------------------------
  let cursorRow = lastItemRow + 2;
  const addTotal = (label: string, formulaOrValue: string | number, options: { bold?: boolean; highlight?: boolean; formula?: string } = {}) => {
    sheet.mergeCells(`G${cursorRow}:J${cursorRow}`);
    const labelCell = sheet.getCell(`G${cursorRow}`);
    labelCell.value = label;
    labelCell.font = { bold: Boolean(options.bold), size: 9, color: { argb: argb(options.bold ? style.colors.text : style.colors.muted) } };
    labelCell.alignment = { horizontal: 'right' };

    const valueCell = sheet.getCell(`K${cursorRow}`);
    if (options.formula) valueCell.value = { formula: options.formula, result: typeof formulaOrValue === 'number' ? formulaOrValue : undefined };
    else valueCell.value = formulaOrValue;
    valueCell.numFmt = numFmt;
    valueCell.font = { bold: Boolean(options.bold || options.highlight), size: options.highlight ? 11 : 9 };
    valueCell.alignment = { horizontal: 'right' };
    if (options.highlight) {
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(style.colors.primary) } };
      valueCell.font = { bold: true, size: 11, color: { argb: argb('#FFFFFF') } };
      labelCell.font = { bold: true, size: 10, color: { argb: argb(style.colors.primary) } };
    }
    cursorRow += 1;
  };

  addTotal('Sous-total', toAmountNumber(totals.subtotal), { formula: `SUM(H${firstItemRow}:H${lastItemRow})` });
  if (Number(totals.lineDiscountTotal) > 0) {
    addTotal('Remises sur lignes', -toAmountNumber(totals.lineDiscountTotal));
  }
  if (Number(totals.globalDiscountTotal) > 0) {
    addTotal('Remise globale', -toAmountNumber(totals.globalDiscountTotal));
  }
  // Base imposable = somme des nets de lignes moins la remise globale (formule Excel vivante).
  const netRow = cursorRow;
  addTotal('Total HT', toAmountNumber(totals.netBeforeTax), {
    formula: `SUM(H${firstItemRow}:H${lastItemRow})-${toAmountNumber(totals.globalDiscountTotal)}`,
  });

  addTotal('TVA', toAmountNumber(totals.taxTotal), { formula: `SUM(J${firstItemRow}:J${lastItemRow})` });
  addTotal('TOTAL TTC', toAmountNumber(totals.total), { highlight: true, formula: `K${netRow}+K${netRow + 1}` });
  if (Number(totals.depositAmount) > 0) {
    const depositRow = cursorRow;
    addTotal('Acompte à la commande', toAmountNumber(totals.depositAmount));
    addTotal('Reste à payer', toAmountNumber(totals.amountDue), { bold: true, formula: `K${depositRow - 2}-K${depositRow}` });
  }

  // --- Conditions --------------------------------------------------------
  const conditions: [string, string][] = [];
  if (style.visibility.terms) {
    if (terms.validityPeriod) conditions.push(['Validité du devis', terms.validityPeriod]);
    if (terms.paymentTerms) conditions.push(['Conditions de paiement', terms.paymentTerms]);
    if (terms.deliveryTime) conditions.push(['Délai de livraison', terms.deliveryTime]);
    if (terms.warranty) conditions.push(['Garantie', terms.warranty]);
    if (terms.specialConditions) conditions.push(['Conditions particulières', terms.specialConditions]);
    if (terms.legalMentions) conditions.push(['Mentions légales', terms.legalMentions]);
    (terms.blocks ?? []).forEach((block) => conditions.push([block.label, block.content]));
  }
  if (style.visibility.bankDetails && company?.bankDetails) conditions.push(['Coordonnées bancaires', company.bankDetails]);
  if (style.visibility.paymentInfo && company?.paymentInfo) conditions.push(['Modalités de règlement', company.paymentInfo]);
  if (style.visibility.notes && (quotation.notes || terms.notes)) conditions.push(['Notes', quotation.notes ?? terms.notes ?? '']);

  if (conditions.length > 0) {
    cursorRow += 1;
    sheet.mergeCells(`A${cursorRow}:${lastColumn}${cursorRow}`);
    const sectionCell = sheet.getCell(`A${cursorRow}`);
    sectionCell.value = 'CONDITIONS ET INFORMATIONS';
    sectionCell.font = { bold: true, size: 9, color: { argb: argb(style.colors.muted) } };
    cursorRow += 1;
    conditions.forEach(([label, value]) => {
      sheet.mergeCells(`A${cursorRow}:${lastColumn}${cursorRow}`);
      const cell = sheet.getCell(`A${cursorRow}`);
      cell.value = `${label} : ${value}`;
      cell.font = { size: 9 };
      cell.alignment = { wrapText: true, vertical: 'top' };
      sheet.getRow(cursorRow).height = Math.max(14, Math.ceil(value.length / 150) * 14);
      cursorRow += 1;
    });
  }

  // Pied de page d'impression
  sheet.headerFooter.oddFooter = `&L${company?.name ?? 'MON DEVIS'}&CDevis ${quotation.number}&RPage &P / &N`;
  sheet.headerFooter.oddHeader = `&L${company?.name ?? ''}&R${dateFr(quotation.issueDate)}`;

  // --- Feuille « Synthèse » ---------------------------------------------
  const summary = workbook.addWorksheet('Synthèse', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  summary.columns = [{ width: 32 }, { width: 30 }];
  summary.addRow(['Synthèse du devis', '']);
  summary.getCell('A1').font = { bold: true, size: 14, color: { argb: argb(style.colors.primary) } };
  const summaryRows: [string, string | number][] = [
    ['Numéro', quotation.number],
    ['Intitulé', quotation.title],
    ['Statut', quotation.status],
    ['Client', customer?.companyName || customer?.name || '—'],
    ['Date d’émission', dateFr(quotation.issueDate)],
    ['Valable jusqu’au', dateFr(quotation.validUntil)],
    ['Devise', currency],
    ['Nombre de lignes', items.length],
    ['Total HT', toAmountNumber(totals.netBeforeTax)],
    ['TVA', toAmountNumber(totals.taxTotal)],
    ['Total TTC', toAmountNumber(totals.total)],
    ['Acompte', toAmountNumber(totals.depositAmount)],
    ['Reste à payer', toAmountNumber(totals.amountDue)],
  ];
  summaryRows.forEach(([label, value], index) => {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10 };
    if (typeof value === 'number') row.getCell(2).numFmt = numFmt;
    if (index === summaryRows.length - 1) {
      row.font = { bold: true };
    }
  });
  summary.addRow([]);
  summary.addRow(['Document généré par MON DEVIS', new Date().toISOString()]);
  summary.getCell(`A${summary.rowCount}`).font = { size: 8, color: { argb: argb('#94A3B8') } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
