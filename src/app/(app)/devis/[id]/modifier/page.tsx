import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireOrganization } from '@/lib/auth/guards';
import { buildCompanySnapshot, getOrganizationSettings, getQuotationWithItems } from '@/lib/services/quotations';
import { listCustomers } from '@/lib/services/customers';
import { listProducts } from '@/lib/services/products';
import { getOrganizationSubscription } from '@/lib/services/subscription';
import { QuotationBuilder, type BuilderCustomer, type BuilderQuotation } from '@/components/quotes/quotation-builder';
import type { EditorProduct } from '@/components/documents/items-editor';
import type { TemplateCustomization } from '@/lib/templates';

export const metadata: Metadata = {
  title: 'Modifier un devis',
  description: 'Modifiez un devis existant avec sauvegarde automatique et aperçu temps réel.',
};

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrganization();
  const { id } = await params;
  const organizationId = context.organization.id;

  const quotation = await getQuotationWithItems(organizationId, id).catch(() => null);
  if (!quotation || quotation.deletedAt) notFound();
  if (quotation.isArchived) notFound();

  const [settings, customers, products, company, subscription] = await Promise.all([
    getOrganizationSettings(organizationId),
    listCustomers(organizationId, { pageSize: 200, archived: false }),
    listProducts(organizationId, { pageSize: 200, status: 'ACTIVE' }),
    buildCompanySnapshot(organizationId),
    getOrganizationSubscription(organizationId),
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

  const builderQuotation: BuilderQuotation = {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    title: quotation.title,
    customerId: quotation.customerId,
    reference: quotation.reference,
    customerReference: quotation.customerReference,
    currency: quotation.currency,
    issueDate: quotation.issueDate.toISOString(),
    validUntil: quotation.validUntil ? quotation.validUntil.toISOString() : null,
    templateKey: quotation.templateKey,
    customization: (quotation.customization as unknown as TemplateCustomization | null) ?? null,
    pricesIncludeTax: quotation.pricesIncludeTax,
    globalDiscountType: (quotation.globalDiscountType ?? '') as '' | 'PERCENTAGE' | 'FIXED',
    globalDiscountValue: quotation.globalDiscountValue,
    depositAmount: quotation.depositAmount,
    notes: quotation.notes ?? '',
    internalNotes: quotation.internalNotes ?? '',
    terms: (quotation.terms as Record<string, string | null | undefined>) ?? {},
    items: quotation.items.map((item) => ({
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
  };

  return (
    <QuotationBuilder
      mode="edit"
      quotation={builderQuotation}
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
      nextNumberPreview={quotation.number}
      watermark={subscription.isFree}
      canUsePremiumTemplates={subscription.limits.customTemplates}
      canShare={subscription.limits.shareLinks}
    />
  );
}
