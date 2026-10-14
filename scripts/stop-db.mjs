#!/usr/bin/env node
/** Arrête le cluster PostgreSQL embarqué de développement. */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const DATA_DIR = process.env.PGDATA_DIR ? resolve(process.env.PGDATA_DIR) : resolve(root, '.pgdata');
const DATABASE_DIR_PATTERN = /postmaster\.pid$/;

async function main() {
  if (!existsSync(DATA_DIR)) {
    console.log('[db] aucun cluster local trouvé.');
    return;
  }
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: process.env.PGUSER ?? 'mondevis',
    password: process.env.PGPASSWORD ?? 'mondevis',
    port: Number(process.env.PGPORT ?? 54329),
    persistent: true,
    onLog: () => {},
  });
  try {
    await pg.stop();
    console.log('[db] PostgreSQL arrêté.');
  } catch (error) {
    console.warn('[db] le serveur était déjà arrêté :', String(error?.message ?? error).split('\n')[0]);
  }
}

void DATABASE_DIR_PATTERN;
main();
