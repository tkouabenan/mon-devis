import { keyFromUrl, readLocalFile } from '@/lib/storage';
import { env } from '@/lib/env';

/**
 * Chargement des ressources d'image (logo) pour les générateurs de documents.
 * Les SVG et WEBP sont convertis en PNG (formats lus nativement par PDFKit et docx).
 */

export interface LoadedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

const PASSTHROUGH_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

async function fetchRemote(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** Récupère le contenu binaire d'un logo à partir de son URL stockée. */
export async function loadImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  const key = keyFromUrl(url);
  if (key && env.storage.driver === 'local') {
    const file = await readLocalFile(key);
    if (file) return file;
  }
  if (/^https?:\/\//i.test(url)) {
    const remote = await fetchRemote(url);
    if (remote) return remote;
  }
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1];
    if (base64) return Buffer.from(base64, 'base64');
  }
  const relative = url.startsWith('/') ? `${env.appUrl}${url}` : null;
  if (relative) return fetchRemote(relative);
  return null;
}

/** Convertit (si nécessaire) et mesure une image pour l'intégrer à un document. */
export async function loadDocumentImage(url: string | null | undefined): Promise<LoadedImage | null> {
  const raw = await loadImageBuffer(url);
  if (!raw || raw.byteLength === 0) return null;

  const head = raw.toString('utf8', 0, Math.min(400, raw.byteLength));
  const looksLikeSvg = head.includes('<svg');
  const isPng = raw[0] === 0x89 && raw[1] === 0x50;
  const isJpeg = raw[0] === 0xff && raw[1] === 0xd8;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sharpModule = (await import('sharp')) as any;
    const sharp = sharpModule.default ?? sharpModule;

    if (looksLikeSvg || (!isPng && !isJpeg)) {
      const png = await sharp(raw, { density: 300 }).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer();
      const metadata = await sharp(png).metadata();
      return { buffer: png, mimeType: 'image/png', width: metadata.width ?? 0, height: metadata.height ?? 0 };
    }

    const metadata = await sharp(raw).metadata();
    return { buffer: raw, mimeType: isPng ? 'image/png' : 'image/jpeg', width: metadata.width ?? 0, height: metadata.height ?? 0 };
  } catch (error) {
    if (PASSTHROUGH_TYPES.has(looksLikeSvg ? 'image/svg+xml' : isPng ? 'image/png' : 'image/jpeg') && (isPng || isJpeg)) {
      return { buffer: raw, mimeType: isPng ? 'image/png' : 'image/jpeg', width: 0, height: 0 };
    }
    console.warn('[assets] conversion d’image impossible :', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Convertit une image en URI de données base64 (nécessaire pour les exports DOCX). */
export async function loadImageDataUri(url: string | null | undefined): Promise<string | null> {
  const image = await loadDocumentImage(url);
  if (!image) return null;
  return `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;
}
