import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  Packer,
} from 'docx';
import type { QuotationDocumentData } from '@/lib/quotation-document';
import type { TemplateStyle } from '@/lib/templates';

/**
 * Générateur DOCX : document Word entièrement éditable.
 * L'utilisateur peut modifier les textes, ajouter des lignes ou changer les
 * styles dans Word / LibreOffice / Google Docs.
 */

const WORD_FONT_MAP: Record<string, string> = {
  'Times-Roman': 'Times New Roman',
  'Times-Bold': 'Times New Roman',
  Courier: 'Courier New',
  'Courier-Bold': 'Courier New',
  Helvetica: 'Arial',
  'Helvetica-Bold': 'Arial',
};

function wordFont(font: string | null | undefined): string {
  if (!font) return 'Arial';
  return WORD_FONT_MAP[font] ?? font;
}

function hex(color: string): string {
  return color.replace('#', '').toUpperCase().padStart(6, '0').slice(0, 6);
}

function money(value: unknown, currency: string): string {
  const decimals = ['XOF', 'XAF', 'JPY'].includes(currency.toUpperCase()) ? 0 : 2;
  const numeric = Number(value ?? 0);
  const formatted = (Number.isFinite(numeric) ? numeric : 0).toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const symbols: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA', EUR: '€', USD: '$', GBP: '£' };
  const symbol = symbols[currency.toUpperCase()] ?? currency.toUpperCase();
  return `${formatted}${symbol.length > 1 ? ' ' : '\u00a0'}${symbol}`.replace(/\u202f|\u00a0(?=FCFA|€|\$|£)/g, (match) => (match === '\u202f' ? ' ' : match));
}

