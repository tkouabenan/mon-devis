import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import { currencyDecimals, getCurrency } from '@/lib/currency';
import type { QuotationDocumentData } from '@/lib/services/quotations';
import type { TemplateStyle } from '@/lib/templates';

/**
 * Génération Word (.docx) : document réellement éditable (tableaux, images,
 * styles) contenant l'intégralité des données du devis enregistré.
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

const FONT_FALLBACK = 'Calibri';

function hex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

function mapFont(font: string): string {
  if (/times/i.test(font)) return 'Times New Roman';
  if (/courier/i.test(font)) return 'Courier New';
  return FONT_FALLBACK;
}

function amount(value: unknown, currency: string): string {
  const decimals = currencyDecimals(currency);
  const safe = toNumeric(value);
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
  return `${formatted} ${getCurrency(currency).symbol}`;
}

function numberValue(value: unknown, decimals = 2): string {
  const safe = toNumeric(value);
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(safe);
}

function dateFr(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
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
  return lines;
}

function labelParagraph(text: string, style: TemplateStyle, options: { size?: number; color?: string; bold?: boolean } = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options.bold ?? true,
        size: (options.size ?? style.typography.baseSize - 1) * 2,
        color: hex(options.color ?? style.colors.muted),
        font: mapFont(style.typography.headingFont),
        allCaps: true,
        characterSpacing: 20,
      }),
    ],
    spacing: { after: 60 },
  });
}

function textParagraph(text: string, style: TemplateStyle, options: { size?: number; color?: string; spacing?: number } = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: (options.size ?? style.typography.baseSize) * 2,
        color: hex(options.color ?? style.colors.text),
        font: mapFont(style.typography.bodyFont),
      }),
    ],
    spacing: { after: options.spacing ?? 40 },
  });
}

function cell(
  content: Paragraph[],
  style: TemplateStyle,
  options: { width?: number; shading?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number } = {},
) {
  return new TableCell({
    children: content,
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: options.columnSpan,
    shading: options.shading ? { type: ShadingType.CLEAR, fill: hex(options.shading), color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: hex(style.colors.border) },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: hex(style.colors.border) },
      left: style.table.style === 'boxed' ? { style: BorderStyle.SINGLE, size: 2, color: hex(style.colors.border) } : undefined,
      right: style.table.style === 'boxed' ? { style: BorderStyle.SINGLE, size: 2, color: hex(style.colors.border) } : undefined,
    },
    verticalMerge: undefined,
  });
}

function rightParagraph(text: string, style: TemplateStyle, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text,
        bold: options.bold ?? false,
        size: (options.size ?? style.typography.baseSize) * 2,
        color: hex(options.color ?? style.colors.text),
        font: mapFont(style.typography.bodyFont),
      }),
    ],
  });
}

export async function renderQuotationDocx(data: QuotationDocumentData, options: { watermark?: boolean } = {}): Promise<Buffer> {
  const { quotation, items, company, customer, terms, style, totals } = data;
  const currency = quotation.currency;

  // --- Logo -------------------------------------------------------------
  let logoRun: ImageRun | null = null;
  if (style.visibility.logo && data.logoDataUri) {
    const base64 = data.logoDataUri.split(',')[1];
    if (base64) {
      try {
        const buffer = Buffer.from(base64, 'base64');
        logoRun = new ImageRun({
          data: buffer,
          transformation: { width: 140, height: 56 },
          type: 'png',
        });
      } catch {
        logoRun = null;
      }
    }
  }

  const companyContactLines = [
    ...addressLines(company ?? {}),
    company?.phone ? `Tél. : ${company.phone}` : null,
    company?.email,
    company?.website,
    company?.registrationNumber ? `RCCM : ${company.registrationNumber}` : null,
    company?.taxId ? `N° contribuable : ${company.taxId}` : null,
  ].filter(Boolean) as string[];

  // --- En-tête -----------------------------------------------------------
  const headerChildren: Paragraph[] = [];
  if (logoRun) {
    headerChildren.push(new Paragraph({ children: [logoRun], spacing: { after: 80 } }));
  }
  headerChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (quotation.title || 'Devis').toUpperCase(),
          bold: true,
          size: Math.round(style.typography.titleSize) * 2,
          color: hex(style.colors.primary),
          font: mapFont(style.typography.headingFont),
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `N° ${quotation.number}`,
          bold: true,
          size: (style.typography.baseSize + 2) * 2,
          color: hex(style.colors.secondary),
          font: mapFont(style.typography.bodyFont),
        }),
      ],
      spacing: { after: 160 },
    }),
  );

  // --- Blocs entreprise / client / méta ----------------------------------
  const companyCell = cell(
    [
      labelParagraph('Émis par', style),
      new Paragraph({
        children: [
          new TextRun({
            text: company?.name ?? 'Votre entreprise',
            bold: true,
            size: (style.typography.baseSize + 2) * 2,
            color: hex(style.colors.secondary),
            font: mapFont(style.typography.headingFont),
          }),
        ],
        spacing: { after: 60 },
      }),
      ...companyContactLines.map((line) => textParagraph(line, style, { size: style.typography.baseSize - 0.5, color: style.colors.muted })),
    ],
    style,
    { width: 48 },
  );

  const customerCell = cell(
    [
      labelParagraph('Adressé à', style),
      new Paragraph({
        children: [
          new TextRun({
            text: customer?.companyName || customer?.name || 'Client à préciser',
            bold: true,
            size: (style.typography.baseSize + 2) * 2,
            color: hex(style.colors.secondary),
            font: mapFont(style.typography.headingFont),
          }),
        ],
        spacing: { after: 60 },
      }),
      ...(customer?.companyName && customer?.name ? [textParagraph(customer.name, style, { size: style.typography.baseSize - 0.5 })] : []),
      ...addressLines(customer ?? {}).map((line) => textParagraph(line, style, { size: style.typography.baseSize - 0.5 })),
      ...(customer?.phone ? [textParagraph(`Tél. : ${customer.phone}`, style, { size: style.typography.baseSize - 0.5 })] : []),
      ...(customer?.email ? [textParagraph(customer.email, style, { size: style.typography.baseSize - 0.5 })] : []),
      ...(customer?.taxId ? [textParagraph(`N° contribuable : ${customer.taxId}`, style, { size: style.typography.baseSize - 0.5 })] : []),
    ],
    style,
    { width: 52 },
  );

  const metaRowsData: [string, string][] = [
    ['Date d’émission', dateFr(quotation.issueDate)],
    ...(style.visibility.validityDate && quotation.validUntil ? ([['Valable jusqu’au', dateFr(quotation.validUntil)]] as [string, string][]) : []),
    ['Devise', currency],
    ...(quotation.reference ? ([['Référence', quotation.reference]] as [string, string][]) : []),
    ...(quotation.customerReference ? ([['Référence client', quotation.customerReference]] as [string, string][]) : []),
  ];

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: metaRowsData.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              children: [textParagraph(label, style, { size: style.typography.baseSize - 1, color: style.colors.muted })],
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            }),
            new TableCell({
              children: [rightParagraph(value, style, { size: style.typography.baseSize - 0.5, bold: true })],
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            }),
          ],
        }),
    ),
  });

  // --- Tableau des lignes ------------------------------------------------
  const showUnit = style.visibility.unitColumn;
  const showDiscount = style.visibility.discountColumn;
  const showTax = style.visibility.taxColumn;

  const headerCells: TableCell[] = [];
  const columnWidths: number[] = [];
  const pushHeader = (label: string, width: number, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) => {
    headerCells.push(
      cell([new Paragraph({ alignment: align, children: [new TextRun({ text: label, bold: true, size: (style.typography.baseSize - 0.5) * 2, color: hex(style.colors.tableHeaderText), font: mapFont(style.typography.headingFont), allCaps: true })] })], style, {
        shading: style.table.headerStyle === 'filled' ? style.colors.tableHeaderBackground : undefined,
        align,
      }),
    );
    columnWidths.push(width);
  };

  pushHeader('Désignation', showUnit && showDiscount && showTax ? 36 : 46);
  if (showUnit) pushHeader('Unité', 8, AlignmentType.CENTER);
  pushHeader('Qté', 8, AlignmentType.RIGHT);
  pushHeader(quotation.pricesIncludeTax ? 'P.U. TTC' : 'P.U. HT', 15, AlignmentType.RIGHT);
  if (showDiscount) pushHeader('Remise', 11, AlignmentType.RIGHT);
  if (showTax) pushHeader('TVA', 9, AlignmentType.RIGHT);
  pushHeader(quotation.pricesIncludeTax ? 'Total TTC' : 'Total HT', 15, AlignmentType.RIGHT);

  const bodyRows: TableRow[] = items.map((item, index) => {
    const line = totals.lines[index];
    const cells: TableCell[] = [];

    const designationParagraphs: Paragraph[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: item.name,
            bold: true,
            size: style.typography.baseSize * 2,
            color: hex(style.colors.text),
            font: mapFont(style.typography.bodyFont),
          }),
        ],
        spacing: { after: style.visibility.itemDescriptions && item.description ? 40 : 0 },
      }),
    ];
    if (style.visibility.itemDescriptions && item.description) {
      designationParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: item.description,
              size: (style.typography.baseSize - 1) * 2,
              color: hex(style.colors.muted),
              font: mapFont(style.typography.bodyFont),
            }),
          ],
        }),
      );
    }
    cells.push(cell(designationParagraphs, style, { shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined }));

    if (showUnit) cells.push(cell([textParagraph(item.unit, style, { size: style.typography.baseSize - 0.5 })], style, { shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined }));
    cells.push(cell([rightParagraph(numberValue(item.quantity, 2), style, { size: style.typography.baseSize - 0.5 })], style, { shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined }));
    cells.push(cell([rightParagraph(amount(item.unitPrice, currency), style, { size: style.typography.baseSize - 0.5 })], style, { shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined }));
    if (showDiscount) {
      const discountLabel =
        item.discountType === 'PERCENTAGE'
          ? `${numberValue(item.discountValue, 2)} %`
          : Number(item.discountValue) > 0
            ? amount(item.discountValue, currency)
            : '—';
      cells.push(cell([rightParagraph(discountLabel, style, { size: style.typography.baseSize - 0.5 })], style, { shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined }));
    }
    if (showTax) cells.push(cell([rightParagraph(`${numberValue(item.taxRate, 2)} %`, style, { size: style.typography.baseSize - 0.5 })], style, { shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined }));
    cells.push(
      cell([rightParagraph(amount(quotation.pricesIncludeTax ? line.lineTotal : line.lineNet, currency), style, { size: style.typography.baseSize - 0.5, bold: true })], style, {
        shading: style.table.style === 'striped' && index % 2 === 1 ? style.colors.tableAltRow : undefined,
      }),
    );

    return new TableRow({ children: cells, cantSplit: true });
  });

  if (bodyRows.length === 0) {
    bodyRows.push(
      new TableRow({
        children: [cell([textParagraph('Aucune ligne enregistrée sur ce devis.', style)], style)],
      }),
    );
  }

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: columnWidths.map((width) => Math.round((width / columnWidths.reduce((sum, value) => sum + value, 0)) * 9300)),
    rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
  });

  // --- Totaux ------------------------------------------------------------
  const totalsRows: TableRow[] = [];
  const addTotalRow = (label: string, value: string, emphasis = false) => {
    totalsRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            children: [rightParagraph(label, style, { size: style.typography.baseSize, bold: emphasis, color: emphasis ? style.colors.secondary : style.colors.muted })],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          }),
          new TableCell({
            children: [rightParagraph(value, style, { size: (style.typography.baseSize + (emphasis ? 1 : 0)), bold: emphasis })],
            shading: emphasis ? { type: ShadingType.CLEAR, fill: hex(style.colors.primary), color: 'auto' } : undefined,
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          }),
        ],
      }),
    );
  };

  addTotalRow('Sous-total', amount(totals.subtotal, currency));
  if (Number(totals.lineDiscountTotal) > 0) addTotalRow('Remises sur lignes', `- ${amount(totals.lineDiscountTotal, currency)}`);
  if (Number(totals.globalDiscountTotal) > 0) addTotalRow('Remise globale', `- ${amount(totals.globalDiscountTotal, currency)}`);
  addTotalRow('Total HT', amount(totals.netBeforeTax, currency));
  if (style.visibility.taxBreakdown && totals.taxBreakdown.length > 0) {
    totals.taxBreakdown.forEach((entry) => addTotalRow(`TVA ${numberValue(entry.taxRate, 2)} %`, amount(entry.amount, currency)));
  } else {
    addTotalRow('TVA', amount(totals.taxTotal, currency));
  }
  addTotalRow('Total TTC', amount(totals.total, currency), true);
  if (Number(totals.depositAmount) > 0) {
    addTotalRow('Acompte à la commande', amount(totals.depositAmount, currency));
    addTotalRow('Reste à payer', amount(totals.amountDue, currency), true);
  }

  const totalsTable = new Table({
    width: { size: 46, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.RIGHT,
    rows: totalsRows,
  });

  // --- Conditions --------------------------------------------------------
  const conditions: { title: string; body: string }[] = [];
  const pushCondition = (title: string, value: string | null | undefined) => {
    if (value && value.trim()) conditions.push({ title, body: value.trim() });
  };
  if (style.visibility.terms) {
    pushCondition('Validité du devis', terms.validityPeriod);
    pushCondition('Conditions de paiement', terms.paymentTerms);
    pushCondition('Délai de livraison / exécution', terms.deliveryTime);
    pushCondition('Garantie', terms.warranty);
    pushCondition('Conditions particulières', terms.specialConditions);
    pushCondition('Mentions légales', terms.legalMentions);
    (terms.blocks ?? []).forEach((block) => pushCondition(block.label, block.content));
  }
  if (style.visibility.paymentInfo) pushCondition('Modalités de règlement', company?.paymentInfo);
  if (style.visibility.bankDetails) pushCondition('Coordonnées bancaires', company?.bankDetails);
  if (style.visibility.notes) pushCondition('Notes', quotation.notes ?? terms.notes);

  const legalLine = [
    company?.name,
    company?.registrationNumber ? `RCCM ${company.registrationNumber}` : null,
    company?.taxId ? `N° contribuable ${company.taxId}` : null,
    company?.legalInfo,
  ]
    .filter(Boolean)
    .join(' · ');

  const document = new Document({
    creator: 'MON DEVIS',
    title: `${quotation.title} ${quotation.number}`,
    description: `Devis ${quotation.number}`,
    styles: {
      default: {
        document: {
          run: { font: mapFont(style.typography.bodyFont), size: style.typography.baseSize * 2, color: hex(style.colors.text) },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(18),
              left: convertMillimetersToTwip(18),
              right: convertMillimetersToTwip(18),
            },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${legalLine ? `${legalLine} · ` : ''}Devis ${quotation.number} — page `,
                    size: (style.typography.baseSize - 2) * 2,
                    color: hex(style.colors.muted),
                    font: mapFont(style.typography.bodyFont),
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: (style.typography.baseSize - 2) * 2,
                    color: hex(style.colors.muted),
                  }),
                  new TextRun({
                    text: ' / ',
                    size: (style.typography.baseSize - 2) * 2,
                    color: hex(style.colors.muted),
                  }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: (style.typography.baseSize - 2) * 2, color: hex(style.colors.muted) }),
                  new TextRun({
                    text: ' · Généré avec MON DEVIS',
                    size: (style.typography.baseSize - 2) * 2,
                    color: hex(style.colors.muted),
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          labelParagraph('Émis par / Adressé à', style, { size: style.typography.baseSize - 2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: [companyCell, customerCell] })],
          }),
          new Paragraph({ children: [], spacing: { after: 120 } }),
          metaTable,
          new Paragraph({ children: [], spacing: { after: 200 } }),
          labelParagraph('Détail des prestations', style, { size: style.typography.baseSize - 2 }),
          itemsTable,
          new Paragraph({ children: [], spacing: { after: 160 } }),
          totalsTable,
          ...(options.watermark
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'Document généré avec MON DEVIS — plan gratuit',
                      italics: true,
                      size: (style.typography.baseSize - 2) * 2,
                      color: hex(style.colors.muted),
                    }),
                  ],
                  spacing: { before: 200 },
                }),
              ]
            : []),
          ...(conditions.length > 0
            ? [
                new Paragraph({ children: [], spacing: { after: 200 } }),
                labelParagraph('Conditions et informations', style, { size: style.typography.baseSize - 2 }),
                ...conditions.flatMap((condition) => [
                  labelParagraph(condition.title, style, { bold: true, size: style.typography.baseSize - 1.5, color: style.colors.secondary }),
                  textParagraph(condition.body, style, { size: style.typography.baseSize - 0.5, spacing: 140 }),
                ]),
              ]
            : []),
          ...(style.visibility.signature
            ? [
                new Paragraph({ children: [], spacing: { after: 240 } }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: [
                        cell(
                          [
                            labelParagraph('Bon pour accord — le client', style, { size: style.typography.baseSize - 2 }),
                            textParagraph('Date et signature précédées de la mention « Bon pour accord »', style, {
                              size: style.typography.baseSize - 1.5,
                              color: style.colors.muted,
                              spacing: 0,
                            }),
                            new Paragraph({ children: [], spacing: { after: 600 } }),
                          ],
                          style,
                          { width: 50 },
                        ),
                        cell(
                          [
                            labelParagraph('L’entreprise', style, { size: style.typography.baseSize - 2 }),
                            textParagraph(company?.signatureLabel || company?.name || '', style, {
                              size: style.typography.baseSize - 1.5,
                              color: style.colors.muted,
                              spacing: 0,
                            }),
                            new Paragraph({ children: [], spacing: { after: 600 } }),
                          ],
                          style,
                          { width: 50 },
                        ),
                      ],
                    }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}
