import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { checkDatabaseAvailability } from '@/lib/db-health';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à votre espace MON DEVIS pour gérer vos devis, vos clients et vos statistiques.',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; verified?: string; reset?: string }>;
}) {
  // Vérifié avant la session : si la base est injoignable, la connexion doit
  // l'annoncer clairement plutôt que d'échouer sans explication.
  const database = await checkDatabaseAvailability();
  const session = database.available ? await getSession() : null;
  const params = await searchParams;

  if (session) {
    redirect(params.redirectTo && params.redirectTo.startsWith('/') ? params.redirectTo : '/tableau-de-bord');
  }

  // Les paramètres `verified`/`reset` sont affichés par les pages d'origine ;
  // on les accepte ici pour ne jamais perdre le contexte du parcours.
  const notice =
    params.verified === '1'
      ? 'Votre adresse e-mail est confirmée. Connectez-vous pour continuer.'
      : params.reset === '1'
        ? 'Votre mot de passe a été mis à jour. Connectez-vous avec vos nouveaux identifiants.'
        : null;

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
          {notice}
        </div>
      ) : null}

      {database.available ? null : (
        <div
          role="alert"
          className="space-y-1.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="size-4" aria-hidden />
            Service momentanément indisponible
          </p>
          <p className="text-destructive/90">
            La connexion aux comptes est impossible pour le moment : {database.reason}.
          </p>
          <p className="text-xs text-destructive/80">
            {process.env.NODE_ENV === 'production'
              ? 'Vérifiez la variable DATABASE_URL du déploiement, puis l’état détaillé sur /api/health.'
              : 'Localement : npm run setup (ou npm run db:start), puis rechargez cette page. État détaillé : /api/health.'}
          </p>
        </div>
      )}

      <LoginForm redirectTo={params.redirectTo} />
    </div>
  );
}
