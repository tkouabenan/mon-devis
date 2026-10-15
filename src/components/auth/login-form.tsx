'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { loginAction, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { Checkbox, FormField, Input, Label, PasswordInput } from '@/components/ui/form';

const DEMO_ACCOUNTS = [
  { label: 'Propriétaire — Bâtir & Conseil (plan Pro, XOF)', email: 'demo@mon-devis.app', password: 'Demo2026!' },
  { label: 'Membre — accès limité', email: 'commercial@mon-devis.app', password: 'Demo2026!' },
  { label: 'Second espace EUR — Studio Créatif Abidjan (formule gratuite)', email: 'studio@mon-devis.app', password: 'Demo2026!' },
];

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(loginAction, undefined);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(false);

  const showDemo = process.env.NODE_ENV !== 'production';

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-left">
        <h1 className="font-display text-2xl font-bold tracking-tight">Content de vous revoir</h1>
        <p className="text-sm text-muted-foreground">
          Connectez-vous pour accéder à vos devis, clients et statistiques.
        </p>
      </div>

      {state?.message ? (
        <Alert
          variant={state.success ? 'success' : 'danger'}
          icon={state.success ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
        >
          {state.message}
        </Alert>
      ) : null}

      <Card className="shadow-card">
        <CardHeader className="sr-only">
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Formulaire de connexion à MON DEVIS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <form action={formAction} className="space-y-5" noValidate>
            {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

            <FormField label="Adresse e-mail" htmlFor="email" required error={state?.errors?.email}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="vous@entreprise.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(state?.errors?.email)}
                required
              />
            </FormField>

            <FormField
              label="Mot de passe"
              htmlFor="password"
              required
              error={state?.errors?.password}
              hint={
                <Link href="/mot-de-passe-oublie" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                  Mot de passe oublié ?
                </Link>
              }
            >
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="Votre mot de passe"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(state?.errors?.password)}
                required
              />
            </FormField>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id="remember"
                name="remember"
                checked={remember}
                onCheckedChange={(value) => setRemember(value === true)}
              />
              <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                Rester connecté 90 jours
              </Label>
            </div>

            <Button type="submit" size="lg" className="w-full" loading={pending} loadingText="Connexion…">
              Se connecter
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          {showDemo ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden /> Comptes de démonstration
              </p>
              <ul className="mt-2 space-y-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                        setRemember(false);
                      }}
                    >
                      <span className="block font-medium text-foreground">{account.label}</span>
                      <span className="block text-muted-foreground">
                        {account.email} · {account.password}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
          Créer mon devis gratuitement
        </Link>
      </p>
    </div>
  );
}
