import type { Metadata } from 'next';
import { requireOrganization } from '@/lib/auth/guards';
import { buildCompanySnapshot, getOrganizationSettings, nextQuotationNumber } from '@/lib/services/quotations';
import { listCustomers } from '@/lib/services/customers';
import { listProducts } from '@/lib/services/products';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { QuotationBuilder, type BuilderCustomer } from '@/components/quotes/quotation-builder';
import type { EditorProduct } from '@/components/documents/items-editor';

export const metadata: Metadata = {
  title: 'Nouveau devis',
  description:
    'Créez un devis professionnel : calculs automatiques, aperçu temps réel, 8 modèles et exports PDF, Word et Excel.',
};

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const context = await requireOrganization();
  const params = await searchParams;
  const organizationId = context.organization.id;

  const [settings, customers, products, company, subscription, nextNumber] = await Promise.all([
    getOrganizationSettings(organizationId),
    listCustomers(organizationId, { pageSize: 200, archived: false }),
    listProducts(organizationId, { pageSize: 200, status: 'ACTIVE' }),
    buildCompanySnapshot(organizationId),
    getOrganizationSubscription(organizationId),
    nextQuotationNumber(organizationId),
  ]);

  const builderCustomers: BuilderCustomer[] = customers.rows.map((customer) => ({
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    country: customer.country,
    taxId: customer.taxId,
  }));

  const builderProducts: EditorProduct[] = products.rows.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    unit: product.unit || 'unité',
    unitPrice: product.unitPrice,
    taxRate: product.taxRate,
    category: product.category,
    code: product.code,
  }));

  const preselectedCustomer =
    params.client && builderCustomers.some((entry) => entry.id === params.client) ? params.client : null;

  return (
    <QuotationBuilder
      mode="create"
      defaultCustomerId={preselectedCustomer}
      customers={builderCustomers}
      products={builderProducts}
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
        defaultValidityDays: settings.defaultValidityDays,
        defaultTemplateKey: settings.defaultTemplateKey,
        defaultPaymentTerms: settings.defaultPaymentTerms,
        defaultTerms: settings.defaultTerms,
        defaultNotes: settings.defaultNotes,
      }}
      nextNumberPreview={nextNumber}
      watermark={subscription.isFree}
      canUsePremiumTemplates={subscription.limits.customTemplates}
      canShare={subscription.limits.shareLinks}
    />
  );
}
