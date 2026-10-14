import Link from 'next/link';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { ExternalLink, Palette, ShieldCheck } from 'lucide-react';
import { db } from '@/db';
import { companyProfiles } from '@/db/schema';
import { requireOrganization } from '@/lib/auth/guards';
import { CompanyForm, type CompanyFormValues } from '@/components/company/company-form';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Mon entreprise',
  description: 'Informations légales, logo et coordonnées de paiement utilisées sur vos devis et factures.',
};

export default async function CompanyPage() {
  const context = await requireOrganization();
  const organizationId = context.organization.id;

  const [profile] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.organizationId, organizationId))
    .limit(1);

  const values: CompanyFormValues = {
    organizationName: context.organization.name,
    name: profile?.name ?? context.organization.name,
    addressLine1: profile?.addressLine1 ?? null,
    addressLine2: profile?.addressLine2 ?? null,
    postalCode: profile?.postalCode ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? "Côte d'Ivoire",
    countryCode: profile?.countryCode ?? 'CI',
    phone: profile?.phone ?? null,
    email: profile?.email ?? null,
    website: profile?.website ?? null,
    registrationNumber: profile?.registrationNumber ?? null,
    taxId: profile?.taxId ?? null,
    legalInfo: profile?.legalInfo ?? null,
    bankDetails: profile?.bankDetails ?? null,
    paymentInfo: profile?.paymentInfo ?? null,
    signatureLabel: profile?.signatureLabel ?? null,
    logoUrl: profile?.logoUrl ?? null,
  };

  const missing: string[] = [];
  if (!values.logoUrl) missing.push('logo');
  if (!values.addressLine1) missing.push('adresse');
  if (!values.registrationNumber) missing.push('numéro RCCM');
  if (!values.taxId) missing.push('numéro fiscal');
  if (!values.bankDetails && !values.paymentInfo) missing.push('coordonnées de paiement');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Mon entreprise</h1>
          <p className="text-sm text-muted-foreground">
            Ces informations apparaissent sur tous vos documents — devis, factures, exports PDF, Word et Excel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/modeles">
              <Palette className="mr-2 h-4 w-4" aria-hidden />
              Modèles de devis
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/parametres?onglet=documents">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Réglages des documents
            </Link>
          </Button>
        </div>
      </div>

      {missing.length > 0 ? (
        <Alert variant="warning" title="Complétez votre fiche pour des documents conformes">
          Il manque encore : {missing.join(', ')}. Ces éléments sont attendus par vos clients et renforcent la crédibilité de vos devis.
        </Alert>
      ) : (
        <Alert variant="success" title="Fiche complète" icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
          Toutes les mentions obligatoires sont renseignées. Vos documents sont prêts à être envoyés.
        </Alert>
      )}

      <CompanyForm values={values} />

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Bon à savoir</CardTitle>
          <CardDescription>
            Chaque devis et chaque facture conserve une copie figée de ces informations au moment de sa création : modifier votre
            fiche aujourd’hui ne change <strong>pas</strong> les documents déjà émis.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Espace de travail : <span className="font-medium text-foreground">{context.organization.name}</span> · rôle{' '}
          {context.role === 'OWNER' ? 'propriétaire' : context.role === 'ADMIN' ? 'administrateur' : 'membre'}.
        </CardContent>
      </Card>
    </div>
  );
}
