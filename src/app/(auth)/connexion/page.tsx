import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
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
  const session = await getSession();
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
      <LoginForm redirectTo={params.redirectTo} />
    </div>
  );
}
