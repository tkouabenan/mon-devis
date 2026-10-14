import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Tests d'intégration : ils s'exécutent contre une vraie base PostgreSQL
 * (`mon_devis_test`) et couvrent les parcours critiques :
 * authentification, isolation par organisation, calculs, CRUD devis,
 * transitions de statut, exports, conversion en facture et limites de formule.
 *
 * Prérequis : `npm run db:start`, puis `DATABASE_URL=…mon_devis_test npm run db:migrate`.
 * Lancement : `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    // Les suites partagent la même base : exécution séquentielle pour éviter
    // les verrous croisés et garantir des compteurs de numérotation stables.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
