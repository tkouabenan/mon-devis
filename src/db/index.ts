import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '@/lib/env';

/**
 * Connexion PostgreSQL (pool partagé, réutilisé entre les rechargements à chaud
 * et les invocations serverless d'une même instance).
 */

const globalForDb = globalThis as unknown as {
  __monDevisPool?: Pool;
  __monDevisDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function createPool(): Pool {
  if (!env.databaseUrl) {
    throw new Error(
      "DATABASE_URL n'est pas configurée. Lancez `npm run db:start` puis copiez .env.example vers .env.",
    );
  }
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: env.isProduction ? 10 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: !env.isProduction,
  });
  pool.on('error', (error) => {
    console.error('[db] erreur du pool PostgreSQL :', error.message);
  });
  return pool;
}

export const pool = globalForDb.__monDevisPool ?? createPool();
if (!env.isProduction) globalForDb.__monDevisPool = pool;

export const db =
  globalForDb.__monDevisDb ??
  drizzle(pool, {
    schema,
    logger: process.env.DEBUG_SQL === '1',
  });
if (!env.isProduction) globalForDb.__monDevisDb = db;

export { schema };
export type Database = typeof db;
