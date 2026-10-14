import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { AnalyticsPeriod, StatisticsOverview } from '@/lib/services/analytics';
import { formatCurrency, formatNumber } from '@/lib/currency';

/**
 * Exports de la page Statistiques.
 *
 * Les deux exports contiennent les données réelles de l'organisation sur la
 * période sélectionnée — aucune valeur d'exemple. Le classeur Excel contient des
 * formules vivantes (taux, moyennes, écarts année sur année) afin de pouvoir
 * poursuivre l'analyse dans un tableur.
 */

const BRAND_PRIMARY = '2563EB';
const BRAND_DARK = '0F172A';
const BRAND_MUTED = '64748B';
const BRAND_LIGHT = 'F8FAFC';

function periodLabel(period: AnalyticsPeriod): string {
  return period.label;
}

function formatDateRange(period: AnalyticsPeriod): { from: string; to: string } {
  const format = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { from: format(period.from), to: format(period.to) };
}

function percent(value: number): string {
  return `${formatNumber(value, 'fr-FR', 1)} %`;
}

/* -------------------------------------------------------------------------- */
/* Excel                                                                      */
/* -------------------------------------------------------------------------- */

export async function renderStatisticsXlsx(
  overview: StatisticsOverview,
  organizationName: string,
): Promise<Buffer> {
  const currency = overview.currency;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MON DEVIS';
  workbook.created = new Date();

  const money = (value: number) => value;
  const moneyFormat = currency === 'XOF' || currency === 'XAF' ? '#,##0" FCFA"' : `#,##0.00" ${currency}"`;

  // --- Feuille 1 : synthèse --------------------------------------------------
  const summary = workbook.addWorksheet('Synthèse', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summary.columns = [
    { key: 'label', width: 42 },
    { key: 'value', width: 22 },
    { key: 'comment', width: 40 },
  ];

  summary.mergeCells('A1:C1');
  summary.getCell('A1').value = `Statistiques — ${organizationName}`;
  summary.getCell('A1').font = { size: 16, bold: true, color: { argb: `FF${BRAND_DARK}` } };
  summary.mergeCells('A2:C2');
  const range = formatDateRange(overview.period);
  summary.getCell('A2').value = `Période : ${periodLabel(overview.period)} (du ${range.from} au ${range.to}) · Devise : ${currency}`;
  summary.getCell('A2').font = { size: 10, color: { argb: `FF${BRAND_MUTED}` } };

  const section = (title: string, row: number) => {
    summary.getCell(`A${row}`).value = title;
    summary.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: `FF${BRAND_PRIMARY}` } };
    summary.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_LIGHT}` } };
  };

  section('Activité devis', 4);
  const totals = overview.totals;
  const totalRows: [string, number | string, string?][] = [
    ['Nombre de devis', totals.quotationCount, 'Devis émis sur la période'],
    ['Montant total des devis', money(totals.quotationAmount)],
    ['Devis acceptés', totals.acceptedCount],
    ['Montant accepté', money(totals.acceptedAmount)],
    ['Devis refusés', totals.rejectedCount],
    ['Devis expirés', totals.expiredCount],
    ['Taux d’acceptation', percent(totals.acceptanceRate), 'Acceptés / devis tranchés'],
    ['Taux de refus', percent(totals.rejectionRate)],
    ['Valeur moyenne d’un devis', money(totals.averageValue)],
    ['Valeur moyenne acceptée', money(totals.averageAcceptedValue)],
    ['Délai moyen de réponse client', totals.averageResponseDays === null ? '—' : `${formatNumber(totals.averageResponseDays, 'fr-FR', 1)} jours`],
  ];
  totalRows.forEach(([label, value, comment], index) => {
    const row = summary.addRow({ label, value, comment });
    if (typeof value === 'number' && label.toLowerCase().includes('montant')) {
      row.getCell('value').numFmt = moneyFormat;
    }
    if (typeof value === 'number' && label.toLowerCase().includes('valeur moyenne')) {
      row.getCell('value').numFmt = moneyFormat;
    }
  });

  section('Facturation', summary.rowCount + 2);
  summary.addRow({ label: 'Factures émises', value: overview.invoices.count });
  summary.addRow({ label: 'Montant facturé', value: overview.invoices.amount }).getCell('value').numFmt = moneyFormat;
  summary.addRow({ label: 'Montant encaissé', value: overview.invoices.paidAmount }).getCell('value').numFmt = moneyFormat;
  summary.addRow({ label: 'Reste à encaisser', value: overview.invoices.outstandingAmount }).getCell('value').numFmt = moneyFormat;
  summary.addRow({ label: 'Factures en retard', value: overview.invoices.overdueCount });

  // --- Feuille 2 : évolution mensuelle --------------------------------------
  const monthly = workbook.addWorksheet('Évolution mensuelle', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  monthly.addRow(['Mois', 'Devis', 'Montant devis', 'Acceptés', 'Montant accepté', 'Taux de conversion', 'Taux de refus']);
  monthly.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  monthly.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_PRIMARY}` } };

  overview.monthly.forEach((month) => {
    const row = monthly.addRow([
      month.label,
      month.count,
      money(month.amount),
      month.accepted,
      money(month.acceptedAmount),
      month.conversionRate / 100,
      month.rejectionRate / 100,
    ]);
    row.getCell(3).numFmt = moneyFormat;
    row.getCell(5).numFmt = moneyFormat;
    row.getCell(6).numFmt = '0.0%';
    row.getCell(7).numFmt = '0.0%';
  });

  const monthlyTotalsRow = monthly.addRow([
    'Total',
    { formula: `SUM(B2:B${monthly.rowCount})` },
    { formula: `SUM(C2:C${monthly.rowCount})` },
    { formula: `SUM(D2:D${monthly.rowCount})` },
    { formula: `SUM(E2:E${monthly.rowCount})` },
    { formula: `IFERROR(AVERAGE(F2:F${monthly.rowCount}),0)` },
    { formula: `IFERROR(AVERAGE(G2:G${monthly.rowCount}),0)` },
  ]);
  monthlyTotalsRow.font = { bold: true };
  monthlyTotalsRow.getCell(3).numFmt = moneyFormat;
  monthlyTotalsRow.getCell(5).numFmt = moneyFormat;
  monthlyTotalsRow.getCell(6).numFmt = '0.0%';
  monthlyTotalsRow.getCell(7).numFmt = '0.0%';
  monthly.columns.forEach((column, index) => {
    column.width = index === 0 ? 14 : 18;
  });
  monthly.views = [{ state: 'frozen', ySplit: 1 }];

  // --- Feuille 3 : clients ---------------------------------------------------
  const customers = workbook.addWorksheet('Meilleurs clients');
  customers.addRow(['Client', 'Devis', 'Montant total', 'Montant accepté', 'Part du montant accepté']);
  customers.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  customers.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_PRIMARY}` } };
  overview.topCustomers.forEach((customer) => {
    const row = customers.addRow([customer.name, customer.count, money(customer.amount), money(customer.acceptedAmount), null]);
    row.getCell(3).numFmt = moneyFormat;
    row.getCell(4).numFmt = moneyFormat;
    row.getCell(5).value = { formula: `IFERROR(D${row.number}/SUM($D$2:$D$${overview.topCustomers.length + 1}),0)` };
    row.getCell(5).numFmt = '0.0%';
  });
  customers.columns.forEach((column, index) => {
    column.width = index === 0 ? 36 : 18;
  });

  // --- Feuille 4 : produits --------------------------------------------------
  const products = workbook.addWorksheet('Produits & services');
  products.addRow(['Prestation', 'Quantité vendue', 'Montant HT', 'Occurrences']);
  products.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  products.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_PRIMARY}` } };
  overview.topProducts.forEach((product) => {
    const row = products.addRow([product.name, product.quantity, money(product.amount), product.occurrences]);
    row.getCell(3).numFmt = moneyFormat;
    row.getCell(2).numFmt = '#,##0.###';
  });
  products.columns.forEach((column, index) => {
    column.width = index === 0 ? 40 : 18;
  });

  // --- Feuille 5 : comparaison annuelle -------------------------------------
  if (overview.yearOverYear.length > 0) {
    const yoy = workbook.addWorksheet('Année sur année');
    yoy.addRow(['Mois', 'Année en cours', 'Année précédente', 'Écart', 'Variation']);
    yoy.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    yoy.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_PRIMARY}` } };
    overview.yearOverYear.forEach((entry) => {
      const row = yoy.addRow([entry.label, money(entry.current), money(entry.previous), null, null]);
      row.getCell(2).numFmt = moneyFormat;
      row.getCell(3).numFmt = moneyFormat;
      row.getCell(4).value = { formula: `B${row.number}-C${row.number}` };
      row.getCell(4).numFmt = moneyFormat;
      row.getCell(5).value = { formula: `IFERROR((B${row.number}-C${row.number})/C${row.number},0)` };
      row.getCell(5).numFmt = '0.0%';
    });
    yoy.columns.forEach((column, index) => {
      column.width = index === 0 ? 16 : 20;
    });
  }

  const workbookBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(workbookBuffer);
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                        */
/* -------------------------------------------------------------------------- */

const CHAR_REPLACEMENTS: Record<string, string> = {
  '\u202f': ' ',
  '\u00a0': ' ',
  '\u2011': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2019': "'",
  '\u2026': '...',
};

function pdfText(value: string): string {
  return value.replace(/[\u202f\u00a0\u2011\u2013\u2014\u2019\u2026]/g, (character) => CHAR_REPLACEMENTS[character] ?? '?');
}

export async function renderStatisticsPdf(overview: StatisticsOverview, organizationName: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: 'Statistiques MON DEVIS' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = doc.page.width - 96;
  const money = (value: number) => pdfText(formatCurrency(value, overview.currency, 'fr-FR'));
  const { from, to } = formatDateRange(overview.period);

  const heading = (text: string, y?: number) => {
    if (y) doc.y = y;
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(`#${BRAND_PRIMARY}`).text(pdfText(text.toUpperCase()));
    doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - 48, doc.y + 2).strokeColor('#E2E8F0').stroke();
    doc.moveDown(0.5);
    doc.fillColor('#1E293B');
  };

  const line = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor('#1E293B');
    doc.text(pdfText(label), 48, y, { width: pageWidth - 160, continued: false });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
    doc.text(pdfText(value), doc.page.width - 48 - 150, y, { width: 150, align: 'right' });
    doc.moveDown(0.35);
  };

  // En-tête
  doc.font('Helvetica-Bold').fontSize(20).fillColor(`#${BRAND_DARK}`).text('Statistiques');
  doc.font('Helvetica').fontSize(10).fillColor(`#${BRAND_MUTED}`);
  doc.text(pdfText(`${organizationName} — ${periodLabel(overview.period)}`));
  doc.text(pdfText(`Du ${from} au ${to} · Devise : ${overview.currency}`));

  const totals = overview.totals;
  heading('Activité devis');
  line('Nombre de devis', formatNumber(totals.quotationCount, 'fr-FR', 0));
  line('Montant total des devis', money(totals.quotationAmount));
  line('Devis acceptés', `${formatNumber(totals.acceptedCount, 'fr-FR', 0)} — ${money(totals.acceptedAmount)}`);
  line('Devis refusés', formatNumber(totals.rejectedCount, 'fr-FR', 0));
  line('Devis expirés', formatNumber(totals.expiredCount, 'fr-FR', 0));
  line('Taux d’acceptation', percent(totals.acceptanceRate), true);
  line('Taux de refus', percent(totals.rejectionRate));
  line('Valeur moyenne d’un devis', money(totals.averageValue));
  line('Valeur moyenne acceptée', money(totals.averageAcceptedValue));
  line(
    'Délai moyen de réponse client',
    totals.averageResponseDays === null ? 'Aucune décision enregistrée sur la période' : `${formatNumber(totals.averageResponseDays, 'fr-FR', 1)} jours`,
  );

  heading('Facturation');
  line('Factures émises', formatNumber(overview.invoices.count, 'fr-FR', 0));
  line('Montant facturé', money(overview.invoices.amount));
  line('Montant encaissé', money(overview.invoices.paidAmount));
  line('Reste à encaisser', money(overview.invoices.outstandingAmount));
  line('Factures en retard', formatNumber(overview.invoices.overdueCount, 'fr-FR', 0));

  heading('Évolution mensuelle');
  doc.font('Helvetica-Bold').fontSize(9);
  const columns = [
    { label: 'Mois', width: 0.18, align: 'left' as const },
    { label: 'Devis', width: 0.1, align: 'right' as const },
    { label: 'Montant', width: 0.24, align: 'right' as const },
    { label: 'Acceptés', width: 0.12, align: 'right' as const },
    { label: 'Conversion', width: 0.18, align: 'right' as const },
    { label: 'Refus', width: 0.18, align: 'right' as const },
  ];
  const drawRow = (values: string[], bold = false) => {
    const y = doc.y;
    let x = 48;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    values.forEach((value, index) => {
      const column = columns[index];
      doc.text(pdfText(value), x, y, { width: pageWidth * column.width, align: column.align });
      x += pageWidth * column.width;
    });
    doc.moveDown(0.45);
  };
  drawRow(columns.map((column) => column.label), true);
  overview.monthly.forEach((month) => {
    if (doc.y > doc.page.height - 90) {
      doc.addPage();
      drawRow(columns.map((column) => column.label), true);
    }
    drawRow([
      month.label,
      formatNumber(month.count, 'fr-FR', 0),
      money(month.amount),
      formatNumber(month.accepted, 'fr-FR', 0),
      percent(month.conversionRate),
      percent(month.rejectionRate),
    ]);
  });

  if (overview.topCustomers.length > 0) {
    heading('Meilleurs clients');
    overview.topCustomers.forEach((customer) => {
      line(customer.name, `${formatNumber(customer.count, 'fr-FR', 0)} devis · ${money(customer.acceptedAmount)} acceptés`);
    });
  }

  if (overview.topProducts.length > 0) {
    heading('Prestations les plus vendues');
    overview.topProducts.forEach((product) => {
      line(product.name, `${formatNumber(product.quantity, 'fr-FR', 2)} × · ${money(product.amount)} HT`);
    });
  }

  if (overview.yearOverYear.length > 0) {
    heading('Comparaison année sur année');
    overview.yearOverYear.forEach((entry) => {
      const variation = entry.change === null ? '—' : `${entry.change > 0 ? '+' : ''}${formatNumber(entry.change, 'fr-FR', 1)} %`;
      line(entry.label, `${money(entry.current)} · ${variation} vs ${money(entry.previous)}`);
    });
  }

  // Pied de page numéroté
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.font('Helvetica').fontSize(8).fillColor(`#${BRAND_MUTED}`);
    doc.text(
      pdfText(`MON DEVIS — statistiques générées le ${new Date().toLocaleDateString('fr-FR')} — page ${index - range.start + 1}/${range.count}`),
      48,
      doc.page.height - 40,
      { width: pageWidth, align: 'center' },
    );
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on('end', () => resolve()));
  return Buffer.concat(chunks);
}

export async function buildStatisticsXlsxBuffer(overview: StatisticsOverview, organizationName: string): Promise<Buffer> {
  return renderStatisticsXlsx(overview, organizationName);
}
