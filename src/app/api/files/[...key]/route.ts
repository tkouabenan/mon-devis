import { NextResponse } from 'next/server';
import { readLocalFile } from '@/lib/storage';
import { env } from '@/lib/env';

/**
 * Sert les fichiers stockés localement (logos, exports temporaires).
 * En production, préférez un stockage objet (S3, R2, Supabase Storage) :
 * l'URL publique est alors fournie directement par le fournisseur.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (env.storage.driver !== 'local') {
    return NextResponse.json({ error: 'Stockage local désactivé sur cette instance.' }, { status: 404 });
  }

  const { key } = await params;
  const path = key.join('/');

  // Protection contre la traversée de répertoire.
  if (!path || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'Chemin invalide.' }, { status: 400 });
  }

  const buffer = await readLocalFile(path);
  if (!buffer) {
    return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
  }

  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const contentType = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
  const inline = contentType.startsWith('image/') || contentType === 'application/pdf';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${path.split('/').pop() ?? 'fichier'}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
