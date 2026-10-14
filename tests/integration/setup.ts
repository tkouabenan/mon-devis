/**
 * Configuration des tests d'intégration.
 *
 * La base ciblée est `mon_devis_test` (jamais la base de développement ni de
 * production) : on remplace explicitement DATABASE_URL avant le chargement des
 * modules applicatifs, qui valident l'environnement à l'import.
 */
import 'dotenv/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://mondevis:mondevis@127.0.0.1:54329/mon_devis_test?schema=public';

if (!/mon_devis_test/.test(TEST_DATABASE_URL)) {
  throw new Error(
    `Refus de lancer les tests d'intégration : la base cible doit être mon_devis_test (reçu : ${TEST_DATABASE_URL}).`,
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-mon-devis-integration-0123456789';
