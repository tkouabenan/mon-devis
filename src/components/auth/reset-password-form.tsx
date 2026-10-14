'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { resetPasswordAction, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent } from '@/components/ui/display';
import { FormField, PasswordInput } from '@/components/ui/form';
import { validatePasswordPolicy } from '@/lib/auth/password-policy';

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(
    resetPasswordAction,
    undefined,
  );
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const mismatch = confirm.length > 0 && confirm !== password;
  const policy = validatePasswordPolicy(password);

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center lg:text-left">
          <h1 className="font-display text-2xl font-bold tracking-tight">Lien incomplet</h1>
          <p className="text-sm text-muted-foreground">
            Ce lien de réinitialisation est incomplet ou a déjà été utilisé. Demandez un nouveau lien pour continuer.
          </p>
        </div>
        <Alert variant="warning" icon={<AlertCircle className="size-4" />}>
          Les liens de réinitialisation sont valables 60 minutes et ne peuvent servir qu’une seule fois.
        </Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
        </Button>
      </div>
    );
  }

  if (state?.success) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center lg:text-left">
          <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 lg:mx-0 dark:text-emerald-400">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight">Mot de passe mis à jour</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/connexion">Se connecter</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-left">
        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary-600 lg:mx-0 dark:text-primary-400">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez un nouveau mot de passe. Pour votre sécurité, toutes vos sessions actives seront déconnectées.
        </p>
      </div>

      {state?.message && !state.success ? (
        <Alert variant="danger" icon={<AlertCircle className="size-4" />}>
          {state.message}
        </Alert>
      ) : null}

      <Card className="shadow-card">
        <CardContent className="pt-6">
          <form action={formAction} className="space-y-4" noValidate>
            <input type="hidden" name="token" value={token} />

            <FormField label="Nouveau mot de passe" htmlFor="password" required error={state?.errors?.password}>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                placeholder="Votre nouveau mot de passe"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(state?.errors?.password)}
                required
              />
              {password.length > 0 && !policy.valid && policy.message ? (
                <p className="text-xs text-muted-foreground">{policy.message}</p>
              ) : null}
            </FormField>

            <FormField
              label="Confirmer le mot de passe"
              htmlFor="confirmPassword"
              required
              error={mismatch ? 'Les deux mots de passe ne correspondent pas.' : state?.errors?.confirmPassword}
            >
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Retapez le mot de passe"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-invalid={mismatch}
                required
              />
            </FormField>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={pending}
              loadingText="Mise à jour…"
              disabled={mismatch}
            >
              Mettre à jour mon mot de passe
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
