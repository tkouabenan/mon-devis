import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, BadgeCheck, MailCheck } from 'lucide-react';
import { verifyEmailAction } from '@/app/actions/auth';
import { getSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/display';
import { ResendVerification } from '@/components/auth/resend-verification';

export const metadata: Metadata = {
  title: 'Confirmation de l’adresse e-mail',
  description: 'Confirmez votre adresse e-mail pour sécuriser votre compte MON DEVIS.',
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const session = await getSession();

  // Un jeton est présent : on confirme immédiatement.
  const result = params.token ? await verifyEmailAction(params.token) : null;

  if (result?.success) {
    return (
      <div className="space-y-6 text-center lg:text-left">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 lg:mx-0 dark:text-emerald-400">
          <BadgeCheck className="size-6" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Adresse confirmée, merci !</h1>
          <p className="text-sm text-muted-foreground">
            Votre adresse e-mail est vérifiée. Vous recevrez désormais les notifications liées à vos devis.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href={session ? '/tableau-de-bord' : '/connexion?verified=1'}>
            {session ? 'Accéder à mon tableau de bord' : 'Se connecter'}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-left">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary-600 lg:mx-0 dark:text-primary-400">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {result ? 'Lien invalide ou expiré' : 'Vérifiez votre boîte de réception'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {result
            ? result.message
            : 'Nous vous avons envoyé un lien de confirmation valable 48 heures. Cliquez dessus pour activer les notifications de votre compte.'}
        </p>
      </div>

      {result && !result.success ? (
        <Alert variant="warning" icon={<AlertCircle className="size-4" />}>
          Le lien de confirmation a peut-être déjà été utilisé. Vous pouvez en demander un nouveau ci-dessous.
        </Alert>
      ) : null}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Besoin d’un nouveau lien ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {session ? (
            <ResendVerification />
          ) : (
            <p className="text-sm text-muted-foreground">
              Connectez-vous pour renvoyer l’e-mail de confirmation depuis votre espace.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message : votre adresse reste
            protégée.
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-sm">
        <Link href={session ? '/tableau-de-bord' : '/connexion'} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
          {session ? 'Continuer vers mon espace' : 'Retour à la connexion'}
        </Link>
      </p>
    </div>
  );
}
