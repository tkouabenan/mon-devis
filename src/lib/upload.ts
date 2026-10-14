import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Element as XmlElement } from '@xmldom/xmldom';

/**
 * Validation et assainissement des fichiers envoyés (logos).
 *
 * Les SVG sont nettoyés : scripts, gestionnaires d'événements, entités externes,
 * `foreignObject` et références distantes sont supprimés. Un SVG non nettoyé est
 * un vecteur d'exécution JavaScript dans le navigateur.
 */

export const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

export interface UploadValidation {
  valid: boolean
  error?: string
  extension?: string
  mimeType?: AllowedImageType
}

const MAGIC_NUMBERS: { type: AllowedImageType; signature: number[] }[] = [
  { type: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { type: 'image/webp', signature: [0x52, 0x49, 0x46, 0x46] },
];

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.byteLength < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

/** Vérifie le type réel du fichier (signature binaire) en plus du type déclaré. */
export function validateImageUpload(file: { name: string; type: string; buffer: Buffer }): UploadValidation {
  if (file.buffer.byteLength === 0) {
    return { valid: false, error: 'Le fichier est vide.' };
  }
  if (file.buffer.byteLength > MAX_LOGO_SIZE_BYTES) {
    return { valid: false, error: 'Le fichier dépasse la taille maximale autorisée (2 Mo).' };
  }

  const declared = file.type.toLowerCase();
  const isSvgDeclared = declared.includes('svg');
  const looksLikeSvg = file.buffer.toString('utf8', 0, Math.min(400, file.buffer.byteLength)).includes('<svg');

  if (isSvgDeclared || looksLikeSvg) {
    return { valid: true, mimeType: 'image/svg+xml', extension: 'svg' };
  }

  for (const entry of MAGIC_NUMBERS) {
    if (matchesSignature(file.buffer, entry.signature)) {
      return { valid: true, mimeType: entry.type, extension: ALLOWED_IMAGE_TYPES[entry.type] };
    }
  }

  return {
    valid: false,
    error: 'Format non pris en charge. Utilisez un fichier PNG, JPG, WEBP ou SVG.',
  };
}

const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'embed',
  'object',
  'audio',
  'video',
  'animate',
  'set',
  'handler',
  'listener',
]);

const SAFE_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'symbol',
  'use',
  'title',
  'desc',
  'style',
  'metadata',
]);

const SAFE_ATTRIBUTES = new Set([
  'xmlns',
  'xmlns:xlink',
  'viewbox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'id',
  'class',
  'style',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'patternunits',
  'preserveaspectratio',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'version',
  'role',
  'aria-label',
]);

function isUnsafeValue(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  if (normalized.startsWith('javascript:')) return true;
  if (normalized.startsWith('data:text/html')) return true;
  if (/url\((?!['"]?#)/.test(normalized)) return true;
  if (/<|>/.test(value)) return true;
  if (/expression\(/.test(normalized)) return true;
  return false;
}

/**
 * Assainit un SVG : ne conserve que les éléments et attributs autorisés.
 * Retourne un SVG sécurisé ou lève une erreur si le document est inexploitable.
 */
export function sanitizeSvg(input: Buffer): string {
  const source = input.toString('utf8');
  // Analyse silencieuse : les erreurs de syntaxe sont traitées plus bas (structure vérifiée).
  const parser = new DOMParser({ errorHandler: () => undefined });

  const document = parser.parseFromString(source, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Le fichier SVG est invalide.');
  }

  const clean = (element: XmlElement): void => {
    const children = Array.from(element.childNodes);
    for (const node of children) {
      if (node.nodeType === 1) {
        const child = node as unknown as XmlElement;
        const tag = child.nodeName.toLowerCase();
        if (FORBIDDEN_ELEMENTS.has(tag) || (!SAFE_ELEMENTS.has(tag) && tag !== 'svg')) {
          element.removeChild(child);
          continue;
        }
        const attributes = Array.from(child.attributes);
        for (const attribute of attributes) {
          const name = attribute.name.toLowerCase();
          const value = attribute.value ?? '';
          const isDataUri = name === 'href' || name === 'xlink:href';
          if (name.startsWith('on')) {
            child.removeAttribute(attribute.name);
            continue;
          }
          if (!SAFE_ATTRIBUTES.has(name) && !(isDataUri && value.startsWith('#'))) {
            child.removeAttribute(attribute.name);
            continue;
          }
          if (isUnsafeValue(value)) {
            child.removeAttribute(attribute.name);
          }
        }
        clean(child);
      } else if (node.nodeType === 4 || node.nodeType === 8) {
        // Sections CDATA et commentaires : supprimées par précaution.
        element.removeChild(node);
      }
    }
  };

  clean(root);

  // Attributs racine minimalistes et sûrs.
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!root.getAttribute('viewBox') && root.getAttribute('width') && root.getAttribute('height')) {
    const width = Number.parseFloat(root.getAttribute('width') ?? '0');
    const height = Number.parseFloat(root.getAttribute('height') ?? '0');
    if (width > 0 && height > 0) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const serialized = new XMLSerializer().serializeToString(root);
  if (serialized.length > 500_000) {
    throw new Error('Le fichier SVG est trop volumineux.');
  }
  if (/on[a-z]+\s*=/i.test(serialized) || /<script/i.test(serialized)) {
    throw new Error("Le fichier SVG contient du code potentiellement dangereux et a été rejeté.");
  }
  return serialized;
}

/** Assainit un SVG uniquement s'il s'agit bien d'un SVG ; sinon renvoie le buffer. */
export function sanitizeImageBuffer(buffer: Buffer, mimeType: string): Buffer {
  if (mimeType !== 'image/svg+xml') return buffer;
  return Buffer.from(sanitizeSvg(buffer), 'utf8');
}
