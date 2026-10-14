import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Building2, FilePlus2, Mail, MapPin, Phone, Receipt, TrendingUp } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getCustomerDetail } from '@/lib/services/customers';
import { listInvoices } from '@/lib/services/invoices';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList, EmptyState, Progress } from '@/components/ui/display';
import { Table, TableShell } from '@/components/ui/table';
import { StatusBadge, InvoiceStatusBadge } from '@/components/status-badge';
import { EditCustomerButton, type CustomerFormValues } from '@/components/customers/customer-form';
import { formatDateShort, formatRelative } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Fiche client',
  description: 'Coordonnées, historique des devis, taux d’acceptation et factures du client.',
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrganization();
  const { id } = await params;
  const organizationId = context.organization.id;

  const detail = await getCustomerDetail(organizationId, id);
  if (!detail) notFound();

  const { customer, history, totals, acceptedCount, acceptanceRate } = detail;
  const invoices = await listInvoices(organizationId, { customerId: customer.id, pageSize: 10, sort: 'recent' });

  const formValues: CustomerFormValues = {
    id: customer.id,
    type: customer.type as 'INDIVIDUAL' | 'COMPANY',
    name: customer.name,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    postalCode: customer.postalCode,
    city: customer.city,
    country: customer.country,
    countryCode: customer.countryCode,
    taxId: customer.taxId,
    notes: customer.notes,
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/clients">
          <ArrowLeft className="size-4" aria-hidden />
          Tous les clients
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{customer.companyName || customer.name}</h1>
            {customer.isArchived ? <span className="text-xs text-muted-foreground">(archivé)</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {customer.companyName ? `${customer.name} · ` : ''}
            {customer.type === 'COMPANY' ? 'Entreprise' : 'Particulier'} · client depuis {formatDateShort(customer.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditCustomerButton customer={formValues} />
          <Button variant="outline" asChild>
            <Link href={`/devis/nouveau?client=${customer.id}`}>
              <FilePlus2 className="size-4" aria-hidden />
              Nouveau devis
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/factures/nouvelle">
              <Receipt className="size-4" aria-hidden />
              Nouvelle facture
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historique des devis</CardTitle>
              <CardDescription>
                {history.length === 0
                  ? 'Aucun devis pour ce client.'
                  : `${history.length} devis · ${acceptedCount} accepté(s)${acceptanceRate === null ? '' : ` · taux d’acceptation ${acceptanceRate} %`}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <EmptyState
                  icon={<FilePlus2 className="size-6" aria-hidden />}
                  title="Aucun devis pour ce client"
                  description="Créez un devis pré-rempli : le client sera déjà sélectionné dans le formulaire."
                  action={
                    <Button asChild>
                      <Link href={`/devis/nouveau?client=${customer.id}`}>Créer un devis</Link>
                    </Button>
                  }
                />
              ) : (
                <>
                  <TableShell>
                    <Table>
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Intitulé</th>
                          <th>Émis le</th>
                          <th>Décision</th>
                          <th className="text-right">Montant</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((quotation) => (
                          <tr key={quotation.id}>
                            <td>
                              <Link href={`/devis/${quotation.id}`} className="font-medium text-primary hover:underline">
                                {quotation.number}
                              </Link>
                            </td>
                            <td className="max-w-[240px] truncate text-muted-foreground">{quotation.title}</td>
                            <td className="whitespace-nowrap text-muted-foreground">{formatDateShort(quotation.issueDate)}</td>
                            <td className="whitespace-nowrap text-muted-foreground">
                              {quotation.decidedAt ? formatRelative(quotation.decidedAt) : '—'}
                            </td>
                            <td className="whitespace-nowrap text-right tabular-nums">
                              {formatCurrency(Number(quotation.total), quotation.currency, 'fr-FR')}
                            </td>
                            <td>
                              <StatusBadge status={quotation.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableShell>
                  {acceptanceRate !== null ? (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="size-3.5" aria-hidden />
                          Taux d’acceptation
                        </span>
                        <span className="font-medium">{acceptanceRate} %</span>
                      </div>
                      <Progress value={acceptanceRate} />
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Factures du client</CardTitle>
              <CardDescription>
                {invoices.total === 0 ? 'Aucune facture émise pour ce client.' : `${invoices.total} facture(s) enregistrée(s).`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Les factures apparaissent ici dès qu’un devis accepté est converti ou qu’une facture est créée.
                </p>
              ) : (
                <ul className="space-y-3">
                  {invoices.rows.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="space-y-0.5">
                        <Link href={`/factures/${invoice.id}`} className="font-medium text-primary hover:underline">
                          {invoice.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(invoice.issueDate)} · échéance {invoice.dueDate ? formatDateShort(invoice.dueDate) : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">{formatCurrency(Number(invoice.total), invoice.currency, 'fr-FR')}</span>
                        <InvoiceStatusBadge status={invoice.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coordonnées</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{customer.email ?? 'Aucun e-mail enregistré'}</span>
              </p>
              <p className="flex items-start gap-2">
                <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{customer.phone ?? 'Aucun téléphone enregistré'}</span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>
                  {[
                    customer.addressLine1,
                    customer.addressLine2,
                    [customer.postalCode, customer.city].filter(Boolean).join(' '),
                    customer.country,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Adresse non renseignée'}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{customer.taxId ? `N° fiscal / RCCM : ${customer.taxId}` : 'N° fiscal non renseigné'}</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chiffres clés</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {totals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun devis enregistré pour ce client.</p>
              ) : (
                totals.map((total) => (
                  <DefinitionList
                    key={total.currency}
                    items={[
                      { label: `Devis (${total.currency})`, value: `${total.count} · ${formatCurrency(total.amount, total.currency, 'fr-FR')}` },
                      { label: `Acceptés (${total.currency})`, value: formatCurrency(total.accepted, total.currency, 'fr-FR') },
                    ]}
                  />
                ))
              )}
              <DefinitionList
                items={[
                  { label: 'Devis acceptés', value: `${acceptedCount}` },
                  { label: 'Taux d’acceptation', value: acceptanceRate === null ? '—' : `${acceptanceRate} %` },
                ]}
              />
            </CardContent>
          </Card>

          {customer.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes internes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{customer.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          {!customer.email ? (
            <Alert variant="warning">
              Ajoutez une adresse e-mail pour envoyer vos devis et factures directement depuis MON DEVIS.
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
