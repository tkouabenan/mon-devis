import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Building2, CalendarClock, Link2, Mail, Pencil, Receipt, Send, User } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getQuotationOrThrow, listQuotationStatusHistory, listSiblingQuotations } from '@/lib/services/quotations';
import { listInvoicesForQuotation } from '@/lib/services/invoices';
import { getQuotationDocumentData } from '@/lib/documents';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { listApprovalEvents, listShares } from '@/lib/services/shares';
import { formatCurrency } from '@/lib/currency';
import { QUOTATION_STATUSES } from '@/lib/constants';
import { getTemplateName } from '@/lib/templates';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { StatusBadge, InvoiceStatusBadge } from '@/components/status-badge';
import { Table, TableShell } from '@/components/ui/table';
import { QuotationActionMenu, RevokeShareButton } from '@/components/quotes/quotation-list-actions';
import { QuotationStatusButtons } from '@/components/quotes/quotation-status-buttons';
import { ConvertQuotationButton } from '@/components/invoices/convert-quotation-button';
import { DocumentPreview } from '@/components/quotes/document-preview';
import { payloadToItems } from '@/components/documents/items-editor';
import { formatDate, formatDateShort, formatRelative, daysUntil } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Détail du devis',
  description: 'Consultez un devis, suivez sa validité, son statut et son lien de partage.',
};

