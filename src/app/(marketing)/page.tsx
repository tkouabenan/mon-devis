import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  ChartNoAxesCombined,
  Clock,
  FileSpreadsheet,
  FileText,
  HardHat,
  Palette,
  Rocket,
  Share2,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  Briefcase,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { ProductPreview } from '@/components/marketing/product-preview';
import { FaqSection, FinalCta, PricingSection, ProductShowcase, type PricingPlan } from '@/components/marketing/sections';
import { DEFAULT_PLANS } from '@/lib/plans';
import { getPlanDefinitions } from '@/lib/services/subscription';

export const metadata: Metadata = {
  title: 'MON DEVIS — Créez des devis professionnels en moins de 3 minutes',
  description:
    'Fini les devis compliqués sur Word ou Excel. Créez, personnalisez, envoyez et suivez vos devis professionnels depuis une seule plateforme. Exports PDF, Word et Excel.',
};

const BENEFITS = [
  {
    icon: Clock,
    title: 'Créez un devis en 3 minutes',
    description: 'Un client, quelques lignes, un modèle : votre devis est prêt. Plus de copier-coller approximatif.',
  },
  {
    icon: FileText,
    title: 'Des documents vraiment professionnels',
    description: 'Huit modèles soignés, votre logo, vos couleurs et une mise en page lisible à l’impression.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Exports PDF, Word et Excel',
    description: 'PDF prêt à envoyer, Word pour ajuster, Excel avec formules : vos données restent identiques.',
  },
  {
    icon: Users,
    title: 'Gestion centralisée des clients',
    description: 'Une fiche par client, son historique, ses montants négociés et acceptés.',
  },
  {
    icon: BadgeCheck,
    title: 'Suivi des devis en temps réel',
    description: 'Brouillon, envoyé, en attente, accepté, refusé, expiré : vous savez toujours où vous en êtes.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Statistiques qui parlent',
    description: 'Taux d’acceptation, panier moyen, meilleurs clients et prestations les plus demandées.',
  },
  {
    icon: Calculator,
    title: 'Calculs automatiques et fiables',
    description: 'Remises, TVA multi-taux, acomptes : les montants sont calculés au centime près, sans erreur d’arrondi.',
  },
  {
    icon: Smartphone,
    title: 'Accessible partout',
    description: 'Ordinateur, tablette ou mobile : votre activité vous suit sur le terrain comme au bureau.',
  },
];

const STEPS = [
  {
    number: '01',
    icon: UserRound,
    title: 'Créez votre compte',
    description:
      'Inscription en moins d’une minute. Renseignez le nom et le logo de votre entreprise : ils apparaîtront automatiquement sur tous vos devis.',
    points: ['Aucune carte bancaire requise', 'Logo et coordonnées mémorisés'],
  },
  {
    number: '02',
    icon: Palette,
    title: 'Personnalisez votre devis',
    description:
      'Choisissez un client, ajoutez vos prestations depuis votre catalogue, appliquez vos remises et sélectionnez le modèle qui vous ressemble.',
    points: ['Aperçu du document en direct', 'Totaux et taxes calculés instantanément'],
  },
  {
    number: '03',
    icon: Share2,
    title: 'Téléchargez et partagez',
    description:
      'Exportez en PDF, Word ou Excel, envoyez le devis par e-mail ou partagez un lien sécurisé : votre client accepte en un clic.',
    points: ['Lien de validation client', 'Statut mis à jour automatiquement'],
  },
];

const AUDIENCES = [
  { icon: UserRound, title: 'Freelances', description: 'Missions, forfaits et TJM présentés clairement.' },
  { icon: HardHat, title: 'Artisans', description: 'Quantités, unités et fournitures détaillées par chantier.' },
  { icon: Briefcase, title: 'Consultants', description: 'Prestations par phases avec conditions de paiement.' },
  { icon: Building2, title: 'Entreprises de construction', description: 'Métrés, remises et acomptes de démarrage.' },
  { icon: Store, title: 'Commerçants & prestataires', description: 'Devis rapides, catalogue de produits réutilisable.' },
  { icon: Users, title: 'Agences', description: 'Plusieurs utilisateurs et projets suivis en équipe.' },
  { icon: Wallet, title: 'PME', description: 'Indicateurs commerciaux et historique complet.' },
  { icon: Rocket, title: 'Entrepreneurs indépendants', description: 'Une image professionnelle dès le premier devis.' },
];

