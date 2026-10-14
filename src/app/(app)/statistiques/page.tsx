import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BarChart3, Clock, Download, Percent, Receipt, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import {
  getStatisticsOverview,
  listOrganizationCurrencies,
  resolvePeriod,
  type PeriodPreset,
} from '@/lib/services/analytics';
import { formatCurrency, formatNumber } from '@/lib/currency';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { AcceptanceTrendChart, ChartCard, MonthlyTrendChart, StatusDonutChart, TopCustomersChart } from '@/components/dashboard/charts';
import { PeriodFilter } from '@/components/dashboard/period-filter';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Progress } from '@/components/ui/display';
import { Table, TableShell } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = {
  title: 'Statistiques',
  description: 'Analyse de votre activité : taux d’acceptation, valeur moyenne, meilleurs clients et tendances.',
};

/**
 * Page Statistiques.
 *
 * Toutes les mesures proviennent de la base et de la période sélectionnée.
 * Aucune donnée d'exemple n'est affichée : en l'absence d'activité, un état vide
 * explicite est présenté à la place des graphiques.
 */
export default async function StatisticsPage({
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

  const overview = await getStatisticsOverview(organizationId, period, currency);
  const { totals, invoices } = overview;

  const money = (value: number) => formatCurrency(value, currency, 'fr-FR', { compact: value >= 1_000_000 });
  const hasActivity = totals.quotationCount > 0;
  const exportQuery = new URLSearchParams({
    periode: period.preset,
    devise: currency,
    du: period.from.toISOString().slice(0, 10),
    au: period.to.toISOString().slice(0, 10),
  }).toString();

  const conversionTrend = overview.monthly.map((month) => ({ label: month.label, count: month.count, accepted: month.accepted }));
  const topCustomerChart = overview.topCustomers
    .filter((customer) => customer.amount > 0)
    .slice(0, 6)
    .map((customer) => ({ name: customer.name, amount: customer.amount }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Statistiques</h1>
          <p className="text-sm text-muted-foreground">
            Analyse de <span className="font-medium text-foreground">{context.organization.name}</span> — {period.label}, en {currency}.
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
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/statistiques/export?format=xlsx&${exportQuery}`}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Excel
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/statistiques/export?format=pdf&${exportQuery}`}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              PDF
            </Link>
          </Button>
        </div>
      </div>

      {currencies.length > 1 ? (
        <Alert variant="info" title="Plusieurs devises détectées">
          Les totaux ne sont jamais additionnés d’une devise à l’autre. Vous consultez actuellement les chiffres en{' '}
          <span className="font-medium">{currency}</span> ; changez de devise dans le tableau de bord pour voir les autres.
        </Alert>
      ) : null}

      {!hasActivity ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<BarChart3 className="h-6 w-6" aria-hidden />}
              title="Aucune donnée sur cette période"
              description={`Aucun devis en ${currency} n’a été émis du ${period.from.toLocaleDateString('fr-FR')} au ${period.to.toLocaleDateString('fr-FR')}. Créez un devis ou élargissez la période pour voir apparaître vos statistiques.`}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild>
                    <Link href="/devis/nouveau">Créer un devis</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/statistiques?periode=12m">Voir sur 12 mois</Link>
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Devis émis"
              value={formatNumber(totals.quotationCount, 'fr-FR', 0)}
              icon={BarChart3}
              hint={`${formatNumber(totals.decidedCount, 'fr-FR', 0)} devis tranchés par le client`}
              tone="primary"
            />
            <KpiCard
              label="Montant total"
              value={money(totals.quotationAmount)}
              icon={Receipt}
              hint={`Valeur moyenne : ${money(totals.averageValue)}`}
              tone="primary"
            />
            <KpiCard
              label="Taux d’acceptation"
              value={`${formatNumber(totals.acceptanceRate, 'fr-FR', 1)} %`}
              icon={Percent}
              hint={`${formatNumber(totals.acceptedCount, 'fr-FR', 0)} devis acceptés`}
              tone="success"
            />
            <KpiCard
              label="Taux de refus"
              value={`${formatNumber(totals.rejectionRate, 'fr-FR', 1)} %`}
              icon={totals.rejectionRate > 30 ? TrendingDown : TrendingUp}
              hint={`${formatNumber(totals.rejectedCount, 'fr-FR', 0)} devis refusés`}
              tone={totals.rejectionRate > 30 ? 'warning' : 'primary'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Montant accepté"
              value={money(totals.acceptedAmount)}
              icon={Target}
              hint={`Valeur moyenne acceptée : ${money(totals.averageAcceptedValue)}`}
              tone="success"
            />
            <KpiCard
              label="Délai moyen de réponse"
              value={totals.averageResponseDays === null ? '—' : `${formatNumber(totals.averageResponseDays, 'fr-FR', 1)} j`}
              icon={Clock}
              hint={
                totals.averageResponseDays === null
                  ? 'Aucune décision client enregistrée sur la période'
                  : 'Du devis envoyé à la décision du client'
              }
              tone="primary"
            />
            <KpiCard
              label="Montant facturé"
              value={money(invoices.amount)}
              icon={Receipt}
              hint={`${formatNumber(invoices.count, 'fr-FR', 0)} facture(s) sur la période`}
              tone="primary"
            />
            <KpiCard
              label="Reste à encaisser"
              value={money(invoices.outstandingAmount)}
              icon={Receipt}
              hint={
                invoices.overdueCount > 0
                  ? `${formatNumber(invoices.overdueCount, 'fr-FR', 0)} facture(s) en retard`
                  : 'Aucune facture en retard'
              }
              tone={invoices.overdueCount > 0 ? 'warning' : 'success'}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Activité mensuelle"
              description="Nombre de devis émis et montant correspondant, mois par mois."
            >
              <MonthlyTrendChart data={overview.monthly} currency={currency} />
            </ChartCard>

            <ChartCard title="Devis acceptés vs total" description="Volume émis et volume accepté sur la période.">
              <AcceptanceTrendChart data={conversionTrend} />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Répartition par statut" description="Où en sont vos devis sur la période.">
              <StatusDonutChart data={overview.statusBreakdown} />
            </ChartCard>

            <ChartCard
              title="Meilleurs clients"
              description="Clients classés par montant de devis émis (devise sélectionnée)."
              className="xl:col-span-2"
            >
              {topCustomerChart.length > 0 ? (
                <TopCustomersChart data={topCustomerChart} currency={currency} />
              ) : (
                <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden />} title="Aucun client sur la période" description="Les devis émis sur cette période ne sont rattachés à aucun client." />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Taux de conversion mensuel</CardTitle>
                <CardDescription>
                  Part des devis acceptés parmi les devis tranchés (acceptés + refusés) chaque mois. Les devis encore ouverts ne
                  pénalisent pas le taux.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {overview.monthly
                  .filter((month) => month.count > 0)
                  .map((month) => (
                    <div key={month.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{month.label}</span>
                        <span className="text-muted-foreground">
                          {formatNumber(month.accepted, 'fr-FR', 0)}/{formatNumber(month.count, 'fr-FR', 0)} devis ·{' '}
                          {formatNumber(month.conversionRate, 'fr-FR', 1)} % acceptés · {formatNumber(month.rejectionRate, 'fr-FR', 1)} % refusés
                        </span>
                      </div>
                      <Progress value={month.conversionRate} tone={month.conversionRate >= 50 ? 'success' : 'primary'} />
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prestations les plus vendues</CardTitle>
                <CardDescription>Classement par montant hors taxes cumulé sur la période.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.topProducts.length === 0 ? (
                  <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden />} title="Aucune prestation" description="Aucune ligne de devis sur cette période." />
                ) : (
                  <TableShell>
                    <Table>
                      <thead>
                        <tr>
                          <th>Prestation</th>
                          <th className="text-right">Quantité</th>
                          <th className="text-right">Montant HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.topProducts.map((product) => (
                          <tr key={product.name}>
                            <td className="font-medium">
                              {product.name}
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({formatNumber(product.occurrences, 'fr-FR', 0)} ligne(s))
                              </span>
                            </td>
                            <td className="text-right tabular-nums">{formatNumber(product.quantity, 'fr-FR', 2)}</td>
                            <td className="text-right tabular-nums">{money(product.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableShell>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meilleurs clients</CardTitle>
                <CardDescription>Montants émis et acceptés, sur la période sélectionnée.</CardDescription>
              </CardHeader>
              <CardContent>
                <TableShell>
                  <Table>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th className="text-right">Devis</th>
                        <th className="text-right">Montant</th>
                        <th className="text-right">Accepté</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.topCustomers.map((customer) => (
                        <tr key={customer.id ?? customer.name}>
                          <td className="font-medium">
                            {customer.id ? (
                              <Link href={`/clients/${customer.id}`} className="hover:text-primary hover:underline">
                                {customer.name}
                              </Link>
                            ) : (
                              customer.name
                            )}
                          </td>
                          <td className="text-right tabular-nums">{formatNumber(customer.count, 'fr-FR', 0)}</td>
                          <td className="text-right tabular-nums">{money(customer.amount)}</td>
                          <td className="text-right tabular-nums">{money(customer.acceptedAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableShell>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comparaison année sur année</CardTitle>
                <CardDescription>Montants émis cette année comparés à l’année précédente, mois par mois.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.yearOverYear.length === 0 ? (
                  <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden />} title="Pas encore d’historique" description="Aucun devis sur l’année en cours ni sur la précédente." />
                ) : (
                  <TableShell>
                    <Table>
                      <thead>
                        <tr>
                          <th>Mois</th>
                          <th className="text-right">Cette année</th>
                          <th className="text-right">An dernier</th>
                          <th className="text-right">Variation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.yearOverYear.map((entry) => (
                          <tr key={entry.label}>
                            <td className="font-medium capitalize">{entry.label}</td>
                            <td className="text-right tabular-nums">{money(entry.current)}</td>
                            <td className="text-right tabular-nums">{money(entry.previous)}</td>
                            <td className="text-right">
                              {entry.change === null ? (
                                <Badge variant="secondary">Nouveau</Badge>
                              ) : (
                                <Badge variant={entry.change >= 0 ? 'success' : 'danger'}>
                                  {entry.change >= 0 ? '+' : ''}
                                  {formatNumber(entry.change, 'fr-FR', 1)} %
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableShell>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détail par statut</CardTitle>
              <CardDescription>Répartition et montants cumulés pour la période et la devise sélectionnées.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableShell>
                <Table>
                  <thead>
                    <tr>
                      <th>Statut</th>
                      <th className="text-right">Devis</th>
                      <th className="text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.statusBreakdown.map((entry) => (
                      <tr key={entry.status}>
                        <td>
                          <StatusBadge status={entry.status} />
                        </td>
                        <td className="text-right tabular-nums">{formatNumber(entry.count, 'fr-FR', 0)}</td>
                        <td className="text-right tabular-nums">{money(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableShell>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Pour agir sur ces chiffres :</span>
            <Button asChild variant="ghost" size="sm">
              <Link href="/devis?statut=SENT">
                Relancer les devis envoyés <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/factures?statut=OVERDUE">
                Suivre les factures en retard <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
