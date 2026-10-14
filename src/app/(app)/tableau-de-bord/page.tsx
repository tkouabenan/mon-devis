import * as React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Package,
  Percent,
  Receipt,
  Send,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getDashboardData, listOrganizationCurrencies, resolvePeriod, type PeriodPreset } from '@/lib/services/analytics';
import { listQuotations } from '@/lib/services/quotations';
import { getUsageOverview } from '@/lib/services/subscription';
import { formatCurrency } from '@/lib/currency';
import { QUOTATION_STATUSES } from '@/lib/constants';
import { KpiCard } from '@/components/dashboard/kpi-card';
import {
  AcceptanceTrendChart,
  ChartCard,
  MonthlyTrendChart,
  StatusDonutChart,
  TopCustomersChart,
} from '@/components/dashboard/charts';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Progress } from '@/components/ui/display';
import { StatusBadge } from '@/components/status-badge';
import { Table, TableShell } from '@/components/ui/table';
import { PeriodFilter } from '@/components/dashboard/period-filter';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Tableau de bord',
  description: 'Vue d’ensemble de votre activité : devis, montants, taux d’acceptation et tendances.',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; du?: string; au?: string; devise?: string }>;
}) {
  const context = await requireOrganization();
  const params = await searchParams;
  const organizationId = context.organization.id;

  const currencies = await listOrganizationCurrencies(organizationId);
  const currency = currencies.includes(params.devise ?? '') ? (params.devise as string) : currencies[0];

  const period = resolvePeriod((params.periode as PeriodPreset) ?? '90d', params.du ?? null, params.au ?? null);

  const [data, recent, usage] = await Promise.all([
    getDashboardData(organizationId, period, currency),
    listQuotations(organizationId, { page: 1, pageSize: 6, sort: 'recent' }),
    getUsageOverview(organizationId),
  ]);

  const quotationLimit = usage.plan.limits.quotationsPerMonth;
  const usageRatio = quotationLimit === null ? 0 : Math.min(100, Math.round((usage.quotationsThisMonth / quotationLimit) * 100));

  const amountFormatter = (value: number) => formatCurrency(value, currency, 'fr-FR', { compact: value >= 1_000_000 });

  const hasActivity = data.quotationCount.value > 0;
  const topCustomers = data.topCustomers.filter((customer) => customer.amount > 0).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Bonjour {context.user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Voici l’activité de <span className="font-medium text-foreground">{context.organization.name}</span> — {period.label}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            preset={period.preset}
            label={period.label}
            from={period.from.toISOString().slice(0, 10)}
            to={period.to.toISOString().slice(0, 10)}
            currencies={currencies}
            currency={currency}
          />
          <Button asChild>
            <Link href="/devis/nouveau">
              <FilePlus2 className="size-4" aria-hidden />
              Nouveau devis
            </Link>
          </Button>
        </div>
      </div>

      {data.hasOtherCurrencies ? (
        <Alert variant="warning" title="Plusieurs devises détectées">
          Vos statistiques affichées portent uniquement sur <strong>{currency}</strong>. Les autres devises sont
          comptabilisées séparément et ne sont jamais converties :{' '}
          {data.availableCurrencies
            .filter((entry) => entry.currency !== currency)
            .map((entry) => `${entry.count} devis en ${entry.currency}`)
            .join(', ')}
          .
        </Alert>
      ) : null}

      {/* KPI */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs clés">
        <KpiCard
          label="Total des devis"
          value={data.quotationCount.value.toLocaleString('fr-FR')}
          icon={FileText}
          change={data.quotationCount.change}
          changeLabel={`vs ${period.days} j précédents`}
          hint={`${data.extra.draft} brouillon(s) · ${data.extra.sent} envoyé(s)`}
        />
        <KpiCard
          label="Montant total"
          value={amountFormatter(data.totalAmount.value)}
          icon={Receipt}
          change={data.totalAmount.change}
          changeLabel={`vs ${period.days} j précédents`}
          tone="navy"
          hint={`Valeur moyenne : ${amountFormatter(data.extra.averageValue)}`}
        />
        <KpiCard
          label="Devis acceptés"
          value={data.acceptedCount.value.toLocaleString('fr-FR')}
          icon={BadgeCheck}
          change={data.acceptedCount.change}
          changeLabel={`vs ${period.days} j précédents`}
          tone="success"
          hint={`Montant accepté : ${amountFormatter(data.acceptedAmount.value)}`}
        />
        <KpiCard
          label="Taux d’acceptation"
          value={`${data.acceptanceRate.value.toLocaleString('fr-FR')} %`}
          icon={Percent}
          change={data.acceptanceRate.change}
          changeLabel={`vs ${period.days} j précédents`}
          tone="success"
          hint="Calculé sur les devis déjà décidés (acceptés, refusés, expirés)."
        />
      </section>

      {/* Métriques complémentaires */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs complémentaires">
        {[
          { label: 'Brouillons', value: data.extra.draft, icon: FileText, href: '/devis?statut=DRAFT' },
          { label: 'Envoyés', value: data.extra.sent, icon: Send, href: '/devis?statut=SENT' },
          { label: 'En attente', value: data.extra.pending, icon: Clock, href: '/devis?statut=PENDING' },
          { label: 'Expirés', value: data.extra.expired, icon: Clock, href: '/devis?statut=EXPIRED' },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <item.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
              <span className="block font-display text-lg font-bold tabular-nums">{item.value.toLocaleString('fr-FR')}</span>
            </span>
            <ArrowRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </section>

      {/* Graphiques */}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Graphiques">
        <ChartCard
          title="Évolution du chiffre d’affaires"
          description={`Montants émis et acceptés, en ${currency} — ${period.label}.`}
          className="lg:col-span-2"
          empty={!hasActivity}
        >
          <MonthlyTrendChart data={data.monthly} currency={currency} />
        </ChartCard>

        <ChartCard title="Répartition par statut" description={`Nombre de devis en ${currency}.`} empty={!hasActivity}>
          <StatusDonutChart data={data.statusBreakdown} />
        </ChartCard>

        <ChartCard
          title="Taux d’acceptation dans le temps"
          description="Part des devis acceptés parmi ceux émis chaque mois."
          className="lg:col-span-2"
          empty={!hasActivity}
        >
          <AcceptanceTrendChart data={data.monthly} />
        </ChartCard>

        <ChartCard
          title="Meilleurs clients"
          description="Montant total des devis émis sur la période."
          empty={topCustomers.length === 0}
        >
          <TopCustomersChart data={topCustomers.map((customer) => ({ name: customer.name, amount: customer.amount }))} currency={currency} />
        </ChartCard>
      </section>

      {/* Devis récents + actions rapides */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Devis récents</CardTitle>
              <CardDescription>Les six derniers devis créés, toutes périodes confondues.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/devis">
                Tout voir <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {recent.rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-6" aria-hidden />}
                title="Aucun devis pour l’instant"
                description="Créez votre premier devis : vous pouvez enregistrer un brouillon puis l’envoyer à votre client en quelques clics."
                action={
                  <Button asChild>
                    <Link href="/devis/nouveau">
                      <FilePlus2 className="size-4" aria-hidden />
                      Créer mon premier devis
                    </Link>
                  </Button>
                }
              />
            ) : (
              <TableShell>
                <Table>
                  <thead>
                    <tr>
                      <th scope="col">Numéro</th>
                      <th scope="col" className="hidden sm:table-cell">Client</th>
                      <th scope="col">Statut</th>
                      <th scope="col" className="text-right">Montant</th>
                      <th scope="col" className="hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.rows.map((quotation) => {
                      const snapshot = quotation.customerSnapshot as { name?: string; companyName?: string } | null;
                      return (
                        <tr key={quotation.id}>
                          <td>
                            <Link href={`/devis/${quotation.id}`} className="font-medium hover:text-primary-600 hover:underline dark:hover:text-primary-400">
                              {quotation.number}
                            </Link>
                            <span className="block text-xs text-muted-foreground">{quotation.title}</span>
                          </td>
                          <td className="hidden sm:table-cell text-sm text-muted-foreground">
                            {snapshot?.companyName || snapshot?.name || '—'}
                          </td>
                          <td>
                            <StatusBadge status={quotation.status} />
                          </td>
                          <td className="text-right font-medium tabular-nums">
                            {formatCurrency(quotation.total, quotation.currency, 'fr-FR', { showSymbol: true })}
                          </td>
                          <td className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(quotation.issueDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableShell>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Actions rapides</CardTitle>
              <CardDescription>Les gestes du quotidien en un clic.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/devis/nouveau">
                  <FilePlus2 className="size-4" aria-hidden /> Créer un devis
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/clients?nouveau=1">
                  <UserPlus className="size-4" aria-hidden /> Ajouter un client
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/produits?nouveau=1">
                  <Package className="size-4" aria-hidden /> Ajouter un produit
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/statistiques">
                  <TrendingUp className="size-4" aria-hidden /> Voir les statistiques
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Consommation de la formule</CardTitle>
              <CardDescription>Formule {usage.plan.planName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Devis ce mois-ci</span>
                  <span className="font-medium tabular-nums">
                    {usage.quotationsThisMonth}
                    {quotationLimit === null ? ' / illimité' : ` / ${quotationLimit}`}
                  </span>
                </div>
                <Progress value={quotationLimit === null ? 4 : usageRatio} />
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Clients', value: usage.customers, limit: usage.plan.limits.customers },
                  { label: 'Produits', value: usage.products, limit: usage.plan.limits.products },
                  { label: 'Membres', value: usage.members, limit: usage.plan.limits.members },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-muted/60 px-2 py-2.5">
                    <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                    <dd className="font-display text-sm font-bold tabular-nums">
                      {item.value}
                      <span className="text-xs font-normal text-muted-foreground">
                        {item.limit === null ? '/' : ` / ${item.limit}`}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>

              <Button variant="ghost" size="sm" className="w-full" asChild>
                <Link href="/abonnement">
                  Gérer mon abonnement <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Statuts des devis</CardTitle>
              <CardDescription>Répartition sur la période sélectionnée.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {data.statusBreakdown
                .filter((entry) => entry.count > 0)
                .map((entry) => (
                  <div key={entry.status} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="border-transparent bg-muted/70">
                        {QUOTATION_STATUSES[entry.status].label}
                      </Badge>
                    </span>
                    <span className="font-medium tabular-nums">{entry.count}</span>
                  </div>
                ))}
              {data.statusBreakdown.every((entry) => entry.count === 0) ? (
                <p className="text-sm text-muted-foreground">Aucun devis sur cette période.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileSpreadsheet className="size-3.5" aria-hidden />
        Toutes les statistiques peuvent être exportées en PDF ou Excel depuis la page{' '}
        <Link href="/statistiques" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
          Statistiques
        </Link>
        . Les montants ne sont jamais convertis d’une devise à l’autre.
      </p>
    </div>
  );
}
