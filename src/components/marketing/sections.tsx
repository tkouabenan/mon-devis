'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  LayoutDashboard,
  Palette,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { formatCurrency } from '@/lib/currency';

/* -------------------------------------------------------------------------- */
/* Vitrine produit interactive                                                */
/* -------------------------------------------------------------------------- */

const SHOWCASE_TABS = [
  { value: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { value: 'editor', label: 'Éditeur de devis', icon: FileText },
  { value: 'customers', label: 'Clients', icon: Users },
  { value: 'design', label: 'Personnalisation', icon: Palette },
  { value: 'analytics', label: 'Statistiques', icon: BarChart3 },
  { value: 'exports', label: 'Exports', icon: Download },
];

const SHOWCASE_CONTENT: Record<string, { title: string; description: string; points: string[] }> = {
  dashboard: {
    title: 'Votre activité commerciale en un coup d’œil',
    description:
      'Chiffre d’affaires potentiel, devis acceptés, taux de conversion, relances à effectuer : tout est calculé depuis vos données réelles.',
    points: ['Indicateurs du mois et comparaison avec la période précédente', 'Devis à relancer et échéances proches', 'Actions rapides accessibles en un clic'],
  },
  editor: {
    title: 'Un éditeur pensé pour aller vite',
    description:
      'Saisissez vos lignes, choisissez un client et un modèle : l’aperçu du document se met à jour instantanément, totaux et taxes compris.',
    points: ['Aperçu du document en temps réel', 'Ajout de produits depuis votre catalogue', 'Remises par ligne et remise globale, TVA multi-taux'],
  },
  customers: {
    title: 'Une fiche client qui raconte votre relation',
    description:
      'Historique des devis, montant total négocié, part acceptée, dernière interaction : vous savez à qui vous parlez.',
    points: ['Historique complet par client', 'Valeur acceptée et taux de réussite', 'Export de votre base client au format CSV'],
  },
  design: {
    title: 'Des documents à votre image',
    description: 'Huit modèles professionnels, votre logo, vos couleurs et votre typographie — appliqués à l’aperçu et à tous les exports.',
    points: ['Position du logo et couleurs de marque', 'Blocs de conditions réutilisables', 'Lisibilité d’impression garantie (A4)'],
  },
  analytics: {
    title: 'Décidez avec de vrais chiffres',
    description:
      'Activité par mois, répartition par statut, meilleurs clients et prestations les plus demandées. Les montants sont regroupés par devise.',
    points: ['Filtres par période, client, statut et devise', 'Top clients et top prestations', 'Rapports exportables en PDF et Excel'],
  },
  exports: {
    title: 'Trois formats, zéro ressaisie',
    description: 'PDF prêt à envoyer, Word pour ajuster, Excel pour les calculs : les documents reprennent exactement vos données.',
    points: ['PDF A4 multi-pages avec numérotation', 'Word (.docx) entièrement modifiable', 'Excel (.xlsx) avec formules vivantes'],
  },
};

export function ProductShowcase() {
  const [tab, setTab] = React.useState('dashboard');
  const content = SHOWCASE_CONTENT[tab] ?? SHOWCASE_CONTENT.dashboard!;

  return (
    <section id="produit" className="border-y border-border bg-card py-20 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="default" className="mb-4">
            <Sparkles className="size-3.5" /> Visite guidée
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Découvrez la plateforme de l’intérieur</h2>
          <p className="mt-4 text-base text-muted-foreground">
            Chaque écran est pensé pour être compris immédiatement, même sans culture comptable.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-10">
          <div className="flex justify-center">
            <TabsList className="max-w-full">
              {SHOWCASE_TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="text-[13px]">
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value={tab}>
            <div className="grid gap-8 rounded-2xl border border-border bg-background p-6 lg:grid-cols-[1fr_1.15fr] lg:p-8">
              <div className="flex flex-col justify-center">
                <h3 className="font-display text-xl font-semibold">{content.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{content.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {content.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 p-0.5 text-emerald-600">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  <Button asChild variant="gradient">
                    <Link href="/inscription">
                      Essayer gratuitement <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="min-w-0">
                <ShowcaseVisual tab={tab} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function ShowcaseVisual({ tab }: { tab: string }) {
  if (tab === 'exports') {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: FileText, label: 'PDF', detail: 'A4, prêt à imprimer', color: 'text-rose-600 bg-rose-500/10' },
          { icon: FileType2, label: 'Word', detail: 'Document modifiable', color: 'text-blue-600 bg-blue-500/10' },
          { icon: FileSpreadsheet, label: 'Excel', detail: 'Formules incluses', color: 'text-emerald-600 bg-emerald-500/10' },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4">
            <span className={cn('flex size-10 items-center justify-center rounded-lg', item.color)}>
              <item.icon className="size-5" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-card p-4 sm:col-span-3">
          <p className="text-xs font-medium text-muted-foreground">Nom de fichier généré</p>
          <p className="mt-1 font-mono text-[13px] text-foreground">MON-DEVIS_DEV-2026-0042_RESIDENCE-LES-PALMIERS.pdf</p>
        </div>
      </div>
    );
  }

  if (tab === 'customers') {
    return (
      <div className="space-y-3">
        {[
          { name: 'Résidence Les Palmiers', value: 18_420_000, accepted: 62, count: 7 },
          { name: 'Groupe SIFCA Distribution', value: 12_180_500, accepted: 45, count: 5 },
          { name: 'Clinique Saint-Jean', value: 6_890_000, accepted: 71, count: 4 },
        ].map((customer) => (
          <div key={customer.name} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-medium">{customer.name}</p>
              <span className="shrink-0 text-sm font-semibold">{formatCurrency(customer.value, 'XOF', 'fr-FR', { compact: true })}</span>
            </div>
            <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{customer.count} devis</span>
              <span className="h-3 w-px bg-border" />
              <span>{customer.accepted} % acceptés</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${customer.accepted}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'analytics') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Montant accepté par mois (FCFA)</p>
          <div className="mt-4 flex h-32 items-end gap-2">
            {[42, 58, 36, 74, 66, 92, 81, 100].map((height, index) => (
              <div key={index} className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Taux d’acceptation</p>
            <p className="font-display text-2xl font-bold">38,4 %</p>
            <p className="mt-1 text-xs text-emerald-600">+4,1 pts vs période précédente</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Panier moyen</p>
            <p className="font-display text-2xl font-bold">676 480 FCFA</p>
            <p className="mt-1 text-xs text-muted-foreground">sur 42 devis émis</p>
          </div>
        </div>
      </div>
    );
  }

  if (tab === 'design') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { name: 'Minimaliste', color: '#2563EB' },
          { name: 'Corporate', color: '#1D4ED8' },
          { name: 'Moderne', color: '#2563EB' },
          { name: 'Élégant', color: '#7C3AED' },
          { name: 'Construction & BTP', color: '#B45309' },
          { name: 'Commercial', color: '#E11D48' },
        ].map((template) => (
          <div key={template.name} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="h-1.5" style={{ backgroundColor: template.color }} />
            <div className="space-y-1.5 p-3">
              <p className="text-xs font-semibold">{template.name}</p>
              <div className="space-y-1">
                <div className="h-1.5 w-3/4 rounded-full bg-muted" />
                <div className="h-1.5 w-1/2 rounded-full bg-muted" />
                <div className="h-1.5 w-2/3 rounded-full bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'editor') {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Ligne de devis</p>
          <div className="mt-3 space-y-2.5 text-xs">
            <div className="rounded-lg border border-border px-2.5 py-2">
              <p className="font-medium">Carrelage grès cérame 60×60</p>
              <p className="text-muted-foreground">Qté 38,5 m² × 18 900 FCFA</p>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-2">
              <span className="text-muted-foreground">Remise ligne</span>
              <span className="font-medium">5 %</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-2">
              <span className="text-muted-foreground">TVA</span>
              <span className="font-medium">18 %</span>
            </div>
            <Button size="sm" variant="outline" className="w-full" type="button">
              <Plus className="size-4" /> Ajouter une ligne
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 text-slate-800 shadow-sm dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-sm font-bold">DEVIS</p>
              <p className="text-[10px] text-slate-500">DEV-2026-0042 · Aperçu instantané</p>
            </div>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary-700">Aperçu</span>
          </div>
          <div className="mt-3 space-y-1.5 text-[10px]">
            {[
              ['Carrelage grès cérame', '727 650'],
              ['Peinture intérieure', '513 000'],
              ['Électricité', '425 000'],
            ].map(([label, amount]) => (
              <div key={label} className="flex justify-between border-b border-dashed border-slate-200 pb-1 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-300">{label}</span>
                <span className="font-medium">{amount}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-[10px]">
            <div className="flex justify-between text-slate-500"><span>Total HT</span><span>1 665 650 FCFA</span></div>
            <div className="flex justify-between text-slate-500"><span>TVA 18 %</span><span>299 817 FCFA</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-xs font-bold dark:border-slate-700">
              <span>Total TTC</span><span>1 965 467 FCFA</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">Devis à relancer</p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">3 échéances</span>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { number: 'DEV-2026-0038', client: 'Hôtel Ivoire Confort', days: 2 },
            { number: 'DEV-2026-0035', client: 'École Les Genêts', days: 4 },
            { number: 'DEV-2026-0031', client: 'Boulangerie Le Fournil', days: 6 },
          ].map((item) => (
            <div key={item.number} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <div>
                <p className="font-medium">{item.number}</p>
                <p className="text-muted-foreground">{item.client}</p>
              </div>
              <span className="text-amber-600">expire dans {item.days} j</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Montant accepté</p>
          <p className="font-display text-lg font-bold">9,6 M FCFA</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Devis en brouillon</p>
          <p className="font-display text-lg font-bold">2</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tarifs                                                                     */
/* -------------------------------------------------------------------------- */

export interface PricingPlan {
  code: string;
  name: string;
  tagline: string;
  description: string;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  isDefault: boolean;
  limits: {
    quotationsPerMonth: number | null;
    exports: { docx: boolean; xlsx: boolean };
    shareLinks: boolean;
    advancedAnalytics: boolean;
    advancedReporting: boolean;
    members: number | null;
  };
}

export function PricingSection({ plans, pricingConfigured = false }: { plans: PricingPlan[]; pricingConfigured?: boolean }) {
  const [interval, setInterval] = React.useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  return (
    <section id="tarifs" className="border-b border-border bg-gradient-to-b from-background to-muted/40 py-20 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="default" className="mb-4">
            Tarifs simples et transparents
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Un plan pour chaque étape de votre activité</h2>
          <p className="mt-4 text-base text-muted-foreground">
            Commencez gratuitement, évoluez quand votre activité grandit. Sans engagement, résiliable à tout moment.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setInterval('MONTHLY')}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                interval === 'MONTHLY' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setInterval('YEARLY')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                interval === 'YEARLY' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Annuel
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                -2 mois
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isPro = plan.code === 'pro';
            const price = interval === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly;
            const notConfigured = price === 0 && plan.code !== 'free';

            return (
              <div
                key={plan.code}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft transition-all duration-300 hover:shadow-card',
                  isPro ? 'border-primary/50 shadow-card ring-1 ring-primary/20 lg:-mt-4 lg:mb-4' : 'border-border',
                )}
              >
                {isPro ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary-600 to-primary-700 px-3 py-1 text-[11px] font-semibold text-white shadow-md">
                    Le plus choisi
                  </span>
                ) : null}

                <div>
                  <h3 className="font-display text-lg font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                </div>

                <div className="mt-5 flex items-end gap-1.5">
                  {notConfigured ? (
                    <span className="font-display text-2xl font-bold">Tarif à définir</span>
                  ) : price === 0 ? (
                    <span className="font-display text-3xl font-bold">Gratuit</span>
                  ) : (
                    <>
                      <span className="font-display text-3xl font-bold">{formatCurrency(price, plan.currency, 'fr-FR', { showSymbol: true }) as string}</span>
                      <span className="pb-1 text-sm text-muted-foreground">/{interval === 'MONTHLY' ? 'mois' : 'an'}</span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 p-0.5 text-primary-700 dark:text-primary-300">
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7">
                  <Button asChild variant={isPro ? 'gradient' : 'outline'} className="w-full">
                    <Link href={plan.code === 'free' ? '/inscription' : `/inscription?plan=${plan.code}`}>
                      {plan.code === 'free' ? 'Commencer gratuitement' : `Choisir ${plan.name}`}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {pricingConfigured
            ? 'Prix hors taxes. Le paiement en ligne sera activé dès qu’un prestataire de paiement est configuré.'
            : 'Les tarifs des plans payants sont configurables depuis l’administration de la plateforme. Aucun paiement réel n’est déclenché actuellement.'}
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */

export function FaqSection({
  items,
}: {
  items: { id: string; question: string; answer: string }[];
}) {
  const [open, setOpen] = React.useState<string | null>(items[0]?.id ?? null);

  return (
    <section id="faq" className="border-b border-border py-20 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="default" className="mb-4">
            Questions fréquentes
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Tout ce qu’il faut savoir avant de commencer</h2>
        </div>

        <div className="mx-auto mt-10 max-w-3xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((item) => {
            const expanded = open === item.id;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : item.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
                  aria-expanded={expanded}
                >
                  <span className="font-medium">{item.question}</span>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} />
                </button>
                <div className={cn('grid transition-all duration-200', expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Bandeau d’appel à l’action                                                 */
/* -------------------------------------------------------------------------- */

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-navy-900 py-20 text-white sm:py-24">
      <div className="absolute inset-0 bg-brand-gradient opacity-90" aria-hidden />
      <div className="absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />

      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <Building2 className="mx-auto mb-5 size-10 text-white/80" />
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Prêt à créer votre prochain devis professionnel ?
          </h2>
          <p className="mt-4 text-base text-white/80">
            Rejoignez MON DEVIS et simplifiez dès aujourd'hui votre gestion commerciale.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full bg-white text-navy-900 hover:bg-white/90 sm:w-auto">
              <Link href="/inscription">Commencer gratuitement</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full border-white/30 bg-transparent text-white hover:bg-white/10 sm:w-auto">
              <Link href="/connexion">Voir une démonstration</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-white/70">Aucune carte bancaire requise · Configuration en 2 minutes</p>
        </div>
      </div>
    </section>
  );
}
