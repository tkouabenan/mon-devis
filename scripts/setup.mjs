#!/usr/bin/env node
/**
 * Remise en route automatique de l'environnement de développement.
 *
 *   npm run setup              # installe, démarre la base, migre et charge la démo
 *   npm run setup -- --no-seed # sans le jeu de démonstration
 *   npm run setup -- --reset   # base repartie de zéro (migrations + démo)
 *
 * Ce script existe parce qu'un environnement fraîchement cloné (ou réinitialisé)
 * ne contient ni `node_modules`, ni `.env`, ni base de données : sans eux, la
 * page de connexion s'affiche mais aucun compte n'existe et le tableau de bord
 * est inaccessible. Il est idempotent : le relancer ne casse rien.
 *
 * Il n'utilise que les modules natifs de Node — il doit pouvoir s'exécuter alors
 * que `node_modules` n'existe pas encore.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipSeed = args.includes('--no-seed');
const reset = args.includes('--reset');

const DB_PORT = Number(process.env.PGPORT ?? 54329);
const DB_HOST = '127.0.0.1';

function log(step, message) {
  console.log(`\n[setup] ${step} — ${message}`);
}

function fail(message) {
  console.error(`\n[setup] ✗ ${message}\n`);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* 1. Fichier .env                                                            */
/* -------------------------------------------------------------------------- */

function ensureEnvFile() {
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    const missing = ['DATABASE_URL', 'AUTH_SECRET', 'NEXT_PUBLIC_APP_URL'].filter((key) => !new RegExp(`^${key}=`, 'm').test(content));
    if (!/^TEST_DATABASE_URL=/m.test(content)) {
      writeFileSync(envPath, `${content.replace(/\s*$/, '')}\n\n# Base utilisée par les tests d'intégration\nTEST_DATABASE_URL="postgresql://mondevis:mondevis@127.0.0.1:${DB_PORT}/mon_devis_test?schema=public"\n`, 'utf8');
      log('1/5', '.env complété avec TEST_DATABASE_URL (base des tests d’intégration)');
      return;
    }
    if (missing.length === 0) {
      log('1/5', '.env déjà présent et complet');
      return;
    }
    console.warn(`[setup] .env incomplet (${missing.join(', ')}) : complétez-le si l'application refuse de démarrer.`);
    return;
  }

  const examplePath = resolve(root, '.env.example');
  if (!existsSync(examplePath)) fail('.env.example introuvable : impossible de créer .env.');

  const secret = randomBytes(48).toString('base64');
  const salt = randomBytes(16).toString('hex');
  const content = readFileSync(examplePath, 'utf8')
    .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret}"`)
    .replace(/^IP_HASH_SALT=.*$/m, `IP_HASH_SALT="${salt}"`);

  writeFileSync(envPath, content, 'utf8');
  log('1/5', '.env créé avec des secrets générés aléatoirement (AUTH_SECRET, IP_HASH_SALT)');
}

/* -------------------------------------------------------------------------- */
/* 2. Dépendances                                                             */
/* -------------------------------------------------------------------------- */

function ensureDependencies() {
  if (existsSync(resolve(root, 'node_modules')) && existsSync(resolve(root, 'node_modules', 'next'))) {
    log('2/5', 'dépendances déjà installées');
    return;
  }
  log('2/5', 'installation des dépendances (npm ci)…');
  const result = spawnSync('npm', ['ci'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) fail('échec de « npm ci ». Vérifiez votre connexion réseau puis relancez `npm run setup`.');
}

/* -------------------------------------------------------------------------- */
/* 3. Base de données locale                                                  */
/* -------------------------------------------------------------------------- */

function pingDatabase() {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: DB_HOST, port: DB_PORT });
    const done = (value) => {
      socket.destroy();
      resolvePromise(value);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function ensureDatabase() {
  if (await pingDatabase()) {
    log('3/5', `PostgreSQL répond déjà sur ${DB_HOST}:${DB_PORT}`);
    return;
  }

  if (reset && existsSync(resolve(root, '.pgdata'))) {
    log('3/5', 'réinitialisation demandée : suppression du cluster existant');
    const { rmSync } = await import('node:fs');
    rmSync(resolve(root, '.pgdata'), { recursive: true, force: true });
  }

  log('3/5', `démarrage de PostgreSQL embarqué sur le port ${DB_PORT} (en arrière-plan)…`);
  const logsDir = resolve(root, 'var');
  mkdirSync(logsDir, { recursive: true });
  const out = openSync(resolve(logsDir, 'db.log'), 'a');
  const child = spawn('node', ['scripts/start-db.mjs'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(1000);
    if (await pingDatabase()) {
      log('3/5', `PostgreSQL prêt (journal : var/db.log, arrêt : npm run db:stop)`);
      return;
    }
  }
  fail('la base n’a pas démarré dans les 40 s. Consultez var/db.log.');
}

/* -------------------------------------------------------------------------- */
/* 4 et 5. Migrations puis jeu de démonstration                               */
/* -------------------------------------------------------------------------- */

function runNpm(script, extra = []) {
  const result = spawnSync('npm', ['run', script, ...(extra.length ? ['--', ...extra] : [])], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) fail(`l’étape « npm run ${script} » a échoué.`);
}

/** Lit une variable simple dans .env (sans gérer les cas exotiques). */
function readEnvValue(key) {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return undefined;
  const match = readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return undefined;
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/** `mon_devis` → `mon_devis_test`, pour appliquer le schéma à la base des tests. */
function deriveTestDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return `postgresql://mondevis:mondevis@${DB_HOST}:${DB_PORT}/mon_devis_test?schema=public`;
  return databaseUrl.replace(/(\/[^/?]+)(\?|$)/, (_match, name, suffix) =>
    name.endsWith('_test') ? `${name}${suffix}` : `${name}_test${suffix}`,
  );
}

async function main() {
  console.log('[setup] Remise en route de MON DEVIS');

  ensureEnvFile();
  ensureDependencies();
  await ensureDatabase();

  log('4/5', 'application des migrations (base de développement)');
  runNpm('db:migrate');

  const testDatabaseUrl = readEnvValue('TEST_DATABASE_URL') ?? deriveTestDatabaseUrl(readEnvValue('DATABASE_URL'));
  log('4/5', 'application des migrations (base des tests d’intégration)');
  const migration = spawnSync('npm', ['run', 'db:migrate'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
  if (migration.status !== 0) fail('les migrations de la base de test ont échoué.');

  if (skipSeed) {
    log('5/5', 'jeu de démonstration ignoré (--no-seed)');
  } else {
    log('5/5', 'chargement du jeu de démonstration (comptes + données)');
    runNpm('db:seed');
  }

  console.log(`
[setup] ✓ Environnement prêt.

  Application   : npm run dev  →  http://localhost:3000
  Connexion     : http://localhost:3000/connexion

  Comptes de démonstration (créés à l'étape 5, visibles sur la page de connexion) :
    demo@mon-devis.app        Demo2026!    propriétaire — Bâtir & Conseil SARL (formule Pro)
    commercial@mon-devis.app  Demo2026!    membre de l'équipe (accès limité)
    studio@mon-devis.app      Demo2026!    second espace — Studio Créatif Abidjan (formule gratuite)
    admin@mon-devis.app       Admin2026!   administration de la plateforme

  Base de données : npm run db:stop pour l'arrêter · var/db.log pour le journal
  Tests           : npm run verify (unitaires) · npm run test:integration (base réelle)
`);
}

main().catch((error) => {
  console.error('[setup] échec :', error);
  process.exit(1);
});
