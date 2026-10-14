import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Building2, CalendarClock, FileText, Mail, Receipt, User } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getInvoiceWithDetails, listInvoicesForQuotation, listInvoiceStatusHistory } from '@/lib/services/invoices';
import { getInvoiceDocumentData } from '@/lib/documents';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { formatCurrency } from '@/lib/currency';
import { INVOICE_PAYMENT_METHOD_LABELS, INVOICE_STATUSES, invoiceStatusLabel } from '@/lib/constants';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { InvoiceStatusBadge, StatusBadge } from '@/components/status-badge';
import { Table, TableShell } from '@/components/ui/table';
import { InvoiceActionMenu } from '@/components/invoices/invoice-list-actions';
import { PaymentPanel, type PaymentRow } from '@/components/invoices/payment-panel';
import { DocumentPreview } from '@/components/quotes/document-preview';
import { payloadToItems } from '@/components/documents/items-editor';
import { formatDate, formatDateShort, formatRelative, daysUntil } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Détail de la facture',
  description: 'Consultez, exportez et suivez le règlement d’une facture.',
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrganization();
  const { id } = await params;
  const organizationId = context.organization.id;

  const details = await getInvoiceWithDetails(organizationId, id).catch(() => null);
  if (!details) notFound();

  const { invoice, summary } = details;
  const [documentData, history, subscription, sourceInvoices] = await Promise.all([
    getInvoiceDocumentData(organizationId, invoice.id).catch(() => null),
    listInvoiceStatusHistory(invoice.id),
    getOrganizationSubscription(organizationId),
    invoice.quotationId ? listInvoicesForQuotation(organizationId, invoice.quotationId) : Promise.resolve([]),
  ]);

  const metadata_ = documentData;
  const segments = metadata_
    ? {
        // Les lignes passent par `payloadToItems` : mêmes clés stables que l'éditeur partagé.
        items: payloadToItems(
          metadata_.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.name,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountType: item.discountType,
            discountValue: item.discountValue,
            taxRate: item.taxRate,
          })),
        ),
        totals: metadata_.totals,
        style: metadata_.style,
      }
    : null;

  const company = documentData?.company ?? null;
  const customer = documentData?.customer ?? null;
  const terms = documentData?.terms ?? {};

  const paymentRows: PaymentRow[] = details.payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference,
    note: payment.note,
    paidAt: payment.paidAt.toISOString(),
  }));

  const dueInDays = invoice.dueDate ? daysUntil(invoice.dueDate) : null;
  const canSend = Boolean(customer?.email);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" asChild className="w-fit">
          <Link href="/factures">
            <ArrowLeft className="size-4" aria-hidden />
            Toutes les factures
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{invoice.number}</h1>
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.isArchived ? <Badge variant="outline">Archivée</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {invoice.title} · émise le {formatDate(invoice.issueDate)}
              {invoice.dueDate ? ` · échéance ${formatDate(invoice.dueDate)}` : ''}
            </p>
            {invoice.sourceQuotationNumber ? (
              <p className="text-xs text-muted-foreground">
                Issue du devis {invoice.sourceQuotationNumber}
                {invoice.quotationId ? (
                  <>
                    {' · '}
                    <Link href={`/devis/${invoice.quotationId}`} className="text-primary hover:underline">
                      ouvrir le devis
                    </Link>
                  </>
                ) : null}{' '}
                · cette facture conserve ses propres données : une modification du devis ne l’affecte pas.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Facture créée directement, sans devis d’origine.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild={canSend} disabled={!canSend} title={canSend ? undefined : 'Le client n’a pas d’adresse e-mail enregistrée.'}>
              {canSend ? (
                <Link href={`/factures/${invoice.id}?envoi=1`}>
                  <Mail className="size-4" aria-hidden />
                  Envoyer au client
                </Link>
              ) : (
                <span>
                  <Mail className="size-4" aria-hidden />
                  Envoyer au client
                </span>
              )}
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/factures/${invoice.id}/export?format=pdf`} target="_blank" rel="noreferrer">
                <FileText className="size-4" aria-hidden />
                Aperçu PDF
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={
                  subscription.limits.exports.docx
                    ? `/api/factures/${invoice.id}/export?format=docx&download=1`
                    : '/abonnement'
                }
                title={subscription.limits.exports.docx ? 'Télécharger la version Word éditable' : 'Disponible à partir du plan Pro'}
              >
                Word
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={
                  subscription.limits.exports.xlsx
                    ? `/api/factures/${invoice.id}/export?format=xlsx&download=1`
                    : '/abonnement'
                }
                title={subscription.limits.exports.xlsx ? 'Télécharger le classeur Excel' : 'Disponible à partir du plan Pro'}
              >
                Excel
              </a>
            </Button>
            <InvoiceActionMenu
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              status={invoice.status}
              canSend={canSend}
              compact={false}
            />
          </div>
        </div>
      </div>

      {summary.isOverdue ? (
        <Alert variant="danger" title="Facture échue">
          Le solde de {formatCurrency(summary.balance, invoice.currency, 'fr-FR')} reste dû
          {dueInDays === null ? '' : ` (échéance dépassée depuis ${Math.abs(dueInDays)} jour(s))`}. Relancez le client ou enregistrez un
          règlement.
        </Alert>
      ) : null}

      {invoice.status === 'DRAFT' ? (
        <Alert variant="info" title="Brouillon">
          Cette facture est encore un brouillon : elle n’est pas comptée comme émise. Marquez-la « {INVOICE_STATUSES.SENT.label} » depuis le
          menu d’actions pour la transmettre au client.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aperçu de la facture</CardTitle>
              <CardDescription>
                Rendu alimenté par les mêmes données que les exports PDF, Word et Excel — statut {invoiceStatusLabel(invoice.status)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {segments ? (
                <DocumentPreview
                  kind="INVOICE"
                  company={company}
                  customer={customer}
                  items={segments.items}
                  totals={segments.totals}
                  style={segments.style}
                  currency={invoice.currency}
                  number={invoice.number}
                  title={invoice.title}
                  statusLabel={INVOICE_STATUSES[invoice.status].label}
                  issueDate={invoice.issueDate.toISOString()}
                  validUntil={invoice.dueDate ? invoice.dueDate.toISOString() : null}
                  validityLabel="Échéance"
                  terms={terms as Record<string, string | null | undefined>}
                  notes={invoice.notes ?? ''}
                  watermark={subscription.isFree}
                  metaRows={documentData?.metaRows ?? []}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Aperçu indisponible : utilisez l’aperçu PDF.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Détail des lignes</CardTitle>
              <CardDescription>Montants enregistrés en base, recalculés ligne par ligne.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TableShell>
                <Table>
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="text-right">Qté</th>
                      <th className="text-right">P.U.</th>
                      <th className="text-right">Remise</th>
                      <th className="text-right">TVA</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="font-medium">{item.name}</span>
                          {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
                        </td>
                        <td className="text-right tabular-nums">
                          {Number(item.quantity).toLocaleString('fr-FR')} {item.unit}
                        </td>
                        <td className="text-right tabular-nums">{formatCurrency(Number(item.unitPrice), invoice.currency, 'fr-FR')}</td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {item.discountType
                            ? item.discountType === 'PERCENTAGE'
                              ? `${Number(item.discountValue)} %`
                              : formatCurrency(Number(item.discountValue), invoice.currency, 'fr-FR')
                            : '—'}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {Number(item.taxRate) > 0 ? `${Number(item.taxRate)} %` : '—'}
                        </td>
                        <td className="text-right tabular-nums font-medium">
                          {formatCurrency(Number(item.lineTotal), invoice.currency, 'fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableShell>

              <DefinitionList
                items={[
                  { label: 'Sous-total', value: formatCurrency(Number(invoice.subtotal), invoice.currency, 'fr-FR') },
                  ...(Number(invoice.lineDiscountTotal) > 0
                    ? [{ label: 'Remises sur lignes', value: `- ${formatCurrency(Number(invoice.lineDiscountTotal), invoice.currency, 'fr-FR')}` }]
                    : []),
                  ...(Number(invoice.globalDiscountTotal) > 0
                    ? [{ label: 'Remise globale', value: `- ${formatCurrency(Number(invoice.globalDiscountTotal), invoice.currency, 'fr-FR')}` }]
                    : []),
                  { label: 'Total HT', value: formatCurrency(Number(invoice.netBeforeTax), invoice.currency, 'fr-FR') },
                  { label: 'TVA', value: formatCurrency(Number(invoice.taxTotal), invoice.currency, 'fr-FR') },
                  { label: 'Total TTC', value: formatCurrency(Number(invoice.total), invoice.currency, 'fr-FR') },
                  { label: 'Prix saisis', value: invoice.pricesIncludeTax ? 'TTC' : 'HT' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conditions et mentions</CardTitle>
              <CardDescription>Reprises telles quelles dans les exports.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="label-caps flex items-center gap-1.5">
                  <Building2 className="size-3.5" aria-hidden /> Émetteur
                </p>
                <p className="text-sm font-semibold">{company?.name ?? context.organization.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[company?.addressLine1, company?.postalCode, company?.city, company?.country].filter(Boolean).join(', ') || '—'}
                </p>
                <p className="text-xs text-muted-foreground">{[company?.email, company?.phone].filter(Boolean).join(' · ')}</p>
                {company?.taxId ? <p className="text-xs text-muted-foreground">N° fiscal : {company.taxId}</p> : null}
              </div>
              <div className="space-y-1.5">
                <p className="label-caps flex items-center gap-1.5">
                  <User className="size-3.5" aria-hidden /> Client
                </p>
                <p className="text-sm font-semibold">{customer?.companyName || customer?.name || '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {[customer?.addressLine1, customer?.city, customer?.country].filter(Boolean).join(', ') || '—'}
                </p>
                <p className="text-xs text-muted-foreground">{[customer?.email, customer?.phone].filter(Boolean).join(' · ')}</p>
                {customer?.taxId ? <p className="text-xs text-muted-foreground">N° fiscal : {customer.taxId}</p> : null}
              </div>

              <dl className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                {(
                  [
                    ['paymentTerms', 'Conditions de règlement'],
                    ['paymentInstructions', 'Coordonnées bancaires / Mobile Money'],
                    ['deliveryTime', 'Délai'],
                    ['legalMentions', 'Mentions légales'],
                  ] as const
                ).map(([key, label]) => {
                  const value = (terms as Record<string, string | null | undefined>)[key];
                  if (!value) return null;
                  return (
                    <div key={key} className="space-y-0.5">
                      <dt className="label-caps">{label}</dt>
                      <dd className="whitespace-pre-line text-sm text-muted-foreground">{value}</dd>
                    </div>
                  );
                })}
              </dl>

              {invoice.notes ? (
                <div className="space-y-0.5 sm:col-span-2">
                  <p className="label-caps">Notes visibles par le client</p>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{invoice.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <PaymentPanel
            invoiceId={invoice.id}
            invoiceNumber={invoice.number}
            currency={invoice.currency}
            total={summary.total}
            amountPaid={summary.amountPaid}
            balance={summary.balance}
            status={invoiceStatusLabel(invoice.status)}
            payments={paymentRows}
            readOnly={invoice.status === 'CANCELLED'}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations de facturation</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: 'Numéro', value: invoice.number },
                  { label: 'Date de facture', value: formatDateShort(invoice.issueDate) },
                  { label: 'Échéance', value: invoice.dueDate ? formatDateShort(invoice.dueDate) : '—' },
                  {
                    label: 'Délai',
                    value:
                      dueInDays === null
                        ? '—'
                        : dueInDays >= 0
                          ? `dans ${dueInDays} jour(s)`
                          : `dépassée de ${Math.abs(dueInDays)} jour(s)`,
                  },
                  { label: 'Devise', value: invoice.currency },
                  { label: 'Statut', value: invoiceStatusLabel(invoice.status) },
                  { label: 'Référence interne', value: invoice.reference ?? '—' },
                  { label: 'Référence client', value: invoice.customerReference ?? '—' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" aria-hidden />
                Historique
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun changement de statut enregistré.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map((entry) => (
                    <li key={entry.id} className="space-y-0.5 border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-medium">
                        {entry.fromStatus ? `${invoiceStatusLabel(entry.fromStatus)} → ` : ''}
                        {invoiceStatusLabel(entry.toStatus)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {sourceInvoices.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="size-4" aria-hidden />
                  Autres factures du devis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {sourceInvoices
                  .filter((entry) => entry.id !== invoice.id)
                  .map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-2">
                      <Link href={`/factures/${entry.id}`} className="text-primary hover:underline">
                        {entry.number}
                      </Link>
                      <InvoiceStatusBadge status={entry.status} />
                    </div>
                  ))}
              </CardContent>
            </Card>
          ) : null}

          {invoice.quotationId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Devis d’origine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Link href={`/devis/${invoice.quotationId}`} className="font-medium text-primary hover:underline">
                  {invoice.sourceQuotationNumber ?? 'Ouvrir le devis'}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Les coordonnées, les lignes et les montants de cette facture ont été copiés à sa création : le contenu affiché reste
                  identique même si le devis est modifié ultérieurement.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {details.payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modes de règlement utilisés</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                {[...new Set(details.payments.map((payment) => payment.method))].map((method) => (
                  <p key={method}>
                    {INVOICE_PAYMENT_METHOD_LABELS[method] ?? method} ·{' '}
                    {formatRelative(details.payments.find((payment) => payment.method === method)?.paidAt ?? new Date())}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
