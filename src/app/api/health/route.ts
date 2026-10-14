import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { env } from '@/lib/env';

/**
 * GET /api/health
 *
 * Sonde de déploiement : vérifie réellement la connexion PostgreSQL, la présence
 * des migrations attendues et la configuration du stockage des fichiers.
 * Aucune donnée métier n'est exposée (pas de nom d'organisation, pas de contenu).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CheckResult {
  status: 'ok' | 'error' | 'warning';
  message: string;
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const started = Date.now();
    await db.execute(sql`select 1`);
    const latency = Date.now() - started;

    const migrations = await db.execute<{ version: string }>(sql`select hash as version from drizzle.__drizzle_migrations limit 5`);
    return {
      status: 'ok',
      message: `Connexion PostgreSQL établie (${latency} ms) · ${migrations.rows.length} migration(s) appliquée(s)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not exist') && message.includes('__drizzle_migrations')) {
      return { status: 'error', message: 'Base joignable mais aucune migration appliquée : exécutez `npm run db:migrate`.' };
    }
    return { status: 'error', message: `Base de données injoignable : ${message}` };
  }
}

function checkStorage(): CheckResult {
  if (env.storage.driver === 's3') {
    return env.storage.s3.configured
      ? { status: 'ok', message: `Stockage S3 configuré (bucket « ${env.storage.s3.bucket} »)` }
      : { status: 'warning', message: 'Stockage S3 sélectionné mais incomplet : renseignez S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.' };
  }
  if (env.isProduction) {
    return {
      status: 'warning',
      message:
        'Stockage local en production : le disque des hébergements serverless est éphémère (les fichiers envoyés sont perdus au redéploiement). Configurez STORAGE_DRIVER=s3 pour conserver logos et exports.',
    };
  }
  return { status: 'ok', message: `Stockage local (${env.storage.localDir})` };
}

function checkAuth(): CheckResult {
  // Lecture directe de la variable : `env.authSecret` lève une exception en
  // production, or la sonde doit rapporter l'état réel sans faire tomber la route.
  const secret = (process.env.AUTH_SECRET ?? '').trim();

  if (!secret) {
    return env.isProduction
      ? {
          status: 'error',
          message:
            "AUTH_SECRET est absent : les sessions, les jetons de partage et les liens de réinitialisation ne peuvent pas être signés. " +
            'Générez un secret avec `openssl rand -base64 48`, ajoutez-le aux variables d’environnement, puis redéployez.',
        }
      : { status: 'warning', message: 'AUTH_SECRET de développement : à remplacer avant mise en production' };
  }

  if (secret.length < 32) {
    return {
      status: env.isProduction ? 'error' : 'warning',
      message: `AUTH_SECRET ne fait que ${secret.length} caractères (32 minimum). Régénérez-le avant d’exposer l’application.`,
    };
  }

  return { status: 'ok', message: 'AUTH_SECRET configuré (32 caractères ou plus)' };
}

function checkPayments(): CheckResult {
  if (env.payments.provider === 'none') {
    return { status: 'warning', message: 'Aucun prestataire de paiement configuré : les formules payantes sont activées manuellement.' };
  }
  return env.payments.canCharge
    ? { status: 'ok', message: `Prestataire de paiement « ${env.payments.provider} » configuré` }
    : { status: 'warning', message: `Prestataire « ${env.payments.provider} » sélectionné mais clés manquantes.` };
}

export async function GET() {
  const [database] = await Promise.all([checkDatabase()]);
  const checks = {
    environment: {
      status: env.isProduction ? ('ok' as const) : ('warning' as const),
      message: `Environnement « ${env.nodeEnv} » · URL publique ${env.appUrl}`,
    },
    database,
    storage: checkStorage(),
    auth: checkAuth(),
    email: {
      status: env.email.driver === 'console' ? ('warning' as const) : ('ok' as const),
      message:
        env.email.driver === 'console'
          ? 'Aucun fournisseur d’e-mail configuré : les messages sont journalisés, pas envoyés.'
          : `Fournisseur d’e-mail « ${env.email.driver} » configuré`,
    },
    payments: checkPayments(),
  };

  const failed = Object.values(checks).some((check) => check.status === 'error');
  return NextResponse.json(
    {
      application: env.appName,
      status: failed ? 'degraded' : 'ok',
      checkedAt: new Date().toISOString(),
      checks,
    },
    { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
