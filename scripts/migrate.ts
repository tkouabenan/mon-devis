#!/usr/bin/env tsx
/**
 * Applique les migrations SQL sur la base ciblée par DATABASE_URL.
 *
 *   tsx scripts/migrate.ts                 # applique les migrations en attente
 *   tsx scripts/migrate.ts --reset         # supprime le schéma puis réapplique
 *   DATABASE_URL=… tsx scripts/migrate.ts  # base de test / production
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../drizzle');

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://mondevis:mondevis@127.0.0.1:54329/mon_devis';

async function main() {
  const reset = process.argv.includes('--reset');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const db = drizzle(pool);

  console.log(`[migrate] base ciblée : ${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`);

  if (reset) {
    console.log('[migrate] suppression du schéma public…');
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  }

  await migrate(db, { migrationsFolder });
  console.log('[migrate] migrations appliquées avec succès ✅');

  await pool.end();
}

main().catch((error) => {
  console.error('[migrate] échec :', error);
  process.exit(1);
});