function numberFr(value: unknown, decimals = 2): string {
  const numeric = Number(value ?? 0);
  return (Number.isFinite(numeric) ? numeric : 0).toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function dateFr(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function baseText(
  text: string,
  style: TemplateStyle,
  options: { bold?: boolean; size?: number; color?: string; italics?: boolean; heading?: boolean } = {},
): TextRun {
  return new TextRun({
    text,
    bold: options.bold,
    italics: options.italics,
    size: Math.round((options.size ?? style.typography.baseSize) * 2),
    color: hex(options.color ?? style.colors.text),
    font: wordFont(options.heading ? style.typography.headingFont : style.typography.bodyFont),
  });
}

export async function renderQuotationDocx(data: QuotationDocumentData): Promise<Buffer> {
  const { quotation, items, company, customer, terms, style, totals, labels } = data;
  const currency = quotation.currency;

  /* --- En-tête de section (logo + entreprise) --------------------------- */

  const headerChildren: Paragraph[] = [];
  if (data.logoDataUri && style.visibility.logo) {
    try {
      const buffer = Buffer.from(data.logoDataUri.split(',').pop() ?? '', 'base64');
      if (buffer.byteLength > 0) {
        headerChildren.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: buffer,
                transformation: { width: 110, height: 36 },
                type: 'png',
              }),
            ],
            spacing: { after: 60 },
          }),
        );
      }
    } catch {
      // Logo illisible : l'en-tête texte reste valable.
    }
  }
  headerChildren.push(
    new Paragraph({
      children: [baseText(company?.name ?? 'MON DEVIS', style, { bold: true, size: style.typography.baseSize + 1, heading: true })],
      spacing: { after: 0 },
    }),
    new Paragraph({
      children: [
        baseText(
          [company?.phone, company?.email].filter(Boolean).join('  ·  ') || ' ',
          style,
          { size: style.typography.baseSize - 2, color: style.colors.muted },
        ),
      ],
      spacing: { after: 0 },
    }),
  );

  /* --- Contenu ---------------------------------------------------------- */

  const body: (Paragraph | Table)[] = [];

  // Titre du document.
  body.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
      children: [
        baseText(labels.badge, style, { bold: true, size: style.typography.titleSize + 4, color: style.colors.primary, heading: true }),
        ...(quotation.title && quotation.title.trim() && quotation.title.trim() !== labels.documentTitle
          ? [baseText(`  —  ${quotation.title.trim()}`, style, { size: style.typography.baseSize + 2, color: style.colors.text })]
          : []),
      ],
    }),
  );

  // Bandeau d'informations (entreprise / client / dates).
  const infoLeft: Paragraph[] = [];
  const infoRight: Paragraph[] = [];

  if (customer) {
    infoLeft.push(
      new Paragraph({
        children: [baseText('CLIENT', style, { bold: true, size: style.typography.baseSize - 2, color: style.colors.primary })],
        spacing: { after: 40 },
      }),
      new Paragraph({
        children: [baseText(customer.companyName || customer.name, style, { bold: true })],
        spacing: { after: 0 },
      }),
    );
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
      infoLeft.push(
        new Paragraph({
          children: [baseText(String(line), style, { size: style.typography.baseSize - 1, color: style.colors.muted })],
          spacing: { after: 0 },
        }),
      );
    }
  }

  const metaRows: [string, string][] = [
    ['Numéro', quotation.number],
    ['Date d’émission', dateFr(quotation.issueDate)],
  ];
  if (style.visibility.validityDate) metaRows.push([labels.validityLabel, dateFr(quotation.validUntil)]);
  metaRows.push(['Devise', currency]);
  if (quotation.customerReference) metaRows.push(['Votre référence', quotation.customerReference]);
  if (quotation.status) metaRows.push(['Statut', labels.statusLabel(quotation.status)]);
  for (const [label, value] of data.metaRows) metaRows.push([label, value]);

  for (const [label, value] of metaRows) {
    infoRight.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          baseText(`${label} : `, style, { size: style.typography.baseSize - 1, color: style.colors.muted }),
          baseText(value, style, { bold: true, size: style.typography.baseSize - 1 }),
        ],
      }),
    );
  }

  body.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 58, type: WidthType.PERCENTAGE },
              margins: { top: 0, bottom: 120, left: 0, right: 160 },
              children: infoLeft.length > 0 ? infoLeft : [new Paragraph({ children: [baseText(' ', style)] })],
            }),
            new TableCell({
              width: { size: 42, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: hex(mixHex(style.colors.primary, 0.94)), color: 'auto' },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: infoRight,
            }),
          ],
        }),
      ],
    }),
  );

  body.push(new Paragraph({ children: [baseText(' ', style, { size: 6 })], spacing: { after: 120 } }));

  /* --- Tableau des lignes ---------------------------------------------- */

  const showUnit = style.visibility.unitColumn;
  const showDiscount = style.visibility.discountColumn && items.some((item) => Number(item.discountValue) > 0);
  const showTax = style.visibility.taxColumn && items.some((item) => Number(item.taxRate) > 0);

  const columns: { label: string; width: number; align: 'left' | 'right' }[] = [
    { label: 'Désignation', width: showUnit ? 38 : 44, align: 'left' },
  ];
  if (showUnit) columns.push({ label: 'Unité', width: 11, align: 'left' });
  columns.push({ label: 'Qté', width: 10, align: 'right' });
  columns.push({ label: quotation.pricesIncludeTax ? 'P.U. TTC' : 'P.U. HT', width: 15, align: 'right' });
  if (showDiscount) columns.push({ label: 'Remise', width: 11, align: 'right' });
  if (showTax) columns.push({ label: 'TVA', width: 9, align: 'right' });
  columns.push({ label: quotation.pricesIncludeTax ? 'Total TTC' : 'Total HT', width: 15, align: 'right' });

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(
      (column) =>
        new TableCell({
          width: { size: column.width, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: hex(style.colors.tableHeaderBackground), color: 'auto' },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: column.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [
                baseText(style.typography.uppercaseTitles ? column.label.toUpperCase() : column.label, style, {
                  bold: true,
                  size: style.typography.baseSize - 2,
                  color: style.colors.tableHeaderText,
                  heading: true,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const itemRows = items.map((item, index) => {
    const cells: TableCell[] = [];
    const isStriped = style.table.style === 'striped' && index % 2 === 1;
    const shading = isStriped
      ? { type: ShadingType.CLEAR, fill: hex(mixHex(style.colors.primary, 0.95)), color: 'auto' }
      : undefined;

    const cellOptions: { shading?: ConstructorParameters<typeof TableCell>[0]['shading']; margins: { top: number; bottom: number; left: number; right: number } } = {
      shading,
      margins: { top: 70, bottom: 70, left: 100, right: 100 },
    };

    cells.push(
      new TableCell({
        ...cellOptions,
        width: { size: columns[0].width, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [baseText(item.name, style, { bold: false })],
            spacing: { after: 0 },
          }),
          ...(style.visibility.itemDescriptions && item.description
            ? [
                new Paragraph({
                  children: [baseText(item.description, style, { size: style.typography.baseSize - 2, color: style.colors.muted })],
                  spacing: { before: 20, after: 0 },
                }),
              ]
            : []),
        ],
      }),
    );

    const pushCell = (value: string, columnIndex: number) => {
      const column = columns[columnIndex];
      cells.push(
        new TableCell({
          ...cellOptions,
          width: { size: column.width, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: column.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [baseText(value, style)],
              spacing: { after: 0 },
            }),
          ],
        }),
      );
    };

    let columnIndex = 1;
    if (showUnit) pushCell(item.unit ?? '', columnIndex++);
    pushCell(numberFr(item.quantity, Number(item.quantity) % 1 === 0 ? 0 : 2), columnIndex++);
    pushCell(money(item.unitPrice, currency), columnIndex++);
    if (showDiscount) {
      const discountValue = Number(item.discountValue);
      pushCell(
        discountValue > 0
          ? item.discountType === 'PERCENTAGE'
            ? `${numberFr(discountValue, 2)} %`
            : money(discountValue, currency)
          : '-',
        columnIndex++,
      );
    }
    if (showTax) pushCell(Number(item.taxRate) > 0 ? `${numberFr(item.taxRate, 2)} %` : '-', columnIndex++);
    pushCell(money(item.lineTotal, currency), columnIndex);

    return new TableRow({ children: cells });
  });

  body.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: hex(style.colors.border) },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: hex(style.colors.border) },
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: style.table.style === 'lined' || style.table.style === 'boxed'
          ? { style: BorderStyle.SINGLE, size: 1, color: hex(mixHex(style.colors.border, 0.25)) }
          : NO_BORDER,
        insideVertical: style.table.style === 'boxed' ? { style: BorderStyle.SINGLE, size: 1, color: hex(style.colors.border) } : NO_BORDER,
      },
      rows: [headerRow, ...itemRows],
    }),
  );

  body.push(new Paragraph({ children: [baseText(' ', style, { size: 6 })], spacing: { after: 120 } }));

  /* --- Totaux ---------------------------------------------------------- */

  const totalRows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: 'Sous-total', value: money(totals.subtotal, currency) },
  ];
  if (Number(totals.lineDiscountTotal) > 0) totalRows.push({ label: 'Remises sur lignes', value: `- ${money(totals.lineDiscountTotal, currency)}` });
  if (Number(totals.globalDiscountTotal) > 0)
    totalRows.push({ label: 'Remise globale', value: `- ${money(totals.globalDiscountTotal, currency)}` });
  totalRows.push({ label: 'Total HT', value: money(totals.netBeforeTax, currency) });
  if (style.visibility.taxBreakdown && totals.taxBreakdown.length > 0) {
    for (const entry of totals.taxBreakdown) {
      totalRows.push({ label: `TVA ${numberFr(entry.taxRate, 2)} %`, value: money(entry.amount, currency) });
    }
  } else {
    totalRows.push({ label: 'TVA', value: money(totals.taxTotal, currency) });
  }
  totalRows.push({ label: 'Total TTC', value: money(totals.total, currency), emphasis: true });
  if (Number(totals.depositAmount) > 0) {
    totalRows.push({ label: 'Acompte à la commande', value: money(totals.depositAmount, currency) });
    totalRows.push({ label: 'Reste à payer', value: money(totals.amountDue, currency), emphasis: true });
  }
  for (const row of data.totalRows) {
    totalRows.push({ label: row.label, value: money(row.amount, currency), emphasis: row.emphasis });
  }

  body.push(
    new Table({
      width: { size: 48, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.RIGHT,
      layout: TableLayoutType.FIXED,
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
      rows: totalRows.map(
        (row) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 58, type: WidthType.PERCENTAGE },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                shading: row.emphasis
                  ? { type: ShadingType.CLEAR, fill: hex(style.colors.primary), color: 'auto' }
                  : undefined,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      baseText(row.label, style, {
                        bold: row.emphasis,
                        size: row.emphasis ? style.typography.baseSize + 1 : style.typography.baseSize,
                        color: row.emphasis ? style.colors.headerText : style.colors.muted,
                      }),
                    ],
                    spacing: { after: 0 },
                  }),
                ],
              }),
              new TableCell({
                width: { size: 42, type: WidthType.PERCENTAGE },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                shading: row.emphasis
                  ? { type: ShadingType.CLEAR, fill: hex(style.colors.primary), color: 'auto' }
                  : undefined,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      baseText(row.value, style, {
                        bold: true,
                        size: row.emphasis ? style.typography.baseSize + 1 : style.typography.baseSize,
                        color: row.emphasis ? style.colors.headerText : style.colors.text,
                      }),
                    ],
                    spacing: { after: 0 },
                  }),
                ],
              }),
            ],
          }),
      ),
    }),
  );

  /* --- Conditions ------------------------------------------------------ */

  const section = (title: string, content: string | null | undefined) => {
    if (!content || !content.trim()) return;
    body.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          baseText(style.typography.uppercaseTitles ? title.toUpperCase() : title, style, {
            bold: true,
            size: style.typography.baseSize - 1,
            color: style.colors.primary,
            heading: true,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 0 },
        children: [baseText(content.trim(), style, { size: style.typography.baseSize - 1, color: style.colors.muted })],
      }),
    );
  };

  if (style.visibility.terms) {
    section(labels.validitySection, terms.validityPeriod);
    section('Conditions de paiement', terms.paymentTerms);
    section('Délai de livraison / exécution', terms.deliveryTime);
    section('Garantie', terms.warranty);
    section('Conditions particulières', terms.specialConditions);
    for (const block of terms.blocks ?? []) section(block.label, block.content);
  }
  for (const extra of data.extraSections) section(extra.title, extra.body);
  if (style.visibility.notes) section('Notes', terms.notes);
  if (style.visibility.paymentInfo) section('Modalités de règlement', terms.paymentInstructions);
  if (style.visibility.bankDetails) section('Coordonnées bancaires', company?.bankDetails ?? null);

  /* --- Signatures ------------------------------------------------------ */

  if (style.visibility.signature) {
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        borders: {
          top: NO_BORDER,
          bottom: NO_BORDER,
          left: NO_BORDER,
          right: NO_BORDER,
          insideHorizontal: NO_BORDER,
          insideVertical: NO_BORDER,
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                margins: { top: 400, bottom: 0, left: 0, right: 240 },
                borders: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(style.colors.border) } },
                children: [
                  new Paragraph({
                    children: [
                      baseText('Bon pour accord — signature du client', style, {
                        size: style.typography.baseSize - 2,
                        color: style.colors.muted,
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                margins: { top: 400, bottom: 0, left: 240, right: 0 },
                borders: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(style.colors.border) } },
                children: [
                  new Paragraph({
                    children: [
                      baseText(company?.signatureLabel ?? 'Pour l’entreprise', style, {
                        size: style.typography.baseSize - 2,
                        color: style.colors.muted,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  }

  if (terms.legalMentions && terms.legalMentions.trim()) {
    body.push(
      new Paragraph({
        spacing: { before: 240 },
        children: [baseText(terms.legalMentions.trim(), style, { size: style.typography.baseSize - 3, color: style.colors.muted })],
      }),
    );
  }

  if (data.watermark) {
    body.push(
      new Paragraph({
        spacing: { before: 240 },
        alignment: AlignmentType.CENTER,
        children: [
          baseText('Document généré avec MON DEVIS — plan Gratuit', style, {
            size: style.typography.baseSize - 3,
            color: style.colors.muted,
            italics: true,
          }),
        ],
      }),
    );
  }

  /* --- Document -------------------------------------------------------- */

  const document = new Document({
    creator: 'MON DEVIS',
    title: `${labels.documentTitle} ${quotation.number}`,
    description: `${labels.documentTitle} ${quotation.number} — ${company?.name ?? ''}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  baseText('Page ', style, { size: style.typography.baseSize - 3, color: style.colors.muted }),
                  new TextRun({
                    children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
                    size: Math.round((style.typography.baseSize - 3) * 2),
                    color: hex(style.colors.muted),
                    font: wordFont(style.typography.bodyFont),
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  baseText(
                    `${company?.name ?? 'MON DEVIS'} — ${labels.documentTitle} ${quotation.number}`,
                    style,
                    { size: style.typography.baseSize - 4, color: style.colors.muted },
                  ),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(document);
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
