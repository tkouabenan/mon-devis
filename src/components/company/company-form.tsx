'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, ImageUp, Loader2, Save, Trash2 } from 'lucide-react';
import { saveCompanyProfileAction, uploadCompanyLogoAction } from '@/app/actions/settings';
import type { ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { FieldError, FormField, Input, Select, Textarea } from '@/components/ui/form';
import { COUNTRIES } from '@/lib/constants';

export interface CompanyFormValues {
  organizationName: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  countryCode: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  legalInfo: string | null;
  bankDetails: string | null;
  paymentInfo: string | null;
  signatureLabel: string | null;
  logoUrl: string | null;
}

/**
 * Fiche entreprise : ces informations sont reprises telles quelles sur les devis
 * et les factures (bloc émetteur, coordonnées bancaires, mentions légales).
 */
export function CompanyForm({ values, onSaved }: { values: CompanyFormValues; onSaved?: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<ActionResult | undefined, FormData>(saveCompanyProfileAction, undefined);
  const [logoState, logoAction, logoPending] = React.useActionState<ActionResult<{ url: string }> | undefined, FormData>(
    uploadCompanyLogoAction,
    undefined,
  );
  const [logoUrl, setLogoUrl] = React.useState(values.logoUrl);
  const [countryCode, setCountryCode] = React.useState(values.countryCode || 'CI');
  const handledState = React.useRef<typeof state>(undefined);
  const handledLogo = React.useRef<typeof logoState>(undefined);

  React.useEffect(() => {
    if (!state || handledState.current === state) return;
    handledState.current = state;
    if (state.success) {
      toast.success(state.message ?? 'Entreprise mise à jour.');
      router.refresh();
      onSaved?.();
    } else {
      toast.error(state.message ?? 'Vérifiez les informations saisies.');
    }
  }, [state, router, onSaved]);

  React.useEffect(() => {
    if (!logoState || handledLogo.current === logoState) return;
    handledLogo.current = logoState;
    if (logoState.success) {
      toast.success(logoState.message ?? 'Logo enregistré.');
      setLogoUrl(logoState.data?.url ?? null);
      router.refresh();
    } else {
      toast.error(logoState.message ?? 'Import du logo impossible.');
    }
  }, [logoState, router]);

  const errors = (state && !state.success ? state.errors : undefined) ?? {};

  return (
    <div className="space-y-6">
      {state && !state.success && state.message ? <Alert variant="danger">{state.message}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageUp className="h-4 w-4 text-primary" aria-hidden />
            Logo
          </CardTitle>
          <CardDescription>
            PNG, JPG ou SVG, 2 Mo maximum. Affiché en haut de chaque devis et facture selon la position définie dans les paramètres.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-5">
          <div className="flex h-20 w-40 items-center justify-center rounded-xl border border-dashed bg-muted/40 p-2">
            {logoUrl ? (
              <Image src={logoUrl} alt="Logo de l’entreprise" width={160} height={72} className="max-h-16 w-auto object-contain" unoptimized />
            ) : (
              <span className="text-xs text-muted-foreground">Aucun logo</span>
            )}
          </div>

          <form action={logoAction} className="flex flex-wrap items-end gap-3">
            <FormField label="Remplacer le logo" htmlFor="logo">
              <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml" required />
            </FormField>
            <Button type="submit" variant="outline" disabled={logoPending}>
              {logoPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ImageUp className="mr-2 h-4 w-4" aria-hidden />}
              Envoyer
            </Button>
          </form>

          {logoUrl ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Pour retirer le logo, envoyez une image vide ou remplacez-le : le fichier précédent restera archivé dans votre espace.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" aria-hidden />
              Identité
            </CardTitle>
            <CardDescription>Nom commercial et coordonnées qui apparaissent sur vos documents.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nom de l’organisation" htmlFor="organizationName" required hint="Utilisé pour votre espace de travail.">
              <Input id="organizationName" name="organizationName" defaultValue={values.organizationName} required minLength={2} maxLength={120} />
            </FormField>
            <FormField label="Nom affiché sur les documents" htmlFor="name" required>
              <Input id="name" name="name" defaultValue={values.name} required minLength={2} maxLength={160} />
            </FormField>
            <FormField label="Adresse" htmlFor="addressLine1" error={errors.addressLine1}>
              <Input id="addressLine1" name="addressLine1" defaultValue={values.addressLine1 ?? ''} placeholder="Rue, immeuble, lot" />
            </FormField>
            <FormField label="Complément d’adresse" htmlFor="addressLine2">
              <Input id="addressLine2" name="addressLine2" defaultValue={values.addressLine2 ?? ''} placeholder="Étage, zone, BP" />
            </FormField>
            <FormField label="Code postal" htmlFor="postalCode">
              <Input id="postalCode" name="postalCode" defaultValue={values.postalCode ?? ''} />
            </FormField>
            <FormField label="Ville" htmlFor="city">
              <Input id="city" name="city" defaultValue={values.city ?? ''} placeholder="Abidjan" />
            </FormField>
            <FormField label="Pays" htmlFor="countryCode">
              <Select
                id="countryCode"
                name="countryCode"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
              >
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <input type="hidden" name="country" value={COUNTRIES.find((country) => country.code === countryCode)?.name ?? values.country} />
            <FormField label="Téléphone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={values.phone ?? ''} placeholder="+225 07 00 00 00 00" />
            </FormField>
            <FormField label="E-mail professionnel" htmlFor="email" error={errors.email}>
              <Input id="email" name="email" type="email" defaultValue={values.email ?? ''} placeholder="contact@mon-entreprise.ci" />
            </FormField>
            <FormField label="Site web" htmlFor="website" error={errors.website}>
              <Input id="website" name="website" defaultValue={values.website ?? ''} placeholder="https://mon-entreprise.ci" />
            </FormField>
            <FormField label="Numéro RCCM / registre" htmlFor="registrationNumber" hint="Mention obligatoire sur les documents commerciaux.">
              <Input id="registrationNumber" name="registrationNumber" defaultValue={values.registrationNumber ?? ''} placeholder="CI-ABJ-2026-B-00000" />
            </FormField>
            <FormField label="Numéro fiscal (NCC / NIF / TVA)" htmlFor="taxId">
              <Input id="taxId" name="taxId" defaultValue={values.taxId ?? ''} placeholder="2600000 X" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mentions, coordonnées de paiement et signature</CardTitle>
            <CardDescription>
              Ces blocs apparaissent en pied de document. Renseignez vos coordonnées bancaires et Mobile Money pour éviter les
              allers-retours avec vos clients.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Coordonnées bancaires" htmlFor="bankDetails" hint="Banque, IBAN, RIB, titulaire." className="sm:col-span-2">
              <Textarea id="bankDetails" name="bankDetails" rows={3} defaultValue={values.bankDetails ?? ''} placeholder="SGCI — IBAN CI93 0000 0000 0000 0000 0000 000 — Titulaire : Mon Entreprise SARL" />
            </FormField>
            <FormField label="Paiement mobile (Orange Money, MTN, Wave…)" htmlFor="paymentInfo" className="sm:col-span-2">
              <Textarea id="paymentInfo" name="paymentInfo" rows={2} defaultValue={values.paymentInfo ?? ''} placeholder="Wave : +225 07 00 00 00 00 — Orange Money : +225 07 00 00 00 00" />
            </FormField>
            <FormField label="Mentions légales du pied de page" htmlFor="legalInfo" className="sm:col-span-2">
              <Textarea id="legalInfo" name="legalInfo" rows={2} defaultValue={values.legalInfo ?? ''} placeholder="SARL au capital de 1 000 000 FCFA — RCCM CI-ABJ-2026-B-00000 — NCC 2600000 X" />
            </FormField>
            <FormField label="Libellé de signature" htmlFor="signatureLabel" hint="Ex. « Bon pour accord », « Le client », « La direction ».">
              <Input id="signatureLabel" name="signatureLabel" defaultValue={values.signatureLabel ?? ''} placeholder="Bon pour accord" />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
            Enregistrer les informations
          </Button>
          {state?.success ? <span className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</span> : null}
        </div>
      </form>
    </div>
  );
}
