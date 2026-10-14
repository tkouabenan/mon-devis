import { createHash } from 'node:crypto';
import { env } from './env';

/**
 * Limitation de débit en mémoire (fenêtre glissante).
 * Suffisant pour une instance unique ; en production multi-instance, brancher
 * un store partagé (Redis/Upstash) via `setRateLimitStore`.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, maxRequests = env.rateLimit.maxRequests, windowSeconds = env.rateLimit.windowSeconds): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  if (now - lastCleanup > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.hits.every((hit) => now - hit > windowMs)) buckets.delete(bucketKey);
    }
    lastCleanup = now;
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);

  if (bucket.hits.length >= maxRequests) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: maxRequests - bucket.hits.length, retryAfterSeconds: 0 };
}

export function resetRateLimit(key?: string): void {
  if (key) buckets.delete(key);
  else buckets.clear();
}

/** Empreinte d'adresse IP : l'IP brute n'est jamais stockée (conformité RGPD). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${env.ipHashSalt}:${ip}`).digest('hex').slice(0, 32);
}

/** Extrait l'adresse IP cliente derrière un proxy (Vercel, Nginx, Cloudflare…). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? null;
}

/**
 * Limites spécifiques aux points sensibles (anti force brute / abus).
 */
export const RateLimits = {
  login: { max: 10, window: 300 },
  register: { max: 8, window: 900 },
  passwordReset: { max: 6, window: 900 },
  publicQuotationView: { max: 60, window: 300 },
  quotationDecision: { max: 10, window: 900 },
  export: { max: 40, window: 300 },
  search: { max: 120, window: 60 },
  upload: { max: 30, window: 600 },
  api: { max: env.rateLimit.maxRequests, window: env.rateLimit.windowSeconds },
} as const;
