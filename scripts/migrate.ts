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
    // `--reset` supprime TOUT le schéma public (tables, données, extensions).
    // Refusé sur une base distante : sur Supabase/Neon/RDS, cela détruirait la
    // production et les extensions installées (pgcrypto, pg_stat_statements…).
    const host = databaseUrl.replace(/^[a-z]+:\/\//, '').split('@').pop()?.split('/')[0]?.split(':')[0] ?? '';
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (!isLocal) {
      console.error(`[migrate] --reset refusé : la base « ${host} » n'est pas locale.`);
      console.error('[migrate] cette option supprime tout le schéma public. Pour réinitialiser une');
      console.error('[migrate] base distante, passez par la console de votre hébergeur.');
      await pool.end();
      process.exit(1);
    }
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
