import { defineConfig } from 'drizzle-kit';

/**
 * Configuration Drizzle Kit (génération et application des migrations SQL).
 * Les migrations sont de simples fichiers SQL versionnés dans ./drizzle.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://mondevis:mondevis@127.0.0.1:54329/mon_devis',
  },
  strict: true,
  verbose: true,
});
