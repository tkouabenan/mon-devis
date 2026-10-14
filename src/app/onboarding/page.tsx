import type { Metadata } from 'next';
import { getOnboardingData } from '@/app/actions/onboarding';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export const metadata: Metadata = {
  title: 'Configuration de votre espace',
  description: 'Renseignez les informations de votre entreprise pour générer vos premiers devis.',
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const data = await getOnboardingData();

  return (
    <OnboardingWizard
      data={{
        organizationName: data.organization.name,
        userName: data.userName,
        company: {
          name: data.company?.name ?? data.organization.name,
          addressLine1: data.company?.addressLine1 ?? null,
          addressLine2: data.company?.addressLine2 ?? null,
          postalCode: data.company?.postalCode ?? null,
          city: data.company?.city ?? null,
          country: data.company?.country ?? "Côte d'Ivoire",
          countryCode: data.company?.countryCode ?? 'CI',
          phone: data.company?.phone ?? null,
          email: data.company?.email ?? null,
          website: data.company?.website ?? null,
          registrationNumber: data.company?.registrationNumber ?? null,
          taxId: data.company?.taxId ?? null,
          logoUrl: data.company?.logoUrl ?? null,
        },
        settings: {
          defaultCurrency: data.settings?.defaultCurrency ?? 'XOF',
          defaultTaxRate: String(data.settings?.defaultTaxRate ?? '18'),
          defaultValidityDays: data.settings?.defaultValidityDays ?? 30,
          defaultTemplateKey: data.settings?.defaultTemplateKey ?? 'moderne',
          numberingFormat: data.settings?.numberingFormat ?? 'DEV-{YYYY}-{SEQ:4}',
          numberingResetYearly: data.settings?.numberingResetYearly ?? true,
          pricesIncludeTax: data.settings?.pricesIncludeTax ?? false,
          defaultPaymentTerms: data.settings?.defaultPaymentTerms ?? null,
          brandColor: data.settings?.brandColor ?? '#2563EB',
          brandColorSecondary: data.settings?.brandColorSecondary ?? '#0F172A',
        },
      }}
    />
  );
}