const APPROVAL_LABELS: Record<string, string> = {
  VIEWED: 'Devis consulté',
  APPROVED: 'Devis accepté',
  REJECTED: 'Devis refusé',
  COMMENTED: 'Commentaire du client',
};

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrganization();
  const { id } = await params;
  const organizationId = context.organization.id;

  const quotation = await getQuotationOrThrow(organizationId, id).catch(() => null);
  if (!quotation || quotation.deletedAt) notFound();

  const [documentData, history, shares, events, invoices, siblings, subscription] = await Promise.all([
    getQuotationDocumentData(organizationId, quotation.id).catch(() => null),
    listQuotationStatusHistory(organizationId, quotation.id),
    listShares(organizationId, quotation.id),
    listApprovalEvents(organizationId, quotation.id),
    listInvoicesForQuotation(organizationId, quotation.id),
    listSiblingQuotations(organizationId, quotation.id, quotation.customerId),
    getOrganizationSubscription(organizationId),
  ]);

  if (!documentData) notFound();

  const { totals, company, customer, terms, style } = documentData;
  const previewItems = payloadToItems(
    documentData.items.map((item) => ({
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
  );

  const expiry = quotation.validUntil ? daysUntil(quotation.validUntil) : null;
  const isExpired = expiry !== null && expiry < 0 && !['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(quotation.status);
  const activeShares = shares.filter((share) => !share.revokedAt && new Date(share.expiresAt).getTime() > Date.now());
  const invoiceFromQuotation = invoices.find((invoice) => invoice.status !== 'CANCELLED') ?? null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/devis">
          <ArrowLeft className="size-4" aria-hidden />
          Tous les devis
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{quotation.number}</h1>
            <StatusBadge status={quotation.status} />
            <Badge variant="outline">{getTemplateName(quotation.templateKey)}</Badge>
            {quotation.isArchived ? <Badge variant="outline">Archivé</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {quotation.title} · émis le {formatDate(quotation.issueDate)}
            {quotation.validUntil ? ` · valable jusqu’au ${formatDate(quotation.validUntil)}` : ''} ·{' '}
            {formatCurrency(Number(quotation.total), quotation.currency, 'fr-FR')}
          </p>
          {quotation.customerId ? (
            <p className="text-xs text-muted-foreground">
              <Link href={`/clients/${quotation.customerId}`} className="text-primary hover:underline">
                Ouvrir la fiche client
              </Link>
              {siblings.length > 0 ? ` · ${siblings.length} autre(s) devis pour ce client` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/devis/${quotation.id}/modifier`}>
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/devis/${quotation.id}/export?format=pdf`} target="_blank" rel="noreferrer">
              Aperçu PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/devis/nouveau`}>Nouveau devis</Link>
          </Button>
          {quotation.status === 'ACCEPTED' ? (
            <ConvertQuotationButton
              quotationId={quotation.id}
              quotationNumber={quotation.number}
              variant="success"
              label="Convertir en facture"
            />
          ) : null}
          <QuotationActionMenu
            quotationId={quotation.id}
            quotationNumber={quotation.number}
            status={quotation.status}
            canShare={subscription.limits.shareLinks}
            canConvert
            compact={false}
          />
        </div>
      </div>

      {isExpired ? (
        <Alert variant="warning" title="Devis expiré">
          La date de validité est dépassée depuis {Math.abs(expiry ?? 0)} jour(s). Prolongez la validité depuis l’écran de modification ou
          dupliquez le devis pour le renvoyer.
        </Alert>
      ) : null}

      {invoiceFromQuotation ? (
        <Alert variant="success" title="Devis facturé">
          Facture {invoiceFromQuotation.number} créée depuis ce devis.{' '}
          <Link href={`/factures/${invoiceFromQuotation.id}`} className="font-medium underline underline-offset-4">
            Ouvrir la facture
          </Link>
        </Alert>
      ) : quotation.status === 'ACCEPTED' ? (
        <Alert variant="success" title="Devis accepté">
          Vous pouvez le convertir en facture en un clic : le devis conserve son historique, la facture devient autonome.
        </Alert>
      ) : quotation.status === 'SENT' ? (
        <Alert variant="info" title="Devis envoyé">
          En attente de la décision du client. Les consultations et décisions sont enregistrées uniquement lorsqu’elles passent par
          MON DEVIS (lien sécurisé ou e-mail) : aucun événement n’est simulé.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faire évoluer le devis</CardTitle>
          <CardDescription>Ces actions sont journalisées et déclenchent les notifications correspondantes.</CardDescription>
        </CardHeader>
        <CardContent>
          <QuotationStatusButtons quotationId={quotation.id} status={quotation.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aperçu du document</CardTitle>
              <CardDescription>
                Rendu identique aux exports PDF, Word et Excel, généré depuis les données enregistrées.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentPreview
                kind="QUOTATION"
                company={company}
                customer={customer}
                items={previewItems}
                totals={totals}
                style={style}
                currency={quotation.currency}
                number={quotation.number}
                title={quotation.title}
                statusLabel={QUOTATION_STATUSES[quotation.status].label}
                issueDate={quotation.issueDate.toISOString()}
                validUntil={quotation.validUntil ? quotation.validUntil.toISOString() : null}
                validityLabel="Valable jusqu’au"
                terms={terms as Record<string, string | null | undefined>}
                notes={quotation.notes ?? ''}
                watermark={subscription.isFree}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lignes détaillées</CardTitle>
              <CardDescription>Montants recalculés depuis les données stockées (Decimal.js, sans erreur d’arrondi).</CardDescription>
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
                    {documentData.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="font-medium">{item.name}</span>
                          {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
                        </td>
                        <td className="text-right tabular-nums">
                          {Number(item.quantity).toLocaleString('fr-FR')} {item.unit}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatCurrency(Number(item.unitPrice), quotation.currency, 'fr-FR')}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {item.discountType
                            ? item.discountType === 'PERCENTAGE'
                              ? `${Number(item.discountValue)} %`
                              : formatCurrency(Number(item.discountValue), quotation.currency, 'fr-FR')
                            : '—'}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {Number(item.taxRate) > 0 ? `${Number(item.taxRate)} %` : '—'}
                        </td>
                        <td className="text-right tabular-nums font-medium">
                          {formatCurrency(Number(item.lineTotal), quotation.currency, 'fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableShell>

              <DefinitionList
                items={[
                  { label: 'Sous-total', value: formatCurrency(Number(quotation.subtotal), quotation.currency, 'fr-FR') },
                  ...(Number(quotation.lineDiscountTotal) > 0
                    ? [
                        {
                          label: 'Remises sur lignes',
                          value: `- ${formatCurrency(Number(quotation.lineDiscountTotal), quotation.currency, 'fr-FR')}`,
                        },
                      ]
                    : []),
                  ...(Number(quotation.globalDiscountTotal) > 0
                    ? [
                        {
                          label: 'Remise globale',
                          value: `- ${formatCurrency(Number(quotation.globalDiscountTotal), quotation.currency, 'fr-FR')}`,
                        },
                      ]
                    : []),
                  { label: 'Total HT', value: formatCurrency(Number(quotation.netBeforeTax), quotation.currency, 'fr-FR') },
                  { label: 'TVA', value: formatCurrency(Number(quotation.taxTotal), quotation.currency, 'fr-FR') },
                  { label: 'Total TTC', value: formatCurrency(Number(quotation.total), quotation.currency, 'fr-FR') },
                  ...(Number(quotation.depositAmount) > 0
                    ? [
                        { label: 'Acompte demandé', value: formatCurrency(Number(quotation.depositAmount), quotation.currency, 'fr-FR') },
                        { label: 'Solde restant', value: formatCurrency(totals.amountDue.toNumber(), quotation.currency, 'fr-FR') },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conditions et informations</CardTitle>
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
                {company?.registrationNumber ? (
                  <p className="text-xs text-muted-foreground">RCCM : {company.registrationNumber}</p>
                ) : null}
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
                    ['validityPeriod', 'Validité'],
                    ['paymentTerms', 'Conditions de paiement'],
                    ['deliveryTime', 'Délai de livraison'],
                    ['warranty', 'Garantie'],
                    ['paymentInstructions', 'Coordonnées bancaires / Mobile Money'],
                    ['specialConditions', 'Conditions particulières'],
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

              {quotation.notes ? (
                <div className="space-y-0.5 sm:col-span-2">
                  <p className="label-caps">Notes visibles par le client</p>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{quotation.notes}</p>
                </div>
              ) : null}
              {quotation.internalNotes ? (
                <div className="space-y-0.5 rounded-lg border border-dashed border-border p-3 sm:col-span-2">
                  <p className="label-caps">Notes internes (jamais exportées)</p>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{quotation.internalNotes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coordonnées client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Mail className="size-4" aria-hidden />
                {customer?.email ?? 'Aucun e-mail enregistré'}
              </p>
              {quotation.customerReference ? <p>Référence client : {quotation.customerReference}</p> : null}
              {quotation.reference ? <p>Référence interne : {quotation.reference}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" aria-hidden />
                Historique des statuts
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
                        {entry.fromStatus ? `${QUOTATION_STATUSES[entry.fromStatus].label} → ` : ''}
                        {QUOTATION_STATUSES[entry.toStatus].label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                        {entry.actorName ? ` · ${entry.actorName}` : ''}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="size-4" aria-hidden />
                Liens de partage
              </CardTitle>
              <CardDescription>
                {shares.length === 0
                  ? 'Aucun lien créé pour ce devis.'
                  : `${activeShares.length} lien(s) actif(s) sur ${shares.length}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {shares.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {subscription.limits.shareLinks
                    ? 'Créez un lien depuis le menu d’actions : le client pourra consulter le devis en ligne et l’accepter.'
                    : 'Le partage en ligne est inclus à partir de la formule Pro.'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {shares.map((share) => (
                    <li key={share.id} className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {share.revokedAt
                            ? 'Lien révoqué'
                            : new Date(share.expiresAt).getTime() < Date.now()
                              ? 'Lien expiré'
                              : `Expire ${formatRelative(share.expiresAt)}`}
                        </span>
                        {!share.revokedAt && new Date(share.expiresAt).getTime() > Date.now() ? (
                          <RevokeShareButton shareId={share.id} quotationId={quotation.id} />
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Préfixe {share.tokenPrefix}… · {share.viewCount} consultation(s)
                        {share.lastViewedAt ? ` · dernière le ${formatDateShort(share.lastViewedAt)}` : ' · jamais consulté'}
                        {share.revokedAt ? ` · révoqué le ${formatDateShort(share.revokedAt)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {events.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="size-4" aria-hidden />
                  Activité côté client
                </CardTitle>
                <CardDescription>Événements réellement observés via MON DEVIS (lien sécurisé ou e-mail).</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {events.map((event) => (
                    <li key={event.id} className="space-y-0.5 border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-medium">{APPROVAL_LABELS[event.action] ?? event.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(event.createdAt)}
                        {event.actorName ? ` · ${event.actorName}` : ''}
                        {event.actorEmail ? ` (${event.actorEmail})` : ''}
                      </p>
                      {event.feedback ? <p className="text-sm text-muted-foreground">« {event.feedback} »</p> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {invoices.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="size-4" aria-hidden />
                  Factures liées
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Link href={`/factures/${invoice.id}`} className="text-sm font-medium text-primary hover:underline">
                        {invoice.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(Number(invoice.total), invoice.currency, 'fr-FR')} · échéance{' '}
                        {invoice.dueDate ? formatDateShort(invoice.dueDate) : '—'}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {siblings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Autres devis du client</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {siblings.map((sibling) => (
                  <div key={sibling.id} className="flex items-center justify-between gap-2">
                    <Link href={`/devis/${sibling.id}`} className="text-sm text-primary hover:underline">
                      {sibling.number}
                    </Link>
                    <StatusBadge status={sibling.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
