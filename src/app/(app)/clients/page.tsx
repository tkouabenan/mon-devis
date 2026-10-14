import Link from 'next/link';
import type { Metadata } from 'next';
import { Download, Search, Users } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { listCustomers } from '@/lib/services/customers';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, EmptyState } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { Table, TableShell } from '@/components/ui/table';
import { CustomerFormDialog, ImportCustomersDialog } from '@/components/customers/customer-form';
import { CustomerRowActions } from '@/components/customers/customer-actions';
import { formatDateShort } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Clients',
  description: 'Fiches clients, historique des devis et taux d’acceptation.',
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; archive?: string; tri?: string }>;
}) {
  const context = await requireOrganization();
  const params = await searchParams;
  const organizationId = context.organization.id;

  const archived = params.archive === '1';
  const list = await listCustomers(organizationId, {
    search: params.q?.trim() || undefined,
    archived,
    sort: (params.tri as 'recent' | 'name' | 'value') ?? 'name',
    page: Number(params.page ?? 1) || 1,
    pageSize: 20,
  });

  const totalsLabel = (totals: { currency: string; amount: number; accepted: number; count: number }[]) =>
    totals.length === 0
      ? '—'
      : totals
          .slice(0, 2)
          .map((total) => formatCurrency(total.amount, total.currency, 'fr-FR'))
          .join(' · ');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Mes clients</h1>
          <p className="text-sm text-muted-foreground">
            {list.total.toLocaleString('fr-FR')} client(s) {archived ? 'archivé(s)' : 'actif(s)'} · fiches, historique et statistiques
            par client.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={archived ? 'default' : 'outline'} size="sm" asChild>
            <Link href={archived ? '/clients' : '/clients?archive=1'}>
              {archived ? 'Voir les clients actifs' : 'Voir les archives'}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/clients/export" download>
              <Download className="size-4" aria-hidden />
              Exporter (CSV)
            </a>
          </Button>
          <ImportCustomersDialog />
          <CustomerFormDialog />
        </div>
      </div>

      <Card>
        <CardContent>
          <form action="/clients" method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
            {archived ? <input type="hidden" name="archive" value="1" /> : null}
            <div className="flex-1 space-y-1.5">
              <label htmlFor="q" className="label-caps block">
                Rechercher
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Nom, société, e-mail, ville…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tri" className="label-caps block">
                Trier par
              </label>
              <Select id="tri" name="tri" defaultValue={params.tri ?? 'name'} className="lg:w-52">
                <option value="name">Nom (A → Z)</option>
                <option value="recent">Ajout récent</option>
                <option value="value">Chiffre d’affaires</option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="outline">
                Filtrer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/clients">Réinitialiser</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {list.rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title={params.q ? 'Aucun client ne correspond à votre recherche' : 'Aucun client pour le moment'}
          description="Ajoutez un client pour le sélectionner ensuite dans vos devis et factures. Vous pouvez aussi importer votre liste au format CSV."
          action={<CustomerFormDialog />}
        />
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Ville</th>
                <th className="text-right">Devis</th>
                <th className="text-right">Acceptés</th>
                <th className="text-right">Montant cumulé</th>
                <th>Dernier devis</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/clients/${customer.id}`} className="font-medium text-primary hover:underline">
                      {customer.companyName || customer.name}
                    </Link>
                    {customer.companyName ? (
                      <span className="block text-xs text-muted-foreground">{customer.name}</span>
                    ) : null}
                    {customer.isArchived ? <span className="block text-xs text-muted-foreground">Archivé</span> : null}
                  </td>
                  <td className="text-muted-foreground">
                    <span className="block">{customer.email ?? '—'}</span>
                    <span className="block text-xs">{customer.phone ?? ''}</span>
                  </td>
                  <td className="text-muted-foreground">
                    {[customer.city, customer.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="text-right tabular-nums">{customer.quotationCount}</td>
                  <td className="text-right tabular-nums">{customer.acceptedCount}</td>
                  <td className="text-right tabular-nums">{totalsLabel(customer.totals)}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {customer.lastQuotationAt ? formatDateShort(customer.lastQuotationAt) : '—'}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/clients/${customer.id}`}>Ouvrir</Link>
                      </Button>
                      <CustomerRowActions
                        customerId={customer.id}
                        customerName={customer.companyName || customer.name}
                        isArchived={customer.isArchived}
                        quotationCount={customer.quotationCount}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {list.page} sur {list.pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild={list.page > 1} disabled={list.page === 1}>
                  {list.page > 1 ? (
                    <Link href={`/clients?page=${list.page - 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}${archived ? '&archive=1' : ''}`}>
                      Précédent
                    </Link>
                  ) : (
                    <span>Précédent</span>
                  )}
                </Button>
                <Button variant="outline" size="sm" asChild={list.page < list.pageCount} disabled={list.page >= list.pageCount}>
                  {list.page < list.pageCount ? (
                    <Link href={`/clients?page=${list.page + 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}${archived ? '&archive=1' : ''}`}>
                      Suivant
                    </Link>
                  ) : (
                    <span>Suivant</span>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </TableShell>
      )}

      {!archived && list.total >= 10 ? (
        <Alert variant="info">
          Astuce : cliquez sur un client pour voir son historique complet de devis, son taux d’acceptation et ses factures.
        </Alert>
      ) : null}
    </div>
  );
}