const FAQ_ITEMS = [
  {
    id: 'creation',
    question: 'Comment créer mon premier devis ?',
    answer:
      'Créez votre compte, renseignez les informations de votre entreprise puis cliquez sur « Nouveau devis ». Sélectionnez ou créez un client, ajoutez vos prestations, choisissez un modèle et enregistrez : l’aperçu du document se met à jour en temps réel.',
  },
  {
    id: 'formats',
    question: 'Quels formats d’export sont disponibles ?',
    answer:
      'Chaque devis peut être exporté en PDF (mise en page A4, texte sélectionnable, prêt à imprimer), en Word (.docx, entièrement modifiable) et en Excel (.xlsx, avec formules de calcul et formats de devise). Les fichiers sont générés à partir de vos données enregistrées.',
  },
  {
    id: 'gratuit',
    question: 'Que comprend le compte gratuit ?',
    answer:
      'Le plan Gratuit permet de créer jusqu’à 5 devis par mois, d’enregistrer 10 clients et 20 produits, d’utiliser les modèles de base et d’exporter en PDF avec un filigrane. Vous passez au plan Pro quand vos volumes augmentent.',
  },
  {
    id: 'personnalisation',
    question: 'Puis-je utiliser mon logo et mes couleurs ?',
    answer:
      'Oui. Importez votre logo (PNG, JPG, WEBP ou SVG sécurisé), définissez vos couleurs de marque et votre typographie. Ces réglages s’appliquent à l’aperçu comme aux exports, et sont mémorisés pour tous vos prochains devis.',
  },
  {
    id: 'securite',
    question: 'Mes données sont-elles protégées ?',
    answer:
      'Les données de chaque entreprise sont isolées : aucune organisation ne peut accéder aux devis d’une autre. Les mots de passe sont hachés, les sessions sont stockées côté serveur avec des jetons opaques, les liens de partage client sont révocables et expirants, et les actions sensibles sont journalisées.',
  },
  {
    id: 'abonnement',
    question: 'Comment fonctionnent les abonnements ?',
    answer:
      'Vous démarrez sur le plan Gratuit, puis passez aux plans Pro ou Business quand vous le souhaitez. Le paiement en ligne est activé uniquement lorsqu’un prestataire de paiement est configuré sur l’instance : aucun prélèvement automatique n’est réalisé dans le cas contraire.',
  },
  {
    id: 'clients',
    question: 'Puis-je gérer mes clients dans MON DEVIS ?',
    answer:
      'Oui : MON DEVIS intègre un CRM léger. Vous retrouvez la fiche de chaque client, l’historique de ses devis, la valeur totale négociée, la part acceptée et la date du dernier devis — avec export de la liste au format CSV.',
  },
  {
    id: 'devises',
    question: 'Quelles devises sont prises en charge ?',
    answer:
      'Vingt devises sont disponibles, dont le franc CFA (XOF et XAF), l’euro, le dollar, la livre sterling et le dirham. Vos statistiques restent regroupées par devise : aucun taux de change n’est appliqué automatiquement.',
  },
];

function toPricingPlans(rows: Awaited<ReturnType<typeof getPlanDefinitions>>): PricingPlan[] {
  return rows
    .filter((plan) => plan.isActive && plan.isPublic)
    .map((plan) => {
      const limits = (plan.limits ?? {}) as {
        exports?: { docx?: boolean; xlsx?: boolean };
        shareLinks?: boolean;
        advancedAnalytics?: boolean;
        advancedReporting?: boolean;
        members?: number | null;
        quotationsPerMonth?: number | null;
      };
      return {
        code: plan.code,
        name: plan.name,
        tagline: plan.tagline ?? '',
        description: plan.description ?? '',
        currency: plan.currency,
        priceMonthly: Number(plan.priceMonthly),
        priceYearly: Number(plan.priceYearly ?? 0),
        features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
        isDefault: Boolean(plan.isDefault),
        limits: {
          quotationsPerMonth: limits.quotationsPerMonth ?? null,
          exports: { docx: Boolean(limits.exports?.docx), xlsx: Boolean(limits.exports?.xlsx) },
          shareLinks: Boolean(limits.shareLinks),
          advancedAnalytics: Boolean(limits.advancedAnalytics),
          advancedReporting: Boolean(limits.advancedReporting),
          members: limits.members ?? null,
        },
      };
    });
}

