import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Receipt } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { getInvoiceSettings, listInvoices } from '@/lib/services/invoices';
import { buildCompanySnapshot, getOrganizationSettings, listQuotations } from '@/lib/services/quotations';
import { listCustomers } from '@/lib/services/customers';
import { listProducts } from '@/lib/services/products';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { formatCurrency } from '@/lib/currency';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { InvoiceBuilder, type InvoiceBuilderCustomer } from '@/components/invoices/invoice-builder';
import type { EditorProduct } from '@/components/documents/items-editor';
import { ConvertQuotationButton } from '@/components/invoices/convert-quotation-button';
import { formatDateShort } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Nouvelle facture',
  description: 'Créez une facture depuis un devis accepté ou par saisie directe.',
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ devis?: string }>;
}) {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const params = await searchParams;

  const settings = await getOrganizationSettings(organizationId);
  const invoiceSettings = await getInvoiceSettings(organizationId);
  const [customersList, productsList, company, subscription, accepted, invoices] = await Promise.all([
    listCustomers(organizationId, { pageSize: 200, archived: false }),
    listProducts(organizationId, { pageSize: 200, status: 'ACTIVE' }),
    buildCompanySnapshot(organizationId),
    getOrganizationSubscription(organizationId),
    listQuotations(organizationId, { status: ['ACCEPTED'], pageSize: 25, sort: 'recent' }),
    listInvoices(organizationId, { pageSize: 1 }),
  ]);

  const customers: InvoiceBuilderCustomer[] = customersList.rows.map((customer) => ({
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    country: customer.country,
    taxId: customer.taxId,
  }));

  const products: EditorProduct[] = productsList.rows.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    unit: product.unit,
    unitPrice: product.unitPrice,
    taxRate: product.taxRate,
    category: product.category,
    code: product.code,
  }));

  const preselected = params.devis ? accepted.rows.find((quotation) => quotation.id === params.devis) : undefined;
  const preselectedDetails = preselected ? await import('@/lib/services/quotations').then((module) => module.getQuotationWithItems(organizationId, preselected.id)).catch(() => null) : null;

  return (
    <div className="space-y-6">
      {accepted.rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4" aria-hidden />
              Convertir un devis accepté
            </CardTitle>
            <CardDescription>
              La facture copie le devis (client, lignes, totaux, conditions) et reste indépendante : modifier le devis ensuite ne change
              pas la facture déjà émise.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accepted.rows.slice(0, 6).map((quotation) => {
              const snapshot = quotation.customerSnapshot as { name?: string; companyName?: string } | null;
              return (
                <div key={quotation.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/devis/${quotation.id}`} className="font-medium text-primary hover:underline">
                        {quotation.number}
                      </Link>
                      <StatusBadge status={quotation.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {snapshot?.companyName || snapshot?.name || 'Client non renseigné'} ·{' '}
                      {formatCurrency(Number(quotation.total), quotation.currency, 'fr-FR')} · émis le{' '}
                      {formatDateShort(quotation.issueDate)}
                    </p>
                  </div>
                  <ConvertQuotationButton quotationId={quotation.id} quotationNumber={quotation.number} />
                </div>
              );
            })}
            {accepted.total > accepted.rows.slice(0, 6).length ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/devis?statut=ACCEPTED">
                  Voir tous les devis acceptés
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<Receipt className="size-6" aria-hidden />}
          title="Aucun devis accepté à facturer"
          description="Dès qu’un client accepte un devis, vous pourrez le convertir en facture en un clic. Vous pouvez aussi créer une facture par saisie directe ci-dessous."
          action={
            <Button asChild>
              <Link href="/devis/nouveau">Créer un devis</Link>
            </Button>
          }
        />
      )}

      {invoices.total > 0 ? (
        <Alert variant="info">
          {invoices.total.toLocaleString('fr-FR')} facture(s) déjà enregistrée(s) — numérotation séquentielle par année (
          {invoiceSettings.numberingFormat}).
        </Alert>
      ) : null}

      <InvoiceBuilder
        customers={customers}
        products={products}
        company={
          company
            ? {
                name: company.name,
                logoUrl: company.logoUrl,
                addressLine1: company.addressLine1,
                postalCode: company.postalCode,
                city: company.city,
                country: company.country,
                phone: company.phone,
                email: company.email,
                website: company.website,
                taxId: company.taxId,
                registrationNumber: company.registrationNumber,
                bankDetails: company.bankDetails,
                paymentInfo: company.paymentInfo,
              }
            : null
        }
        settings={{
          defaultCurrency: settings.defaultCurrency,
          defaultTaxRate: Number(settings.defaultTaxRate),
          defaultTemplateKey: settings.defaultTemplateKey,
          defaultPaymentTerms: settings.defaultPaymentTerms,
          defaultTerms: settings.defaultTerms,
        }}
        watermark={subscription.isFree}
        defaultQuotation={
          preselected && preselectedDetails
            ? {
                id: preselected.id,
                number: preselected.number,
                title: preselected.title,
                customerId: preselected.customerId,
                customerReference: preselected.customerReference,
                currency: preselected.currency,
                issueDate: preselected.issueDate.toISOString(),
                validUntil: preselected.validUntil ? preselected.validUntil.toISOString() : null,
                templateKey: preselected.templateKey,
                pricesIncludeTax: preselected.pricesIncludeTax,
                globalDiscountType: (preselected.globalDiscountType ?? '') as '' | 'PERCENTAGE' | 'FIXED',
                globalDiscountValue: preselected.globalDiscountValue,
                notes: preselected.notes ?? '',
                terms: (preselected.terms ?? {}) as Record<string, string | null | undefined>,
              }
            : null
        }
      />
    </div>
  );
}
