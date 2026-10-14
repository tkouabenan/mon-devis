import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, CalendarClock, CreditCard, Receipt, ShieldCheck } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getPlanDefinitions, getUsageOverview } from '@/lib/services/subscription';
import { env } from '@/lib/env';
import { formatCurrency } from '@/lib/currency';
import { PlanComparator, UsageBar, type PlanCardData } from '@/components/subscription/plan-comparator';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Abonnement',
  description: 'Formule en cours, consommation, limites et comparaison des formules MON DEVIS.',
};

const STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Essai gratuit',
  ACTIVE: 'Active',
  PAST_DUE: 'Impayé',
  PENDING_PAYMENT: 'En attente de paiement',
  CANCELLED: 'Résiliée',
  EXPIRED: 'Expirée',
};

export default async function SubscriptionPage() {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const [usage, planDefinitions] = await Promise.all([getUsageOverview(organizationId), getPlanDefinitions()]);

  const plans: PlanCardData[] = planDefinitions
    .filter((plan) => plan.isPublic)
    .map((plan) => ({
      code: plan.code,
      name: plan.name,
      tagline: plan.tagline,
      description: plan.description,
      currency: plan.currency,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly),
      features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
      isCurrent: plan.code === usage.plan.planCode,
      sortOrder: plan.sortOrder,
    }));

  const limits = usage.plan.limits;
  const paymentsEnabled = env.payments.provider !== 'none' && env.payments.canCharge;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Abonnement</h1>
          <p className="text-sm text-muted-foreground">
            Formule, consommation du mois et limites appliquées à <span className="font-medium text-foreground">{context.organization.name}</span>.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/aide">
            <Receipt className="mr-2 h-4 w-4" aria-hidden />
            Facturation &amp; support
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" aria-hidden />
              Ma formule
            </CardTitle>
            <CardDescription>
              Les limites ci-dessous sont réellement appliquées côté serveur : un devis au-delà du quota est refusé, jamais créé
              silencieusement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={usage.plan.isFree ? 'secondary' : 'success'}>{usage.plan.planName}</Badge>
              <Badge variant={usage.plan.status === 'PAST_DUE' ? 'danger' : 'default'}>
                {STATUS_LABELS[usage.plan.status] ?? usage.plan.status}
              </Badge>
              {usage.plan.priceMonthly > 0 ? (
                <span className="text-sm text-muted-foreground">
                  {formatCurrency(usage.plan.priceMonthly, usage.plan.currency, 'fr-FR')} / mois · facturation{' '}
                  {usage.plan.interval === 'YEARLY' ? 'annuelle' : 'mensuelle'}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {usage.plan.isFree ? 'Aucun frais' : 'Tarif communiqué par un conseiller'}
                </span>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <UsageBar label="Devis ce mois" used={usage.quotationsThisMonth} limit={limits.quotationsPerMonth} />
              <UsageBar label="Factures ce mois" used={usage.invoicesThisMonth} limit={limits.invoicesPerMonth} />
              <UsageBar label="Clients enregistrés" used={usage.customers} limit={limits.customers} />
              <UsageBar label="Produits & services actifs" used={usage.products} limit={limits.products} />
              <UsageBar label="Membres de l’équipe" used={usage.members} limit={limits.members} />
              <UsageBar label="Profils d’entreprise" used={usage.companies} limit={limits.companies} />
            </div>

            <DefinitionList
              items={[
                {
                  label: 'Période courante',
                  value: `Du ${usage.plan.currentPeriodStart.toLocaleDateString('fr-FR')} au ${usage.plan.currentPeriodEnd.toLocaleDateString('fr-FR')}`,
                },
                {
                  label: 'Exports inclus',
                  value: [
                    limits.exports.pdf ? 'PDF' : null,
                    limits.exports.docx ? 'Word (.docx)' : null,
                    limits.exports.xlsx ? 'Excel (.xlsx)' : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                },
                {
                  label: 'Fonctionnalités',
                  value: [
                    limits.customBranding ? 'Personnalisation visuelle' : null,
                    limits.shareLinks ? 'Liens de partage client' : null,
                    limits.advancedAnalytics ? 'Statistiques avancées' : null,
                    limits.prioritySupport ? 'Support prioritaire' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Modèles essentiels, calculs automatiques, export PDF avec filigrane',
                },
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                Facturation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {paymentsEnabled ? (
                <p>
                  Le prestataire de paiement est configuré pour cet environnement : les factures d’abonnement sont réglées en ligne,
                  avec vérification serveur des transactions.
                </p>
              ) : (
                <p>
                  Le paiement en ligne n’est pas encore activé sur cet environnement. Les formules payantes sont activées après
                  règlement réel, confirmé par un conseiller : <strong>aucun paiement n’est simulé</strong> et aucune somme n’est
                  débitée depuis MON DEVIS.
                </p>
              )}
              <p>
                Besoin d’une facture d’abonnement au nom de votre société (NCC, RCCM, bon de commande) ? Précisez-le dans votre
                demande : elle sera reprise telle quelle.
              </p>
            </CardContent>
          </Card>

          {usage.plan.status === 'PAST_DUE' ? (
            <Alert variant="danger" title="Règlement en retard" icon={<AlertTriangle className="h-4 w-4" aria-hidden />}>
              Un règlement est en attente. Les fonctionnalités payantes restent actives pendant 7 jours, puis l’espace repasse
              automatiquement sur les limites de la formule gratuite (vos données sont conservées).
            </Alert>
          ) : (
            <Alert variant="success" title="Vos données vous appartiennent" icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
              En cas de retour à la formule gratuite, rien n’est supprimé : seules les limites de création s’appliquent. Vos devis et
              factures déjà émis restent consultables et exportables en PDF.
            </Alert>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Comparer les formules</h2>
        <p className="text-sm text-muted-foreground">
          Les tarifs et contenus des formules sont administrés par l’équipe MON DEVIS et peuvent évoluer ; les limites affichées ici
          sont celles réellement appliquées à votre espace.
        </p>
      </div>

      <PlanComparator
        plans={plans}
        paymentsEnabled={paymentsEnabled}
        currentPlanCode={usage.plan.planCode}
        trialEndsAt={usage.plan.trialEndsAt ? usage.plan.trialEndsAt.toISOString() : null}
      />
    </div>
  );
}
