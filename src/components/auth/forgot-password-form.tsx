'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { forgotPasswordAction, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent } from '@/components/ui/display';
import { FormField, Input } from '@/components/ui/form';

export function ForgotPasswordForm() {
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(
    forgotPasswordAction,
    undefined,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-left">
        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary-600 lg:mx-0 dark:text-primary-400">
          <Mail className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">
          Indiquez l’adresse e-mail de votre compte : nous vous envoyons un lien de réinitialisation valable 60 minutes.
        </p>
      </div>

      {state ? (
        <Alert variant={state.success ? 'success' : 'danger'} icon={state.success ? <CheckCircle2 className="size-4" /> : undefined}>
          {state.message}
        </Alert>
      ) : null}

      <Card className="shadow-card">
        <CardContent className="pt-6">
          <form action={formAction} className="space-y-4" noValidate>
            <FormField label="Adresse e-mail" htmlFor="email" required error={state?.errors?.email}>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="vous@entreprise.com"
                aria-invalid={Boolean(state?.errors?.email)}
                required
              />
            </FormField>

            <Button type="submit" size="lg" className="w-full" loading={pending} loadingText="Envoi…">
              Envoyer le lien de réinitialisation
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm">
        <Link
          href="/connexion"
          className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
