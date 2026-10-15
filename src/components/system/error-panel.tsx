'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/display';

/**
 * Écran d'erreur commun à l'application.
 *
 * Lorsqu'une page échoue (base injoignable, migrations absentes…), l'utilisateur
 * doit comprendre quoi faire : réessayer, consulter l'état du déploiement ou
 * revenir à l'accueil. Sans cela, Next.js affichait une page d'erreur opaque.
 */
export function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error('[app] erreur de rendu :', error);
  }, [error]);

  const message = error.message || 'Une erreur inattendue est survenue.';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg shadow-card">
        <CardHeader>
          <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <CardTitle className="mt-3">Cette page n’a pas pu s’afficher</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>

          {message.includes('/api/health') ? null : (
            <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              Si le problème persiste, consultez l’état du service sur{' '}
              <Link href="/api/health" className="font-medium text-primary-600 hover:underline">
                /api/health
              </Link>{' '}
              : il indique précisément ce qui manque (base de données, migrations, secret de session).
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reset}>
              <RefreshCw className="size-4" aria-hidden />
              Réessayer
            </Button>
            <Button variant="outline" asChild>
              <a href="/api/health" target="_blank" rel="noreferrer">
                <Activity className="size-4" aria-hidden />
                État du service
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/">Retour à l’accueil</Link>
            </Button>
          </div>

          {error.digest ? <p className="text-xs text-muted-foreground">Référence technique : {error.digest}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
