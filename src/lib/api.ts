import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

/** Réponse JSON standardisée de l'API MON DEVIS. */
export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(message: string, status = 400, extra?: Omit<ApiError, 'error'>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export const errors = {
  unauthorized: () => jsonError('Vous devez être connecté pour effectuer cette action.', 401, { code: 'UNAUTHORIZED' }),
  forbidden: (message = "Vous n'avez pas les droits nécessaires pour cette action.") =>
    jsonError(message, 403, { code: 'FORBIDDEN' }),
  notFound: (message = 'Ressource introuvable.') => jsonError(message, 404, { code: 'NOT_FOUND' }),
  conflict: (message: string) => jsonError(message, 409, { code: 'CONFLICT' }),
  validation: (details: unknown) =>
    jsonError('Les données envoyées sont invalides.', 422, { code: 'VALIDATION_ERROR', details }),
  rateLimited: (retryAfter?: number) =>
    NextResponse.json(
      { error: 'Trop de requêtes. Merci de réessayer dans quelques instants.', code: 'RATE_LIMITED' },
      { status: 429, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined },
    ),
  server: (message = 'Une erreur inattendue est survenue. Merci de réessayer.') =>
    jsonError(message, 500, { code: 'SERVER_ERROR' }),
  quota: (message: string, details?: unknown) => jsonError(message, 402, { code: 'QUOTA_EXCEEDED', details }),
};

/** Valide un corps de requête avec Zod et normalise les erreurs. */
export async function parseJson<T>(request: Request, schema: ZodSchema<T>): Promise<{ data: T } | { response: NextResponse }> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { response: jsonError('Corps de requête JSON invalide.', 400, { code: 'INVALID_JSON' }) };
  }
  return parsePayload(payload, schema);
}

export function parsePayload<T>(payload: unknown, schema: ZodSchema<T>): { data: T } | { response: NextResponse } {
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { response: errors.validation(formatZodError(result.error)) };
  }
  return { data: result.data };
}

/** Transforme une erreur Zod en structure lisible { champ: message }. */
export function formatZodError(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  error.issues.forEach((issue) => {
    const path = issue.path.join('.') || 'global';
    if (!formatted[path]) formatted[path] = issue.message;
  });
  return formatted;
}

/** Enveloppe une route API : convertit les exceptions en réponse JSON propre. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse | Response>,
) {
  return async (...args: Args): Promise<NextResponse | Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return errors.validation(formatZodError(error));
      }
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error('[api] erreur inattendue:', message);
      if (process.env.NODE_ENV !== 'production') {
        return jsonError(message, 500, { code: 'SERVER_ERROR' });
      }
      return errors.server();
    }
  };
}

/** Lit un paramètre numérique de query string. */
export function queryNumber(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Pagination standard (page 1-indexée). */
export function parsePagination(params: URLSearchParams, defaults: { pageSize?: number; maxPageSize?: number } = {}) {
  const pageSize = Math.min(Math.max(queryNumber(params, 'pageSize', defaults.pageSize ?? 10), 1), defaults.maxPageSize ?? 100);
  const page = Math.max(queryNumber(params, 'page', 1), 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
