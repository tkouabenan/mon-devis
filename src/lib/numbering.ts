/**
 * Numérotation des devis.
 * Format configurable par organisation. Jetons disponibles :
 *   {YYYY}  année sur 4 chiffres        {YY}    année sur 2 chiffres
 *   {MM}    mois sur 2 chiffres         {SEQ}   séquence (défaut 4 chiffres)
 *   {SEQ:n} séquence sur n chiffres      {PREFIX} préfixe libre
 *
 * Exemple : « DEV-{YYYY}-{SEQ:4} » → DEV-2026-0001
 */

export const DEFAULT_NUMBERING_FORMAT = 'DEV-{YYYY}-{SEQ:4}';

export interface NumberingContext {
  year: number;
  month: number;
  sequence: number;
  prefix?: string;
}

export function renderQuotationNumber(format: string, context: NumberingContext): string {
  const template = format?.trim() || DEFAULT_NUMBERING_FORMAT;
  return template
    .replace(/\{PREFIX\}/g, context.prefix ?? '')
    .replace(/\{YYYY\}/g, String(context.year).padStart(4, '0'))
    .replace(/\{YY\}/g, String(context.year % 100).padStart(2, '0'))
    .replace(/\{MM\}/g, String(context.month).padStart(2, '0'))
    .replace(/\{SEQ:(\d+)\}/g, (_match, size: string) => String(context.sequence).padStart(Number(size) || 4, '0'))
    .replace(/\{SEQ\}/g, String(context.sequence).padStart(4, '0'));
}

/** Validation d'un format de numérotation personnalisé. */
export function validateNumberingFormat(format: string): { valid: boolean; error?: string } {
  if (!format || !format.trim()) {
    return { valid: false, error: 'Le format de numérotation ne peut pas être vide.' };
  }
  if (!/\{SEQ(:\d+)?\}/.test(format)) {
    return {
      valid: false,
      error: 'Le format doit contenir le jeton {SEQ} (ou {SEQ:4}) pour la séquence automatique.',
    };
  }
  if (format.length > 40) {
    return { valid: false, error: 'Le format ne doit pas dépasser 40 caractères.' };
  }
  if (!/^[\w{}().\-/:\s]+$/u.test(format)) {
    return { valid: false, error: 'Le format contient des caractères non autorisés.' };
  }
  return { valid: true };
}

/** Aperçu du prochain numéro (utilisé dans les paramètres). */
export function previewQuotationNumber(format: string, sequence = 1, date = new Date()): string {
  return renderQuotationNumber(format, {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    sequence,
  });
}

/** Extrait la séquence numérique d'un numéro de devis (pour les imports/migrations). */
export function extractSequence(number: string): number | null {
  const matches = number.match(/(\d+)\s*$/);
  if (!matches) return null;
  const parsed = Number.parseInt(matches[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}
