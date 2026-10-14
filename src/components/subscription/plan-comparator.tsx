'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, CreditCard, Crown, Loader2, Send, Sparkles } from 'lucide-react';
import { requestPlanChangeAction } from '@/app/actions/subscription';
import type { ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '@/components/ui/display';
import { FormField, Textarea } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlay';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

export interface PlanCardData {
  code: string;
  name: string;
  tagline: string | null;
  description: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  isCurrent: boolean;
  sortOrder: number;
}

/**
 * Comparateur de formules.
 *
 * Les tarifs affichés proviennent de la base (modifiables par l'administration).
 * Aucun paiement en ligne n'est simulé : quand un prestataire n'est pas configuré,
 * le bouton crée une demande de changement de formule tracée, et le dit clairement.
 */
export function PlanComparator({
  plans,
  paymentsEnabled,
  currentPlanCode,
  trialEndsAt,
}: {
  plans: PlanCardData[];
  paymentsEnabled: boolean;
  currentPlanCode: string;
  trialEndsAt: string | null;
}) {
  const router = useRouter();
  const [interval, setInterval] = React.useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [target, setTarget] = React.useState<PlanCardData | null>(null);
  const [state, formAction, pending] = React.useActionState<ActionResult<{ ticketId: string }> | undefined, FormData>(
    requestPlanChangeAction,
    undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(state.message ?? 'Demande envoyée.');
      setTarget(null);
      router.refresh();
    } else {
      toast.error(state.message ?? 'Demande impossible.');
    }
  }, [state, router]);

  return (
    <div className="space-y-6">
      {!paymentsEnabled ? (
        <Alert variant="warning" title="Paiement en ligne non activé">
          Aucun prestataire de paiement n’est configuré pour cet environnement. Le bouton « Choisir cette formule » enregistre une
          <strong> demande de changement</strong>, transmise à l’administration : la formule est activée après règlement réel. Aucun
          paiement n’est simulé et aucune somme n’est débitée depuis cette page.
        </Alert>
      ) : null}

      {trialEndsAt ? (
        <Alert variant="info" title="Période d’essai en cours">
          Votre essai se termine le {new Date(trialEndsAt).toLocaleDateString('fr-FR')}. Choisissez une formule pour conserver les
          fonctionnalités payantes.
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Facturation :</span>
        <div className="inline-flex rounded-lg border p-0.5">
          {(['MONTHLY', 'YEARLY'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                interval === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'MONTHLY' ? 'Mensuel' : 'Annuel'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = interval === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
          const isCurrent = plan.isCurrent || plan.code === currentPlanCode;
          const highlight = plan.code === 'pro';

          return (
            <Card key={plan.code} className={cn('relative flex flex-col', highlight && 'border-primary/50 shadow-md')}>
              {highlight ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                  Le plus choisi
                </span>
              ) : null}
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {plan.code === 'free' ? <Sparkles className="h-4 w-4 text-primary" aria-hidden /> : <Crown className="h-4 w-4 text-amber-500" aria-hidden />}
                    {plan.name}
                  </CardTitle>
                  {isCurrent ? <Badge variant="success">Formule actuelle</Badge> : null}
                </div>
                <CardDescription>{plan.tagline ?? plan.description}</CardDescription>
                <div className="pt-2">
                  {price > 0 ? (
                    <p className="font-display text-3xl font-bold">
                      {formatCurrency(price, plan.currency, 'fr-FR')}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">/{interval === 'YEARLY' ? 'an' : 'mois'}</span>
                    </p>
                  ) : (
                    <p className="font-display text-3xl font-bold">
                      Gratuit
                      <span className="ml-1 block text-xs font-normal text-muted-foreground">
                        {plan.code === 'free' ? 'Pour toujours' : 'Tarif communiqué par un conseiller'}
                      </span>
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-5">
                <ul className="space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" disabled>
                    Formule active
                  </Button>
                ) : (
                  <Button variant={highlight ? 'default' : 'outline'} onClick={() => setTarget(plan)}>
                    <CreditCard className="mr-2 h-4 w-4" aria-hidden />
                    {paymentsEnabled ? 'Choisir cette formule' : 'Demander cette formule'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? undefined : setTarget(null))}>
        <DialogContent>
          {target ? (
            <>
              <DialogHeader>
                <DialogTitle>Passer à la formule {target.name}</DialogTitle>
                <DialogDescription>
                  {paymentsEnabled
                    ? 'Vous serez redirigé vers le prestataire de paiement sécurisé.'
                    : 'Aucun paiement en ligne n’est disponible : votre demande est transmise à l’administration, qui active la formule après règlement réel.'}
                </DialogDescription>
              </DialogHeader>
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="planCode" value={target.code} />
                <input type="hidden" name="interval" value={interval} />
                <FormField label="Précisions (facultatif)" htmlFor="note" hint="Nombre de devis mensuels, besoin d’équipe, mode de règlement souhaité…">
                  <Textarea id="note" name="note" rows={3} placeholder="Nous souhaitons un règlement par virement bancaire." />
                </FormField>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setTarget(null)}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
                    Envoyer la demande
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const ratio = limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used}
          {limit === null ? ' · illimité' : ` / ${limit}`}
        </span>
      </div>
      {limit === null ? (
        <div className="h-2 rounded-full bg-emerald-500/20" />
      ) : (
        <Progress value={ratio} tone={ratio >= 100 ? 'warning' : 'primary'} />
      )}
    </div>
  );
}
