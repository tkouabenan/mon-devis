'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { registerAction, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent } from '@/components/ui/display';
import { Checkbox, FormField, Input, Label, PasswordInput } from '@/components/ui/form';
import { validatePasswordPolicy } from '@/lib/auth/password-policy';

/** Contrôle visuel du mot de passe (mêmes règles que le serveur). */
function usePasswordStrength(password: string) {
  return React.useMemo(() => {
    const result = validatePasswordPolicy(password);
    const checks = [
      { label: '8 caractères minimum', ok: password.length >= 8 },
      { label: 'Une majuscule', ok: /[A-Z]/.test(password) },
      { label: 'Une minuscule', ok: /[a-z]/.test(password) },
      { label: 'Un chiffre', ok: /\d/.test(password) },
    ];
    return { valid: result.valid, message: result.message, checks, score: checks.filter((check) => check.ok).length };
  }, [password]);
}

export function RegisterForm({ plan }: { plan?: string }) {
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(registerAction, undefined);
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [clientError, setClientError] = React.useState<string | null>(null);

  const strength = usePasswordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-left">
        <h1 className="font-display text-2xl font-bold tracking-tight">Créez votre compte gratuitement</h1>
        <p className="text-sm text-muted-foreground">
          {plan && plan !== 'free'
            ? 'Votre essai démarre sur le plan Gratuit : vous pourrez changer de formule à tout moment depuis vos paramètres.'
            : 'Aucune carte bancaire requise. Votre premier devis est prêt en quelques minutes.'}
        </p>
      </div>

      {state?.message && !state.success ? (
        <Alert variant="danger" icon={<AlertCircle className="size-4" />}>
          {state.message}
        </Alert>
      ) : null}
      {clientError ? (
        <Alert variant="danger" icon={<AlertCircle className="size-4" />}>
          {clientError}
        </Alert>
      ) : null}

      <Card className="shadow-card">
        <CardContent className="space-y-5 pt-6">
          <form
            action={formAction}
            className="space-y-4"
            noValidate
            onSubmit={(event) => {
              if (mismatch) {
                event.preventDefault();
                setClientError('Les deux mots de passe ne correspondent pas.');
                return;
              }
              setClientError(null);
            }}
          >
            <FormField label="Nom complet" htmlFor="name" required error={state?.errors?.name}>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder="Awa Koné"
                aria-invalid={Boolean(state?.errors?.name)}
                required
              />
            </FormField>

            <FormField label="Adresse e-mail professionnelle" htmlFor="email" required error={state?.errors?.email}>
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

            <FormField
              label="Nom de l’entreprise"
              htmlFor="companyName"
              error={state?.errors?.companyName}
              hint="Facultatif — modifiable plus tard dans « Mon entreprise »."
            >
              <Input id="companyName" name="companyName" autoComplete="organization" placeholder="Bâtir & Conseil SARL" />
            </FormField>

            <FormField label="Mot de passe" htmlFor="password" required error={state?.errors?.password}>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                placeholder="Choisissez un mot de passe solide"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(state?.errors?.password)}
                required
              />
              {password.length > 0 ? (
                <ul className="mt-2 grid grid-cols-2 gap-1.5">
                  {strength.checks.map((check) => (
                    <li
                      key={check.label}
                      className={
                        check.ok
                          ? 'flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400'
                          : 'flex items-center gap-1.5 text-xs text-muted-foreground'
                      }
                    >
                      <CheckCircle2 className={check.ok ? 'size-3.5' : 'size-3.5 opacity-40'} aria-hidden />
                      {check.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden /> 8 caractères minimum, avec majuscule, minuscule et chiffre.
                </p>
              )}
            </FormField>

            <FormField
              label="Confirmer le mot de passe"
              htmlFor="confirmPassword"
              required
              error={mismatch ? 'Les deux mots de passe ne correspondent pas.' : undefined}
            >
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Retapez votre mot de passe"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-invalid={mismatch}
                required
              />
            </FormField>

            <div className="flex items-start gap-2.5">
              <Checkbox
                id="acceptTerms"
                name="acceptTerms"
                className="mt-0.5"
                checked={acceptTerms}
                onCheckedChange={(value) => setAcceptTerms(value === true)}
                aria-invalid={Boolean(state?.errors?.acceptTerms)}
              />
              <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug text-muted-foreground">
                J’accepte les{' '}
                <Link href="/cgu" target="_blank" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                  conditions générales d’utilisation
                </Link>{' '}
                et la{' '}
                <Link
                  href="/confidentialite"
                  target="_blank"
                  className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  politique de confidentialité
                </Link>
                .
              </Label>
            </div>
            {state?.errors?.acceptTerms ? (
              <p className="text-xs font-medium text-destructive">{state.errors.acceptTerms}</p>
            ) : null}

            <Button type="submit" size="lg" variant="gradient" className="w-full" loading={pending} loadingText="Création…">
              Créer mon compte
              <ArrowRight className="size-4" aria-hidden />
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              En créant un compte, vous restez propriétaire de vos données : export et suppression à tout moment.
            </p>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Vous avez déjà un compte ?{' '}
        <Link href="/connexion" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