export default async function LandingPage() {
  const planRows = await getPlanDefinitions().catch(() => []);
  const plans = toPricingPlans(
    planRows.length > 0
      ? planRows
      : DEFAULT_PLANS.map((plan, index) => ({
          id: `fallback-${plan.code}`,
          code: plan.code,
          name: plan.name,
          tagline: plan.tagline,
          description: plan.description,
          currency: plan.currency,
          priceMonthly: String(plan.priceMonthly),
          priceYearly: String(plan.priceYearly),
          yearlyDiscountPercent: '0',
          features: plan.features as unknown as string[],
          limits: plan.limits as unknown as Record<string, unknown>,
          isActive: true,
          isPublic: true,
          isDefault: plan.isDefault,
          sortOrder: plan.sortOrder ?? index,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
  );
  const pricingConfigured = plans.some((plan) => plan.code !== 'free' && plan.priceMonthly > 0);

  return (
    <>
      {/* ------------------------------- HERO ------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" aria-hidden />
        <div className="absolute inset-0 -z-10 dashboard-grid mask-fade-bottom opacity-70" aria-hidden />
        <div className="absolute -right-40 top-0 -z-10 size-[520px] rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="absolute -left-32 top-40 -z-10 size-[380px] rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />

        <div className="container-page pb-16 pt-14 sm:pb-24 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1.2fr] lg:gap-10">
            <div className="animate-in-up">
              <Badge className="mb-5 gap-1.5 py-1 pl-1.5 pr-3">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">NOUVEAU</span>
                Export Word et Excel inclus
              </Badge>

              <h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.35rem]">
                Créez des devis professionnels en <span className="gradient-text">moins de 3 minutes.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Fini les devis compliqués sur Word ou Excel. Avec MON DEVIS, créez, personnalisez et téléchargez vos devis
                professionnels en quelques clics.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="gradient" className="group">
                  <Link href="/inscription">
                    Créer mon premier devis
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="#produit">Découvrir la plateforme</Link>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-emerald-500" /> Sans carte bancaire
                </span>
                <span className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-emerald-500" /> 5 devis offerts chaque mois
                </span>
                <span className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-emerald-500" /> Données isolées par entreprise
                </span>
              </div>
            </div>

            <div className="animate-in-up lg:pl-4" style={{ animationDelay: '120ms' }}>
              <ProductPreview />
            </div>
          </div>

          {/* Bandeau de confiance */}
          <div className="mt-20 grid grid-cols-2 gap-6 border-t border-border pt-8 sm:grid-cols-4">
            {[
              { value: '3 min', label: 'pour créer un devis complet' },
              { value: '8', label: 'modèles professionnels' },
              { value: '3', label: 'formats d’export (PDF, Word, Excel)' },
              { value: '20', label: 'devises prises en charge' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-2xl font-bold text-foreground sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------- AVANTAGES ----------------------------- */}
      <section id="fonctionnalites" className="border-y border-border bg-card py-20 sm:py-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="default" className="mb-4">
              <Sparkles className="size-3.5" /> Pourquoi MON DEVIS
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Tout ce qu’il faut pour vendre plus vite
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Un devis clair, envoyé rapidement, suivi jusqu’à la signature : c’est le meilleur moyen de conclure une vente.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="group rounded-2xl border border-border bg-background p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-card"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-emerald-500/12 text-primary transition-transform duration-300 group-hover:scale-105">
                  <benefit.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- COMMENT ÇA MARCHE ---------------------- */}
      <section id="comment-ca-marche" className="py-20 sm:py-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="default" className="mb-4">
              En 3 étapes
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">De l’inscription au devis envoyé</h2>
            <p className="mt-4 text-base text-muted-foreground">
              Aucune formation nécessaire : la plateforme vous guide du premier clic jusqu’à l’acceptation du client.
            </p>
          </div>

          <div className="relative mt-14">
            <div className="absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block" aria-hidden />
            <div className="grid gap-8 lg:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.number} className="relative">
                  <div className="flex items-center gap-4">
                    <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-lg shadow-primary/25">
                      <step.icon className="size-5" />
                      <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-[10px] font-bold text-white">
                        {index + 1}
                      </span>
                    </span>
                    <span className="font-display text-3xl font-bold text-muted-foreground/25">{step.number}</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                  <ul className="mt-4 space-y-2">
                    {step.points.map((point) => (
                      <li key={point} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <BadgeCheck className="size-4 shrink-0 text-emerald-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ProductShowcase />

      {/* ------------------------------ POUR QUI ---------------------------- */}
      <section className="py-20 sm:py-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="default" className="mb-4">
              Pensé pour votre métier
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">MON DEVIS s’adapte à votre activité</h2>
            <p className="mt-4 text-base text-muted-foreground">
              Du freelance seul à la PME structurée, les mêmes outils — avec les bons réglages par défaut.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((audience) => (
              <div key={audience.title} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
                <audience.icon className="size-5 text-primary" />
                <h3 className="mt-3.5 font-display text-sm font-semibold">{audience.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PricingSection plans={plans} pricingConfigured={pricingConfigured} />

      <FaqSection items={FAQ_ITEMS} />

      <FinalCta />
    </>
  );
}
