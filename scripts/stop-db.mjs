#!/usr/bin/env node
/**
 * Arrête le cluster PostgreSQL embarqué de développement.
 *
 * Le serveur peut avoir été démarré par `npm run db:start` *ou* en arrière-plan
 * par `npm run setup` : on ne peut donc pas se fier à la liste des processus
 * enfants de ce script. On lit le PID écrit par PostgreSQL (`postmaster.pid`)
 * et on lui envoie un arrêt propre (SIGINT = arrêt rapide), en vérifiant que le
 * port est bien libéré. Sans ce contrôle, l'ancien script annonçait « arrêté »
 * alors que le serveur continuait de tourner.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.PGDATA_DIR ? resolve(process.env.PGDATA_DIR) : resolve(root, '.pgdata');
const PORT = Number(process.env.PGPORT ?? 54329);
const HOST = '127.0.0.1';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function isListening() {
  return new Promise((done) => {
    const socket = createConnection({ host: HOST, port: PORT });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  const pidFile = resolve(DATA_DIR, 'postmaster.pid');
  if (!existsSync(pidFile)) return null;
  const [first] = readFileSync(pidFile, 'utf8').split('\n');
  const pid = Number.parseInt(first ?? '', 10);
  return Number.isFinite(pid) && pid > 1 ? pid : null;
}

async function main() {
  if (!(await isListening()) && !existsSync(resolve(DATA_DIR, 'postmaster.pid'))) {
    console.log('[db] aucun serveur local à arrêter.');
    return;
  }

  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    if (await isListening()) {
      console.warn(
        `[db] le port ${PORT} est occupé par un processus qui n'est pas le cluster local (${DATA_DIR}).\n` +
          `[db] arrêtez-le manuellement : ss -ltnp | grep :${PORT}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log('[db] le serveur était déjà arrêté (fichier de PID obsolète).');
    return;
  }

  console.log(`[db] arrêt de PostgreSQL (PID ${pid})…`);
  try {
    process.kill(pid, 'SIGINT');
  } catch (error) {
    console.warn('[db] signal impossible :', String(error?.message ?? error));
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(500);
    if (!isAlive(pid) && !(await isListening())) {
      console.log('[db] PostgreSQL arrêté.');
      return;
    }
  }

  console.warn('[db] le serveur ne s’est pas arrêté dans les 15 s ; nouvel essai avec SIGTERM…');
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // déjà terminé
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(500);
    if (!(await isListening())) {
      console.log('[db] PostgreSQL arrêté.');
      return;
    }
  }

  console.error(`[db] échec de l'arrêt : le port ${PORT} répond toujours.`);
  process.exitCode = 1;
}

main();
