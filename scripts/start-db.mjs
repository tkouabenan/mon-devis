#!/usr/bin/env node
/**
 * Démarre un serveur PostgreSQL local embarqué (développement uniquement).
 *
 * En production, utilisez un PostgreSQL managé (Neon, Supabase, RDS, Railway…)
 * et renseignez simplement DATABASE_URL.
 *
 * Usage :
 *   node scripts/start-db.mjs          # démarre (idempotent)
 *   node scripts/start-db.mjs --reset  # supprime le cluster puis recrée
 */
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const DATA_DIR = process.env.PGDATA_DIR ? resolve(process.env.PGDATA_DIR) : resolve(root, '.pgdata');
const PORT = Number(process.env.PGPORT ?? 54329);
const USER = process.env.PGUSER ?? 'mondevis';
const PASSWORD = process.env.PGPASSWORD ?? 'mondevis';
const DATABASES = ['mon_devis', 'mon_devis_test'];

const reset = process.argv.includes('--reset');

async function main() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  if (reset && existsSync(DATA_DIR)) {
    console.log(`[db] suppression du cluster existant : ${DATA_DIR}`);
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(DATA_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
  });

  const alreadyInitialised = existsSync(resolve(DATA_DIR, 'PG_VERSION'));
  if (!alreadyInitialised) {
    console.log(`[db] initialisation du cluster dans ${DATA_DIR}`);
    await pg.initialise();
  }

  console.log(`[db] démarrage de PostgreSQL sur le port ${PORT}…`);
  await pg.start();

  for (const database of DATABASES) {
    try {
      await pg.createDatabase(database);
      console.log(`[db] base créée : ${database}`);
    } catch (error) {
      const message = String(error?.message ?? error);
      if (/already exists|existe déjà|déjà/i.test(message)) {
        console.log(`[db] base déjà présente : ${database}`);
      } else {
        console.warn(`[db] avertissement création ${database} : ${message.split('\n')[0]}`);
      }
    }
  }

  console.log(`\n[db] PostgreSQL prêt : postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/mon_devis`);
  console.log('[db] laisser ce processus actif pendant le développement.\n');

  const shutdown = async (signal) => {
    console.log(`\n[db] arrêt demandé (${signal})…`);
    try {
      await pg.stop();
    } catch (error) {
      console.warn('[db] arrêt forcé :', String(error?.message ?? error));
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Garde le processus actif.
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error('[db] échec du démarrage :', error);
  process.exit(1);
});
