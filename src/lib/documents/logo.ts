import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { env } from '@/lib/env';

/**
 * Prépare le logo de l'entreprise pour les exports PDF/DOCX/XLSX.
 *
 * Contraintes :
 *  - PDF (pdfkit) et DOCX (docx) n'acceptent que PNG/JPEG (pas de SVG, pas de WebP) ;
 *  - les logos distants sont téléchargés une fois puis convertis ;
 *  - toute erreur est non bloquante : un devis sans logo reste valide.
 */

export interface PreparedLogo {
  /** Image encodable dans un PDF ou un DOCX (PNG/JPEG). */
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  dataUri: string;
  width: number;
  height: number;
}

async function readLogoBytes(url: string): Promise<Buffer | null> {
  try {
    // Fichier servi par l'application (stockage local).
    if (url.startsWith('/api/files/')) {
      const key = decodeURIComponent(url.replace('/api/files/', ''));
      if (key.includes('..') || key.startsWith('/')) return null;
      const root = resolve(process.cwd(), env.storage.localDir);
      const target = resolve(join(root, key));
      if (!target.startsWith(root + sep)) return null;
      return await readFile(target);
    }

    if (url.startsWith('data:')) {
      const base64 = url.split(',').pop() ?? '';
      const buffer = Buffer.from(base64, 'base64');
      return buffer.byteLength > 0 ? buffer : null;
    }

    if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return null;
  } catch {
    return null;
  }
}

export async function prepareLogo(logoUrl: string | null | undefined): Promise<PreparedLogo | null> {
  if (!logoUrl) return null;
  const raw = await readLogoBytes(logoUrl);
  if (!raw || raw.byteLength === 0) return null;

  const isPng = raw[0] === 0x89 && raw[1] === 0x50;
  const isJpeg = raw[0] === 0xff && raw[1] === 0xd8;

  if (isPng || isJpeg) {
    return {
      buffer: raw,
      mimeType: isPng ? 'image/png' : 'image/jpeg',
      dataUri: `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${raw.toString('base64')}`,
      width: 0,
      height: 0,
    };
  }

  // SVG ou WebP : conversion en PNG. `sharp` est optionnel : en son absence,
  // le document est généré sans logo plutôt que d'échouer.
  try {
    const sharpModule = await import('sharp');
    type SharpFactory = (input: Buffer, options?: { density?: number }) => {
      resize(options: { width: number; withoutEnlargement: boolean; fit: 'inside' }): {
        png(): { toBuffer(): Promise<Buffer> };
      };
    };
    const sharp = ((sharpModule as unknown as { default?: SharpFactory }).default ?? sharpModule) as unknown as SharpFactory;
    const converted = await sharp(raw, { density: 300 })
      .resize({ width: 900, withoutEnlargement: true, fit: 'inside' })
      .png()
      .toBuffer();
    return {
      buffer: converted,
      mimeType: 'image/png',
      dataUri: `data:image/png;base64,${converted.toString('base64')}`,
      width: 0,
      height: 0,
    };
  } catch {
    return null;
  }
}
