import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { and, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { quotations, quotationItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildDocumentData } from '@/lib/quotation-document';
import { resolveShareToken } from '@/lib/services/shares';
import { clientIp } from '@/lib/rate-limit';
import { formatCurrency } from '@/lib/currency';
import { getTemplateName } from '@/lib/templates';
import { QUOTATION_STATUSES } from '@/lib/constants';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList } from '@/components/ui/display';
import { Table, TableShell } from '@/components/ui/table';
import { PublicDecisionForm } from '@/components/quotes/public-decision-form';
import { Logo } from '@/components/brand/logo';
import { formatDate, daysUntil } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Champs de conditions affichés au client, dans l'ordre du document. */
const TERM_FIELDS = [
  ['validityPeriod', 'Validité'],
  ['paymentTerms', 'Conditions de paiement'],
  ['deliveryTime', 'Délai'],
  ['warranty', 'Garantie'],
  ['paymentInstructions', 'Coordonnées de règlement'],
  ['legalMentions', 'Mentions légales'],
] as const satisfies readonly (readonly [string, string])[];

export const metadata: Metadata = {
  title: 'Votre devis',
  description: 'Consultez le devis qui vous a été transmis et répondez en ligne.',
  robots: { index: false, follow: false },
};

/**
 * Page publique de consultation d'un devis (lien de partage sécurisé).
 *
 * Le contenu provient exclusivement du devis concerné : aucun accès à l'espace
 * client, aucune donnée d'une autre organisation. Chaque consultation est
 * comptée une fois par minute maximum afin de mesurer un intérêt réel sans
 * fabriquer d'événements artificiels.
 */
export default async function PublicQuotationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  const shared = await resolveShareToken(token, { ip: clientIp(requestHeaders), userAgent: requestHeaders.get('user-agent') });

  if (!shared) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <Logo />
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Lien indisponible</CardTitle>
            <CardDescription>
              Ce lien de partage est invalide, a expiré ou a été révoqué par l’entreprise. Demandez un nouveau lien à votre
              interlocuteur pour consulter le devis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Si vous disposez d’un compte MON DEVIS, vous pouvez vous connecter pour retrouver vos documents.{' '}
              <Link href="/connexion" className="font-medium text-primary underline underline-offset-4">
                Se connecter
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, shared.quotation.id), isNull(quotations.deletedAt)))
    .limit(1);
  const items = quotation ? await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotation.id)) : [];

  if (!quotation) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Devis introuvable</CardTitle>
            <CardDescription>Le devis a été supprimé par l’entreprise.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const data = buildDocumentData({ quotation, items });
  const company = data.company;
  const customer = data.customer;
  const expiry = quotation.validUntil ? daysUntil(quotation.validUntil) : null;
  const expired = expiry !== null && expiry < 0 && !['ACCEPTED', 'REJECTED'].includes(quotation.status);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-2">
          <Badge variant="outline">Modèle {getTemplateName(quotation.templateKey)}</Badge>
          <Badge variant={quotation.status === 'ACCEPTED' ? 'success' : 'default'}>
            {QUOTATION_STATUSES[quotation.status].label}
          </Badge>
        </div>
      </header>

      {expired ? (
        <Alert variant="warning" title="Devis expiré">
          La date de validité ({formatDate(quotation.validUntil)}) est dépassée. Vous pouvez tout de même demander une mise à jour à
          l’entreprise.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Devis {quotation.number} — {quotation.title}
          </CardTitle>
          <CardDescription>
            Émis le {formatDate(quotation.issueDate)}
            {quotation.validUntil ? ` · valable jusqu’au ${formatDate(quotation.validUntil)}` : ''} par{' '}
            {company?.name ?? 'l’entreprise émettrice'}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="label-caps">Émetteur</p>
              <p className="text-sm font-semibold">{company?.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                {[company?.addressLine1, company?.postalCode, company?.city, company?.country].filter(Boolean).join(', ')}
              </p>
              <p className="text-xs text-muted-foreground">{[company?.email, company?.phone].filter(Boolean).join(' · ')}</p>
              {company?.taxId ? <p className="text-xs text-muted-foreground">N° fiscal : {company.taxId}</p> : null}
            </div>
            <div className="space-y-1.5">
              <p className="label-caps">Destinataire</p>
              <p className="text-sm font-semibold">{customer?.companyName || customer?.name || '—'}</p>
              <p className="text-xs text-muted-foreground">
                {[customer?.addressLine1, customer?.city, customer?.country].filter(Boolean).join(', ')}
              </p>
              <p className="text-xs text-muted-foreground">{[customer?.email, customer?.phone].filter(Boolean).join(' · ')}</p>
            </div>
          </div>

          <TableShell>
            <Table>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">P.U. HT</th>
                  <th className="text-right">TVA</th>
                  <th className="text-right">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="font-medium">{item.name}</span>
                      {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
                    </td>
                    <td className="text-right tabular-nums">
                      {Number(item.quantity).toLocaleString('fr-FR')} {item.unit}
                    </td>
                    <td className="text-right tabular-nums">{formatCurrency(Number(item.unitPrice), quotation.currency, 'fr-FR')}</td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {Number(item.taxRate) > 0 ? `${Number(item.taxRate)} %` : '—'}
                    </td>
                    <td className="text-right tabular-nums font-medium">
                      {formatCurrency(Number(item.lineNet), quotation.currency, 'fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableShell>

          <div className="flex flex-col items-end gap-1.5 text-sm">
            <div className="flex w-full max-w-sm items-center justify-between">
              <span className="text-muted-foreground">Total HT</span>
              <span className="tabular-nums">{formatCurrency(Number(quotation.netBeforeTax), quotation.currency, 'fr-FR')}</span>
            </div>
            <div className="flex w-full max-w-sm items-center justify-between">
              <span className="text-muted-foreground">TVA</span>
              <span className="tabular-nums">{formatCurrency(Number(quotation.taxTotal), quotation.currency, 'fr-FR')}</span>
            </div>
            <div className="flex w-full max-w-sm items-center justify-between rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground">
              <span>Total TTC</span>
              <span className="tabular-nums">{formatCurrency(Number(quotation.total), quotation.currency, 'fr-FR')}</span>
            </div>
            {Number(quotation.depositAmount) > 0 ? (
              <div className="flex w-full max-w-sm items-center justify-between">
                <span className="text-muted-foreground">Acompte demandé</span>
                <span className="tabular-nums">{formatCurrency(Number(quotation.depositAmount), quotation.currency, 'fr-FR')}</span>
              </div>
            ) : null}
          </div>

          <DefinitionList
            items={TERM_FIELDS.flatMap(([key, label]) => {
              const value = (quotation.terms as Record<string, string | null | undefined> | null)?.[key];
              return value
                ? [{ label, value: <span className="whitespace-pre-line font-normal text-muted-foreground">{value}</span> }]
                : [];
            })}
          />

          {quotation.notes ? (
            <div className="space-y-0.5">
              <p className="label-caps">Notes</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{quotation.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <PublicDecisionForm
        token={token}
        allowFeedback={shared.allowFeedback}
        currentStatus={quotation.status}
        defaultName={customer?.name ?? null}
        defaultEmail={customer?.email ?? null}
      />

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        Document transmis via MON DEVIS. Vos données sont utilisées uniquement pour le suivi de ce devis —{' '}
        <Link href="/confidentialite" className="underline underline-offset-4">
          politique de confidentialité
        </Link>{' '}
        ·{' '}
        <Link href="/cgu" className="underline underline-offset-4">
          conditions d’utilisation
        </Link>
      </footer>
    </main>
  );
}
