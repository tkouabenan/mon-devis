import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, Coins, FilePlus2, Receipt, Search, TrendingUp } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getInvoiceStats, listInvoices, summarizePayments } from '@/lib/services/invoices';
import { listOrganizationCurrencies, resolvePeriod, type PeriodPreset } from '@/lib/services/analytics';
import { formatCurrency } from '@/lib/currency';
import { INVOICE_STATUSES, INVOICE_STATUS_ORDER, invoiceStatusLabel } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Progress } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { Table, TableShell } from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/status-badge';
import { InvoiceActionMenu } from '@/components/invoices/invoice-list-actions';
import { formatDateShort, formatRelative } from '@/lib/utils';
import type { InvoiceStatus } from '@/db/schema';

export const metadata: Metadata = {
  title: 'Factures',
  description: 'Suivez vos factures, leurs échéances et leurs règlements.',
};

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'due_date', label: 'Échéance proche' },
  { value: 'amount_desc', label: 'Montant décroissant' },
  { value: 'amount_asc', label: 'Montant croissant' },
  { value: 'number', label: 'Numéro' },
];

export default async function InvoicesPage({
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
    retard?: string;
    periode?: string;
    du?: string;
    au?: string;
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
    .filter((value): value is InvoiceStatus => value in INVOICE_STATUSES);

  const period = resolvePeriod((params.periode as PeriodPreset) ?? 'year', params.du ?? null, params.au ?? null);
  const archived = params.archive === '1';
  const deleted = params.corbeille === '1';
  const overdueOnly = params.retard === '1';

  const [list, stats] = await Promise.all([
    listInvoices(organizationId, {
      search: params.q?.trim() || undefined,
      status: statuses.length > 0 ? statuses : undefined,
      archived: deleted ? undefined : archived,
      deleted,
      overdueOnly: overdueOnly || undefined,
      sort: (params.tri as 'recent') ?? 'recent',
      page: Number(params.page ?? 1) || 1,
      pageSize: 20,
    }),
    getInvoiceStats(organizationId, { from: period.from, to: period.to }, currency),
  ]);

  const buildStatusHref = (status: InvoiceStatus) => {
    const next = statuses.includes(status) ? statuses.filter((value) => value !== status) : [...statuses, status];
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (next.length > 0) search.set('statut', next.join(','));
    if (params.tri) search.set('tri', params.tri);
    if (params.devise) search.set('devise', params.devise);
    if (archived) search.set('archive', '1');
    if (deleted) search.set('corbeille', '1');
    if (overdueOnly) search.set('retard', '1');
    const value = search.toString();
    return `/factures${value ? `?${value}` : ''}`;
  };

  const collectionRate = stats.totalBilled > 0 ? Math.round((stats.totalPaid / stats.totalBilled) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Mes factures</h1>
          <p className="text-sm text-muted-foreground">
            {list.total.toLocaleString('fr-FR')} facture(s) {deleted ? 'dans la corbeille' : archived ? 'archivée(s)' : ''} · {period.label} ·
            montants en {currency}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={overdueOnly ? 'default' : 'outline'} size="sm" asChild>
            <Link href={overdueOnly ? '/factures' : '/factures?retard=1'}>
              <AlertTriangle className="size-4" aria-hidden />
              {overdueOnly ? 'Toutes les factures' : `En retard${stats.overdueCount > 0 ? ` (${stats.overdueCount})` : ''}`}
            </Link>
          </Button>
          <Button variant={archived && !deleted ? 'default' : 'outline'} size="sm" asChild>
            <Link href={archived && !deleted ? '/factures' : '/factures?archive=1'}>
              {archived && !deleted ? 'Factures actives' : 'Archives'}
            </Link>
          </Button>
          <Button variant={deleted ? 'default' : 'outline'} size="sm" asChild>
            <Link href={deleted ? '/factures' : '/factures?corbeille=1'}>Corbeille</Link>
          </Button>
          <Button asChild>
            <Link href="/factures/nouvelle">
              <FilePlus2 className="size-4" aria-hidden />
              Nouvelle facture
            </Link>
          </Button>
        </div>
      </div>

      {/* Indicateurs de facturation */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs de facturation">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Receipt className="size-3.5" aria-hidden />
              Facturé ({period.label.toLowerCase()})
            </CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(stats.totalBilled, currency, 'fr-FR')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{stats.count} facture(s) sur la période</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Coins className="size-3.5" aria-hidden />
              Encaissé
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.totalPaid, currency, 'fr-FR')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={collectionRate} tone="success" />
            <p className="text-xs text-muted-foreground">
              {collectionRate} % du facturé encaissé · {stats.paidCount} facture(s) soldée(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5" aria-hidden />
              Reste à encaisser
            </CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(stats.outstanding, currency, 'fr-FR')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats.statusBreakdown.map((entry) => `${entry.count} ${INVOICE_STATUSES[entry.status].label.toLowerCase()}`).join(' · ') || 'Aucune facture'}
            </p>
          </CardContent>
        </Card>

        <Card className={stats.overdueCount > 0 ? 'border-amber-400/60' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" aria-hidden />
              En retard
            </CardDescription>
            <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">
              {formatCurrency(stats.overdueAmount, currency, 'fr-FR')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{stats.overdueCount} facture(s) échue(s) non réglée(s)</p>
          </CardContent>
        </Card>
      </section>

      {stats.aging.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance âgée des impayés</CardTitle>
            <CardDescription>Répartition du reste à encaisser selon l’ancienneté de l’échéance.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            {stats.aging.map((bucket) => (
              <div key={bucket.label} className="rounded-lg border border-border p-3">
                <p className="label-caps">{bucket.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(bucket.amount, currency, 'fr-FR')}</p>
                <p className="text-xs text-muted-foreground">{bucket.count} facture(s)</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Filtres */}
      <Card>
        <CardContent className="space-y-4">
          <form action="/factures" method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
            {archived ? <input type="hidden" name="archive" value="1" /> : null}
            {deleted ? <input type="hidden" name="corbeille" value="1" /> : null}
            {overdueOnly ? <input type="hidden" name="retard" value="1" /> : null}
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
              <Select id="periode" name="periode" defaultValue={params.periode ?? 'year'} className="lg:w-40">
                <option value="30d">30 derniers jours</option>
                <option value="90d">90 derniers jours</option>
                <option value="year">Année en cours</option>
                <option value="12m">12 derniers mois</option>
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
                Filtrer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/factures">Réinitialiser</Link>
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {INVOICE_STATUS_ORDER.map((status) => {
              const active = statuses.includes(status);
              return (
                <Link key={status} href={buildStatusHref(status)}>
                  <Badge variant={active ? 'default' : 'outline'} className={active ? 'ring-1 ring-primary/40' : undefined}>
                    {INVOICE_STATUSES[status].label}
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
          icon={<Receipt className="size-6" aria-hidden />}
          title={deleted ? 'Corbeille vide' : overdueOnly ? 'Aucune facture en retard' : 'Aucune facture pour le moment'}
          description={
            deleted
              ? 'Les factures supprimées apparaissent ici et peuvent être restaurées.'
              : 'Convertissez un devis accepté ou créez une facture directement : numérotation, TVA et règlements sont gérés automatiquement.'
          }
          action={
            <Button asChild>
              <Link href="/factures/nouvelle">
                <FilePlus2 className="size-4" aria-hidden />
                Créer une facture
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
                <th>Facture</th>
                <th>Échéance</th>
                <th className="text-right">Total</th>
                <th className="text-right">Reste dû</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((invoice) => {
                const snapshot = invoice.customerSnapshot as { name?: string; companyName?: string; email?: string } | null;
                const summary = summarizePayments(invoice, []);
                const remaining = Math.max(0, Number(invoice.total) - Number(invoice.amountPaid));
                const isOverdue = summary.isOverdue;
                return (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/factures/${invoice.id}`} className="font-medium text-primary hover:underline">
                        {invoice.number}
                      </Link>
                      {invoice.sourceQuotationNumber ? (
                        <span className="block text-xs text-muted-foreground">Devis {invoice.sourceQuotationNumber}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[200px] truncate">{snapshot?.companyName || snapshot?.name || '—'}</td>
                    <td className="max-w-[220px] truncate text-muted-foreground">
                      {invoice.title}
                      {invoice.dueDate ? (
                        <span className="block text-xs">
                          émise le {formatDateShort(invoice.issueDate)} · échue le {formatDateShort(invoice.dueDate)}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      {invoice.dueDate ? (
                        <>
                          <span className="block text-muted-foreground">{formatDateShort(invoice.dueDate)}</span>
                          {isOverdue ? (
                            <span className="block text-xs text-amber-600 dark:text-amber-400">
                              en retard {formatRelative(invoice.dueDate)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {formatCurrency(Number(invoice.total), invoice.currency, 'fr-FR')}
                      {Number(invoice.amountPaid) > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          réglé {formatCurrency(Number(invoice.amountPaid), invoice.currency, 'fr-FR')}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {remaining > 0 ? formatCurrency(remaining, invoice.currency, 'fr-FR') : '—'}
                    </td>
                    <td>
                      <InvoiceStatusBadge status={invoice.status} />
                      {invoice.isArchived ? <span className="mt-1 block text-xs text-muted-foreground">archivée</span> : null}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/factures/${invoice.id}`}>Ouvrir</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/api/factures/${invoice.id}/export?format=pdf`} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        </Button>
                        <InvoiceActionMenu
                          invoiceId={invoice.id}
                          invoiceNumber={invoice.number}
                          status={invoice.status}
                          canSend={Boolean(snapshot?.email)}
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
              {list.total.toLocaleString('fr-FR')} facture(s) · page {list.page} sur {list.pageCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild={list.page > 1} disabled={list.page === 1}>
                {list.page > 1 ? (
                  <Link
                    href={`/factures?page=${list.page - 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}${
                      params.statut ? `&statut=${params.statut}` : ''
                    }${params.tri ? `&tri=${params.tri}` : ''}${archived ? '&archive=1' : ''}${deleted ? '&corbeille=1' : ''}${
                      overdueOnly ? '&retard=1' : ''
                    }`}
                  >
                    Précédent
                  </Link>
                ) : (
                  <span>Précédent</span>
                )}
              </Button>
              <Button variant="outline" size="sm" asChild={list.page < list.pageCount} disabled={list.page >= list.pageCount}>
                {list.page < list.pageCount ? (
                  <Link
                    href={`/factures?page=${list.page + 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}${
                      params.statut ? `&statut=${params.statut}` : ''
                    }${params.tri ? `&tri=${params.tri}` : ''}${archived ? '&archive=1' : ''}${deleted ? '&corbeille=1' : ''}${
                      overdueOnly ? '&retard=1' : ''
                    }`}
                  >
                    Suivant
                  </Link>
                ) : (
                  <span>Suivant</span>
                )}
              </Button>
            </div>
          </div>
        </TableShell>
      )}

      <p className="text-xs text-muted-foreground">
        Les statuts « {invoiceStatusLabel('PARTIALLY_PAID')} », « {invoiceStatusLabel('PAID')} » et « {invoiceStatusLabel('OVERDUE')} » sont
        calculés automatiquement à partir des règlements enregistrés et de la date d’échéance.
      </p>
    </div>
  );
}
