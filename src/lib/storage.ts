import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from '@/lib/env';

/**
 * Stockage de fichiers (logos, exports générés).
 *
 * Deux implémentations :
 *  - `local` : disque du serveur (développement, auto-hébergement) — servi par /api/files/...
 *  - `s3`    : tout service compatible S3 (AWS S3, Cloudflare R2, Supabase Storage, MinIO),
 *              utilisé via le SDK AWS chargé dynamiquement. Configurer S3_* dans .env.
 *
 * Les clés sont des UUID : aucune énumération de fichiers n'est possible.
 */

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  checksum: string;
}

export interface SaveFileInput {
  /** Chemin logique, ex. « logos » ou « exports ». */
  scope: string;
  organizationId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function buildKey(input: SaveFileInput): string {
  const unique = crypto.randomUUID();
  return `${sanitizeSegment(input.scope)}/${sanitizeSegment(input.organizationId)}/${unique}-${sanitizeSegment(input.fileName)}`;
}

function localRoot(): string {
  return resolve(process.cwd(), env.storage.localDir);
}

async function saveLocal(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const target = join(localRoot(), key);
  const resolvedTarget = resolve(target);
  if (!resolvedTarget.startsWith(localRoot() + sep)) {
    throw new Error('Chemin de stockage invalide.');
  }
  await mkdir(dirname(resolvedTarget), { recursive: true });
  await writeFile(resolvedTarget, buffer);
  return {
    key,
    url: `/api/files/${key}`,
    size: buffer.byteLength,
    mimeType,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}

async function saveS3(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: env.storage.s3.region || 'auto',
    endpoint: env.storage.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.storage.s3.endpoint),
    credentials: {
      accessKeyId: env.storage.s3.accessKeyId,
      secretAccessKey: env.storage.s3.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: env.storage.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const base = env.storage.s3.publicBaseUrl?.replace(/\/$/, '') || `${env.storage.s3.endpoint?.replace(/\/$/, '')}/${env.storage.s3.bucket}`;
  return {
    key,
    url: `${base}/${key}`,
    size: buffer.byteLength,
    mimeType,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** Enregistre un fichier et retourne son URL publique. */
export async function saveFile(input: SaveFileInput): Promise<StoredFile> {
  const key = buildKey(input);
  if (env.storage.driver === 's3') {
    if (!env.storage.s3.configured) {
      throw new Error(
        "Le stockage S3 est sélectionné mais incomplet : renseignez S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.",
      );
    }
    return saveS3(key, input.buffer, input.mimeType);
  }
  return saveLocal(key, input.buffer, input.mimeType);
}

/** Lit un fichier stocké localement (utilisé par /api/files). */
export async function readLocalFile(key: string): Promise<Buffer | null> {
  const root = localRoot();
  const target = resolve(root, key);
  if (!target.startsWith(root + sep)) return null;
  try {
    return await readFile(target);
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (env.storage.driver === 's3') {
    if (!env.storage.s3.configured) return;
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: env.storage.s3.region || 'auto',
      endpoint: env.storage.s3.endpoint || undefined,
      forcePathStyle: Boolean(env.storage.s3.endpoint),
      credentials: {
        accessKeyId: env.storage.s3.accessKeyId,
        secretAccessKey: env.storage.s3.secretAccessKey,
      },
    });
    await client.send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
    return;
  }
  const root = localRoot();
  const target = resolve(root, key);
  if (!target.startsWith(root + sep)) return;
  await unlink(target).catch(() => undefined);
}

/** Clé de stockage à partir d'une URL interne (/api/files/...) ou distante. */
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/files\/(.+)$/);
  if (match) return decodeURIComponent(match[1]);
  if (env.storage.s3.publicBaseUrl && url.startsWith(env.storage.s3.publicBaseUrl)) {
    return url.slice(env.storage.s3.publicBaseUrl.length).replace(/^\//, '');
  }
  return null;
}

export function storageIsConfigured(): boolean {
  if (env.storage.driver === 's3') return env.storage.s3.configured;
  return true;
}
