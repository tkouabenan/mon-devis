import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { renderDocument, buildFileName } from '@/lib/documents';
import { renderQuotationPdf } from '@/lib/documents/pdf';
import { renderQuotationDocx } from '@/lib/documents/docx';
import { renderQuotationXlsx } from '@/lib/documents/xlsx';
import { QUOTATION_TEMPLATES } from '@/lib/templates';
import { buildFixtureData, itemsFixture, baseQuotation } from '../fixtures/quotation';

/**
 * Extrait le texte visible d'un PDF : décompresse les flux, puis décode les
 * chaînes hexadécimales des opérateurs TJ/Tj (encodage WinAnsi).
 */
function pdfVisibleText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const lines: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    let content = match[1];
    try {
      content = inflateSync(Buffer.from(content, 'latin1')).toString('latin1');
    } catch {
      // Flux non compressé.
    }
    const operatorPattern = /\[([^\]]*)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*Tj/g;
    let operator: RegExpExecArray | null;
    while ((operator = operatorPattern.exec(content)) !== null) {
      const arrayContent = operator[1];
      if (arrayContent !== undefined) {
        let text = '';
        const partPattern = /<([0-9A-Fa-f]+)>/g;
        let part: RegExpExecArray | null;
        while ((part = partPattern.exec(arrayContent)) !== null) {
          text += Buffer.from(part[1].replace(/(..)/g, '$1 ').trim().replace(/ /g, ''), 'hex').toString('latin1');
        }
        lines.push(text);
      } else if (operator[2] !== undefined) {
        lines.push(operator[2].replace(/\\([()\\])/g, '$1'));
      }
    }
  }
  return lines.join('\n');
}

/**
 * Les exports sont une exigence centrale : ces tests ouvrent réellement les
 * fichiers produits (ZIP Word/Excel, structure PDF) et vérifient que les
 * données du devis s'y trouvent.
 */

