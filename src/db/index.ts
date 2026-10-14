import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '@/lib/env';

/**
 * Connexion PostgreSQL (pool partagé, réutilisé entre les rechargements à chaud
 * et les invocations serverless d'une même instance).
 *
 * La connexion est créée **paresseusement**, au premier accès réel : importer ce
 * module n'ouvre aucune socket et ne réclame aucune variable d'environnement.
 * C'est indispensable pour que `next build` (qui charge les modules de chaque
 * route pour collecter les données de page) réussisse dans un environnement de
 * build sans secret — sur Vercel par exemple — et pour que l'erreur de
 * configuration apparaisse clairement à la requête, plus le message de la sonde
 * `/api/health`.
 */

type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __monDevisPool?: Pool;
  __monDevisDb?: DrizzleDatabase;
};

export function createPool(): Pool {
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

/** Pool partagé, créé au premier accès (jamais à l'import). */
export function getPool(): Pool {
  if (globalForDb.__monDevisPool) return globalForDb.__monDevisPool;
  const created = createPool();
  // En production serverless, le pool vit le temps de l'instance ; on le mémorise
  // systématiquement pour éviter d'ouvrir une connexion par requête.
  globalForDb.__monDevisPool = created;
  return created;
}

/** Instance Drizzle, créée au premier accès réel. */
export function getDb(): DrizzleDatabase {
  if (globalForDb.__monDevisDb) return globalForDb.__monDevisDb;
  const instance = drizzle(getPool(), {
    schema,
    logger: process.env.DEBUG_SQL === '1',
  });
  globalForDb.__monDevisDb = instance;
  return instance;
}

/**
 * Client Drizzle utilisable exactement comme l'instance réelle (`db.select()`,
 * `db.insert()`, `db.transaction()`…). Les accès sont transparents : le pool et
 * l'instance ne sont créés qu'à la première opération.
 */
export const db = new Proxy({} as DrizzleDatabase, {
  get(_target, property) {
    const instance = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = instance[property];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
  has(_target, property) {
    return property in (getDb() as unknown as object);
  },
});

export { schema };
export type Database = DrizzleDatabase;
