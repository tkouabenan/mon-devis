import Link from 'next/link';
import type { Metadata } from 'next';
import { FilePlus2, Files, Filter, Search, TrendingUp } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { listQuotations } from '@/lib/services/quotations';
import { getDashboardData, listOrganizationCurrencies, resolvePeriod, type PeriodPreset } from '@/lib/services/analytics';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { formatCurrency } from '@/lib/currency';
import { QUOTATION_STATUSES, QUOTATION_STATUS_ORDER } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Progress } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { Table, TableShell } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { QuotationActionMenu } from '@/components/quotes/quotation-list-actions';
import { PeriodFilter } from '@/components/dashboard/period-filter';
import { ConvertQuotationButton } from '@/components/invoices/convert-quotation-button';
import { formatDateShort, formatRelative, truncate, daysUntil } from '@/lib/utils';
import type { QuotationStatus } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Mes devis',
  description: 'Tous vos devis : statuts, montants, taux d’acceptation et actions rapides.',
};

const SORTS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'oldest', label: 'Plus anciens' },
  { value: 'amount_desc', label: 'Montant décroissant' },
  { value: 'amount_asc', label: 'Montant croissant' },
  { value: 'number', label: 'Numéro' },
];

/** Libellé de tendance lisible à partir d'un KPI (variation vs période précédente). */
function trendLabel(kpi: { value: number; previous: number; change: number | null }): string {
  if (kpi.change === null) return 'pas de comparaison disponible';
  if (kpi.change === 0) return 'stable par rapport à la période précédente';
  return `${kpi.change > 0 ? '+' : ''}${kpi.change.toLocaleString('fr-FR')} % vs période précédente`;
}

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    statut?: string;
    tri?: string;
    page?: string;
    devise?: string;
    archive?: string;
    corbeille?: string;
    periode?: string;
    du?: string;
    au?: string;
    client?: string;
  }>;
}) {
  const context = await requireOrganization();
  const params = await searchParams;
  const organizationId = context.organization.id;

  const currencies = await listOrganizationCurrencies(organizationId);
  const currency = currencies.includes(params.devise ?? '') ? (params.devise as string) : currencies[0];

  const statuses = (params.statut ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is QuotationStatus => value in QUOTATION_STATUSES);

  const period = resolvePeriod((params.periode as PeriodPreset) ?? '90d', params.du ?? null, params.au ?? null);
  const archived = params.archive === '1';
  const deleted = params.corbeille === '1';

  const [list, data, subscription] = await Promise.all([
    listQuotations(organizationId, {
      search: params.q?.trim() || undefined,
      status: statuses.length > 0 ? statuses : undefined,
      customerId: params.client || undefined,
      archived: deleted ? undefined : archived,
      deleted,
      sort: (params.tri as 'recent') ?? 'recent',
      page: Number(params.page ?? 1) || 1,
      pageSize: 20,
    }),
    getDashboardData(organizationId, period, currency),
    getOrganizationSubscription(organizationId),
  ]);

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: params.q,
      statut: params.statut,
      tri: params.tri,
      devise: params.devise,
      archive: archived ? '1' : undefined,
      corbeille: deleted ? '1' : undefined,
      client: params.client,
      periode: params.periode,
      ...overrides,
    };
    Object.entries(base).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const value = search.toString();
    return `/devis${value ? `?${value}` : ''}`;
  };

  const acceptedValue = data.statusBreakdown.find((entry) => entry.status === 'ACCEPTED')?.amount ?? 0;
  const acceptedCount = data.statusBreakdown.find((entry) => entry.status === 'ACCEPTED')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Mes devis</h1>
          <p className="text-sm text-muted-foreground">
            {list.total.toLocaleString('fr-FR')} devis {deleted ? 'dans la corbeille' : archived ? 'archivé(s)' : ''} · période{' '}
            {period.label.toLowerCase()} · montants en {currency}.
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
          <Button variant={archived && !deleted ? 'default' : 'outline'} size="sm" asChild>
            <Link href={archived && !deleted ? '/devis' : '/devis?archive=1'}>
              {archived && !deleted ? 'Devis actifs' : 'Archives'}
            </Link>
          </Button>
          <Button variant={deleted ? 'default' : 'outline'} size="sm" asChild>
            <Link href={deleted ? '/devis' : '/devis?corbeille=1'}>Corbeille</Link>
          </Button>
          <Button asChild>
            <Link href="/devis/nouveau">
              <FilePlus2 className="size-4" aria-hidden />
              Nouveau devis
            </Link>
          </Button>
        </div>
      </div>

      {params.client ? (
        <Alert variant="info">
          Filtre actif : devis d’un client spécifique.{' '}
          <Link href="/devis" className="font-medium underline underline-offset-4">
            Retirer le filtre
          </Link>
        </Alert>
      ) : null}

      {data.hasOtherCurrencies ? (
        <Alert variant="warning" title="Plusieurs devises détectées">
          Les montants affichés portent sur la devise <strong>{currency}</strong>. Les autres devises restent comptabilisées séparément (aucune
          conversion automatique) :{' '}
          {data.availableCurrencies
            .filter((entry) => entry.currency !== currency)
            .map((entry) => `${entry.count} devis en ${entry.currency}`)
            .join(', ')}
          .
        </Alert>
      ) : null}

      {/* Synthèse de la période */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Synthèse des devis">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Devis créés ({period.label.toLowerCase()})</CardDescription>
            <CardTitle className="text-2xl">{data.quotationCount.value.toLocaleString('fr-FR')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              dont {acceptedCount} accepté(s) · période précédente : {data.quotationCount.previous}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Montant total</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(data.totalAmount.value, currency, 'fr-FR')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{trendLabel(data.totalAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5" aria-hidden />
              Valeur acceptée
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              {formatCurrency(acceptedValue, currency, 'fr-FR')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{trendLabel(data.acceptedAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Taux d’acceptation</CardDescription>
            <CardTitle className="text-2xl">{data.acceptanceRate.value.toLocaleString('fr-FR')} %</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={data.acceptanceRate.value} tone="success" />
            <p className="text-xs text-muted-foreground">
              {data.acceptedCount.value} accepté(s) · panier moyen {formatCurrency(data.extra.averageValue, currency, 'fr-FR')}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Filtres */}
      <Card>
        <CardContent className="space-y-4">
          <form action="/devis" method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
            {archived ? <input type="hidden" name="archive" value="1" /> : null}
            {deleted ? <input type="hidden" name="corbeille" value="1" /> : null}
            <div className="flex-1 space-y-1.5">
              <label htmlFor="q" className="label-caps block">
                Rechercher
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Numéro, intitulé, client…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tri" className="label-caps block">
                Trier par
              </label>
              <Select id="tri" name="tri" defaultValue={params.tri ?? 'recent'} className="lg:w-52">
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="periode" className="label-caps block">
                Période
              </label>
              <Select id="periode" name="periode" defaultValue={params.periode ?? '90d'} className="lg:w-44">
                {['7d', '30d', '90d', 'year', '12m'].map((preset) => (
                  <option key={preset} value={preset}>
                    {preset === '7d'
                      ? '7 derniers jours'
                      : preset === '30d'
                        ? '30 derniers jours'
                        : preset === '90d'
                          ? '90 derniers jours'
                          : preset === 'year'
                            ? 'Année en cours'
                            : '12 derniers mois'}
                  </option>
                ))}
              </Select>
            </div>
            {currencies.length > 1 ? (
              <div className="space-y-1.5">
                <label htmlFor="devise" className="label-caps block">
                  Devise
                </label>
                <Select id="devise" name="devise" defaultValue={currency} className="lg:w-28">
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="outline">
                <Filter className="size-4" aria-hidden />
                Filtrer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/devis">Réinitialiser</Link>
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {QUOTATION_STATUS_ORDER.map((status) => {
              const active = statuses.includes(status);
              const next = active ? statuses.filter((value) => value !== status) : [...statuses, status];
              return (
                <Link key={status} href={buildQuery({ statut: next.length > 0 ? next.join(',') : undefined, page: undefined })}>
                  <Badge variant={active ? 'default' : 'outline'} className={active ? 'ring-1 ring-primary/40' : undefined}>
                    {QUOTATION_STATUSES[status].label}
                    {active ? ' ✕' : ''}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {list.rows.length === 0 ? (
        <EmptyState
          icon={<Files className="size-6" aria-hidden />}
          title={deleted ? 'Corbeille vide' : archived ? 'Aucun devis archivé' : 'Aucun devis pour le moment'}
          description={
            params.q || statuses.length > 0
              ? 'Aucun devis ne correspond à ces filtres. Essayez d’élargir la recherche ou la période.'
              : 'Créez votre premier devis : catalogue de produits, calculs automatiques, 8 modèles professionnels et exports PDF, Word et Excel.'
          }
          action={
            <Button asChild>
              <Link href="/devis/nouveau">
                <FilePlus2 className="size-4" aria-hidden />
                Créer un devis
              </Link>
            </Button>
          }
        />
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Client</th>
                <th>Intitulé</th>
                <th>Dates</th>
                <th className="text-right">Montant</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((quotation) => {
                const snapshot = quotation.customerSnapshot as { name?: string; companyName?: string; email?: string } | null;
                const validity = quotation.validUntil ? daysUntil(quotation.validUntil) : null;
                return (
                  <tr key={quotation.id}>
                    <td>
                      <Link href={`/devis/${quotation.id}`} className="font-medium text-primary hover:underline">
                        {quotation.number}
                      </Link>
                      {quotation.isArchived ? <span className="block text-xs text-muted-foreground">archivé</span> : null}
                    </td>
                    <td className="max-w-[180px] truncate">{snapshot?.companyName || snapshot?.name || '—'}</td>
                    <td className="max-w-[220px] truncate text-muted-foreground">{truncate(quotation.title, 60)}</td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      <span className="block">émis le {formatDateShort(quotation.issueDate)}</span>
                      {quotation.validUntil ? (
                        <span
                          className={
                            validity !== null && validity < 0 && quotation.status === 'SENT'
                              ? 'block text-xs text-amber-600 dark:text-amber-400'
                              : 'block text-xs'
                          }
                        >
                          valable jusqu’au {formatDateShort(quotation.validUntil)}
                          {validity !== null && validity < 0 ? ` (expiré ${formatRelative(quotation.validUntil)})` : ''}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums">
                      {formatCurrency(Number(quotation.total), quotation.currency, 'fr-FR')}
                    </td>
                    <td>
                      <StatusBadge status={quotation.status} />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/devis/${quotation.id}`}>Ouvrir</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/api/devis/${quotation.id}/export?format=pdf`} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        </Button>
                        {quotation.status === 'ACCEPTED' && !deleted ? (
                          <ConvertQuotationButton
                            quotationId={quotation.id}
                            quotationNumber={quotation.number}
                            variant="outline"
                            label="Facturer"
                          />
                        ) : null}
                        <QuotationActionMenu
                          quotationId={quotation.id}
                          quotationNumber={quotation.number}
                          status={quotation.status}
                          canShare={subscription.limits.shareLinks}
                          canConvert
                          canRestore={deleted}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              {list.total.toLocaleString('fr-FR')} devis · page {list.page} sur {list.pageCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild={list.page > 1} disabled={list.page === 1}>
                {list.page > 1 ? <Link href={buildQuery({ page: String(list.page - 1) })}>Précédent</Link> : <span>Précédent</span>}
              </Button>
              <Button variant="outline" size="sm" asChild={list.page < list.pageCount} disabled={list.page >= list.pageCount}>
                {list.page < list.pageCount ? <Link href={buildQuery({ page: String(list.page + 1) })}>Suivant</Link> : <span>Suivant</span>}
              </Button>
            </div>
          </div>
        </TableShell>
      )}
    </div>
  );
}