describe('Export PDF', () => {
  it('produit un PDF valide contenant les données du devis', async () => {
    const data = buildFixtureData();
    const buffer = await renderQuotationPdf(data);

    expect(buffer.byteLength).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const content = buffer.toString('latin1');
    expect(content).toContain('%%EOF');
    expect(content).toMatch(/\/Type\s*\/Page[^s]/);
    expect((content.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(1);

    // Vérifie la présence des données réelles dans le texte du document.
    const text = pdfVisibleText(buffer);
    expect(text).toContain('DEV-2026-0001');
    expect(text).toContain('RESIDENCE LES PALMIERS'.replace('RESIDENCE', 'RÉSIDENCE'));
    expect(text).toContain('Total TTC');
    expect(text).toContain('Travaux de maçonnerie');
    expect(text).toContain('FCFA');
  });

  it('pagine les devis longs en répétant l’en-tête de tableau', async () => {
    const manyItems = Array.from({ length: 60 }, (_, index) => ({
      ...itemsFixture[index % itemsFixture.length],
      id: `item-${index}`,
      position: index,
      name: `Prestation ${index + 1} — fourniture et pose`,
    }));
    const data = buildFixtureData({ items: manyItems });
    const buffer = await renderQuotationPdf(data);
    const content = buffer.toString('latin1');
    const pages = (content.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    // La numérotation « Page x / y » est présente dans le pied de page.
    const text = pdfVisibleText(buffer);
    expect(text).toContain('Page 1');
    expect(text).toContain('Page 2');
  });

  it('génère un document pour chacun des 8 modèles', async () => {
    for (const template of QUOTATION_TEMPLATES) {
      const data = buildFixtureData({ style: template });
      const buffer = await renderQuotationPdf(data);
      expect(buffer.byteLength, `modèle ${template.key}`).toBeGreaterThan(4000);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('accepte l’option filigrane (plan gratuit)', async () => {
    const data = buildFixtureData({ watermark: true });
    const buffer = await renderQuotationPdf(data, { watermark: true, footerNote: 'Devis consultable en ligne.' });
    expect(buffer.byteLength).toBeGreaterThan(4000);
  });
});

describe('Export Word (.docx)', () => {
  it('produit une archive Word valide et modifiable', async () => {
    const data = buildFixtureData();
    const buffer = await renderQuotationDocx(data);

    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toContain('[Content_Types].xml');
    expect(Object.keys(zip.files)).toContain('word/document.xml');

    const documentXml = await zip.file('word/document.xml')!.async('string');
    const headerXml = Object.keys(zip.files)
      .filter((name) => /^word\/header\d+\.xml$/.test(name))
      .map(async (name) => zip.file(name)!.async('string'));
    const headerContent = (await Promise.all(headerXml)).join('');
    const allXml = documentXml + headerContent;
    // Les données réelles du devis sont présentes (corps + en-tête).
    expect(allXml).toContain('DEV-2026-0001');
    expect(allXml).toContain('RÉSIDENCE LES PALMIERS');
    for (const item of itemsFixture) {
      expect(allXml).toContain(item.name.replace('’', '’'));
    }
    // Tableaux et numérotation de pages.
    expect(documentXml).toContain('<w:tbl>');
    expect(headerContent + (await zip.file('word/footer1.xml')?.async('string') ?? '')).toContain('PAGE');
    const styles = Object.keys(zip.files).some((name) => name.includes('word/header') || name.includes('word/footer'));
    expect(styles).toBe(true);
  });

  it('inclut le logo lorsqu’il est fourni', async () => {
    // PNG 1×1 transparent.
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const data = buildFixtureData({ logoDataUri: `data:image/png;base64,${png}` });
    const buffer = await renderQuotationDocx(data);
    const zip = await JSZip.loadAsync(buffer);
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(0);
  });
});

describe('Export Excel (.xlsx)', () => {
  it('produit un classeur avec formules, formats et données du devis', async () => {
    const data = buildFixtureData();
    const buffer = await renderQuotationXlsx(data);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.getWorksheet('Devis');
    expect(sheet).toBeDefined();
    expect(workbook.getWorksheet('Synthèse')).toBeDefined();

    const values: string[] = [];
    const formulas: string[] = [];
    sheet!.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'object' && cell.value && 'formula' in cell.value) {
          formulas.push(String((cell.value as { formula: string }).formula));
        } else if (cell.value !== null && cell.value !== undefined) {
          values.push(String(cell.value));
        }
      });
    });

    const flat = values.join(' | ');
    expect(flat).toContain('DEV-2026-0001');
    expect(flat).toContain('RÉSIDENCE LES PALMIERS');
    expect(flat).toContain('Travaux de maçonnerie');
    expect(flat).toContain('TOTAL TTC');

    // Formules réelles : sous-total, TVA, total et lignes.
    expect(formulas.some((formula) => formula.startsWith('SUM(H'))).toBe(true);
    expect(formulas.some((formula) => formula.startsWith('SUM(J'))).toBe(true);
    expect(formulas.some((formula) => /^E\d+\*F\d+/.test(formula))).toBe(true);
    expect(formulas.some((formula) => /^H\d+\*I\d+$/.test(formula))).toBe(true);

    // Mise en page d'impression.
    expect(sheet!.pageSetup.fitToPage).toBe(true);
    expect(sheet!.pageSetup.fitToWidth).toBe(1);
  });

  it('applique un format FCFA sans décimale pour XOF', async () => {
    const data = buildFixtureData();
    const buffer = await renderQuotationXlsx(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Devis')!;

    let found = false;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.numFmt === 'string' && cell.numFmt.includes('FCFA')) found = true;
      });
    });
    expect(found).toBe(true);
  });

  it('utilise le format à 2 décimales pour l’euro', async () => {
    const data = buildFixtureData({
      quotation: { ...baseQuotation, currency: 'EUR' },
    });
    const buffer = await renderQuotationXlsx(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Devis')!;
    let format = '';
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.numFmt === 'string' && cell.numFmt.includes('€')) format = cell.numFmt;
      });
    });
    expect(format).toContain('#,##0.00');
  });
});

describe('Façade d’export', () => {
  it('génère chaque format via renderDocument', async () => {
    const data = buildFixtureData();
    const pdf = await renderDocument(data, { format: 'pdf' });
    const docx = await renderDocument(data, { format: 'docx' });
    const xlsx = await renderDocument(data, { format: 'xlsx' });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await JSZip.loadAsync(docx)).files['word/document.xml']).toBeDefined();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx as unknown as ArrayBuffer);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });

  it('nomme les fichiers selon la convention MON-DEVIS_NUMERO_CLIENT.ext', () => {
    expect(buildFileName('DEV-2026-0001', 'Résidence Les Palmiers', 'pdf')).toBe(
      'MON-DEVIS_DEV-2026-0001_RESIDENCE-LES-PALMIERS.pdf',
    );
    expect(buildFileName('DEV-2026-0001', null, 'docx')).toBe('MON-DEVIS_DEV-2026-0001_CLIENT.docx');
    expect(buildFileName('DEV-2026-0002', 'ACME & Fils', 'xlsx')).toBe('MON-DEVIS_DEV-2026-0002_ACME-FILS.xlsx');
  });
});
