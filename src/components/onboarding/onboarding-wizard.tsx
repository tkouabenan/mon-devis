'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, FileText, ImageIcon, Loader2, Palette, Rocket, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  completeOnboardingAction,
  saveCompanyStepAction,
  saveSettingsStepAction,
  uploadLogoAction,
} from '@/app/actions/onboarding';
import type { ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Separator } from '@/components/ui/display';
import { Checkbox, FormField, Input, Label, Select, Textarea } from '@/components/ui/form';
import { QUOTATION_TEMPLATES } from '@/lib/templates';
import { COUNTRIES, DEFAULT_TAX_RATES } from '@/lib/constants';
import { CURRENCIES, currencyForCountry } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface OnboardingData {
  organizationName: string;
  userName: string;
  company: {
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
    logoUrl: string | null;
  };
  settings: {
    defaultCurrency: string;
    defaultTaxRate: string;
    defaultValidityDays: number;
    defaultTemplateKey: string;
    numberingFormat: string;
    numberingResetYearly: boolean;
    pricesIncludeTax: boolean;
    defaultPaymentTerms: string | null;
    brandColor: string;
    brandColorSecondary: string;
  };
}

const steps = [
  {
    id: 1,
    title: 'Votre entreprise',
    description: 'Ces informations apparaissent sur chaque devis.',
    icon: Building2,
  },
  { id: 2, title: 'Réglages des devis', description: 'Devise, TVA, validité et numérotation.', icon: FileText },
  { id: 3, title: 'Logo & identité', description: 'Habillage de vos documents.', icon: Palette },
];

export function OnboardingWizard({ data }: { data: OnboardingData }) {
  const [step, setStep] = React.useState(1);
  const [countryCode, setCountryCode] = React.useState(data.company.countryCode || 'CI');
  const [currency, setCurrency] = React.useState(data.settings.defaultCurrency);
  const [currencyTouched, setCurrencyTouched] = React.useState(false);
  const [logoUrl, setLogoUrl] = React.useState(data.company.logoUrl);
  const [finishing, setFinishing] = React.useState(false);

  const [companyState, companyAction, companyPending] = React.useActionState<ActionResult | undefined, FormData>(
    saveCompanyStepAction,
    undefined,
  );
  const [settingsState, settingsAction, settingsPending] = React.useActionState<ActionResult | undefined, FormData>(
    saveSettingsStepAction,
    undefined,
  );
  const [logoState, logoAction, logoPending] = React.useActionState<ActionResult | undefined, FormData>(
    uploadLogoAction,
    undefined,
  );

  // Enchaînement automatique dès qu'une étape est validée côté serveur.
  const lastHandled = React.useRef<ActionResult | undefined>(undefined);
  React.useEffect(() => {
    if (!companyState?.success || lastHandled.current === companyState) return;
    lastHandled.current = companyState;
    toast.success(companyState.message ?? 'Enregistré');
    setStep(2);
  }, [companyState]);

  React.useEffect(() => {
    if (!settingsState?.success || lastHandled.current === settingsState) return;
    lastHandled.current = settingsState;
    toast.success(settingsState.message ?? 'Enregistré');
    setStep(3);
  }, [settingsState]);

  React.useEffect(() => {
    if (!logoState?.success || lastHandled.current === logoState) return;
    lastHandled.current = logoState;
    toast.success(logoState.message ?? 'Logo enregistré');
  }, [logoState]);

  const defaultTaxRate = DEFAULT_TAX_RATES[countryCode] ?? 18;
  const progress = step === 1 ? 34 : step === 2 ? 67 : 100;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-700 dark:text-primary-300">
          <Sparkles className="size-3.5" aria-hidden /> Bienvenue {data.userName.split(' ')[0]} !
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Configurons votre espace de devis
        </h1>
        <p className="text-sm text-muted-foreground">
          Trois étapes rapides : vos informations légales, vos réglages par défaut et votre identité visuelle.
        </p>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((item, index) => {
              const isDone = step > item.id;
              const isCurrent = step === item.id;
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold',
                      isDone
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isDone ? <Check className="size-4" aria-hidden /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-semibold', !isCurrent && !isDone && 'text-muted-foreground')}>
                      {item.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <Progress value={progress} aria-label={`Progression : ${progress} %`} />
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
          {step === 1 ? (
            <form action={companyAction} className="space-y-5" key="step-company">
              <input type="hidden" name="countryCode" value={countryCode} />
              <input type="hidden" name="country" value={COUNTRIES.find((c) => c.code === countryCode)?.name ?? "Côte d'Ivoire"} />

              {companyState && !companyState.success ? (
                <Alert variant="danger">{companyState.message ?? 'Vérifiez les champs signalés.'}</Alert>
              ) : null}

              <FormField
                label="Nom de l’entreprise"
                htmlFor="name"
                required
                error={companyState?.errors?.name}
                hint="Il apparaîtra en en-tête de vos devis et factures."
              >
                <Input
                  id="name"
                  name="name"
                  defaultValue={data.company.name === 'Mon entreprise' ? data.organizationName : data.company.name}
                  placeholder="Bâtir & Conseil SARL"
                  required
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Téléphone" htmlFor="phone" error={companyState?.errors?.phone}>
                  <Input id="phone" name="phone" type="tel" defaultValue={data.company.phone ?? ''} placeholder="+225 07 00 00 00" />
                </FormField>
                <FormField label="E-mail professionnel" htmlFor="companyEmail" error={companyState?.errors?.email}>
                  <Input
                    id="companyEmail"
                    name="email"
                    type="email"
                    defaultValue={data.company.email ?? ''}
                    placeholder="contact@entreprise.com"
                  />
                </FormField>
              </div>

              <FormField label="Adresse" htmlFor="addressLine1" error={companyState?.errors?.addressLine1}>
                <Input
                  id="addressLine1"
                  name="addressLine1"
                  defaultValue={data.company.addressLine1 ?? ''}
                  placeholder="Rue des Jardins, Immeuble Alpha"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Code postal" htmlFor="postalCode" error={companyState?.errors?.postalCode}>
                  <Input id="postalCode" name="postalCode" defaultValue={data.company.postalCode ?? ''} placeholder="00225" />
                </FormField>
                <FormField label="Ville" htmlFor="city" error={companyState?.errors?.city}>
                  <Input id="city" name="city" defaultValue={data.company.city ?? ''} placeholder="Abidjan" />
                </FormField>
                <FormField label="Pays" htmlFor="countrySelect">
                  <Select
                    id="countrySelect"
                    value={countryCode}
                    onChange={(event) => {
                      const code = event.target.value;
                      setCountryCode(code);
                      if (!currencyTouched) setCurrency(currencyForCountry(code));
                    }}
                  >
                    {COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Numéro fiscal (NCC, IFU…)"
                  htmlFor="taxId"
                  error={companyState?.errors?.taxId}
                  hint="Facultatif — mention légale sur les documents."
                >
                  <Input id="taxId" name="taxId" defaultValue={data.company.taxId ?? ''} />
                </FormField>
                <FormField
                  label="Registre du commerce (RCCM)"
                  htmlFor="registrationNumber"
                  error={companyState?.errors?.registrationNumber}
                >
                  <Input id="registrationNumber" name="registrationNumber" defaultValue={data.company.registrationNumber ?? ''} />
                </FormField>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="submit" size="lg" loading={companyPending} loadingText="Enregistrement…">
                  Continuer
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </form>
          ) : null}

          {step === 2 ? (
            <form action={settingsAction} className="space-y-5" key="step-settings">
              {settingsState && !settingsState.success ? (
                <Alert variant="danger">{settingsState.message ?? 'Vérifiez les champs signalés.'}</Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Devise par défaut" htmlFor="defaultCurrency" error={settingsState?.errors?.defaultCurrency}>
                  <Select
                    id="defaultCurrency"
                    name="defaultCurrency"
                    value={currency}
                    onChange={(event) => {
                      setCurrency(event.target.value);
                      setCurrencyTouched(true);
                    }}
                  >
                    {CURRENCIES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField
                  label="TVA par défaut (%)"
                  htmlFor="defaultTaxRate"
                  error={settingsState?.errors?.defaultTaxRate}
                  hint={`Taux usuel : ${defaultTaxRate} %`}
                >
                  <Input
                    id="defaultTaxRate"
                    name="defaultTaxRate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    defaultValue={data.settings.defaultTaxRate}
                  />
                </FormField>

                <FormField
                  label="Validité (jours)"
                  htmlFor="defaultValidityDays"
                  error={settingsState?.errors?.defaultValidityDays}
                >
                  <Input
                    id="defaultValidityDays"
                    name="defaultValidityDays"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={data.settings.defaultValidityDays}
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Modèle de devis par défaut" htmlFor="defaultTemplateKey">
                  <Select id="defaultTemplateKey" name="defaultTemplateKey" defaultValue={data.settings.defaultTemplateKey}>
                    {QUOTATION_TEMPLATES.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Format de numérotation"
                  htmlFor="numberingFormat"
                  error={settingsState?.errors?.numberingFormat}
                  hint="Variables : {YYYY} année, {MM}, {SEQ:4} compteur sur 4 chiffres."
                >
                  <Input id="numberingFormat" name="numberingFormat" defaultValue={data.settings.numberingFormat} />
                </FormField>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2.5 rounded-xl border border-border p-3">
                  <Checkbox name="numberingResetYearly" defaultChecked={data.settings.numberingResetYearly} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="block font-medium">Remettre le compteur à zéro chaque année</span>
                    <span className="block text-xs text-muted-foreground">DEV-2026-0001, puis DEV-2027-0001…</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 rounded-xl border border-border p-3">
                  <Checkbox name="pricesIncludeTax" defaultChecked={data.settings.pricesIncludeTax} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="block font-medium">Mes prix sont saisis TTC</span>
                    <span className="block text-xs text-muted-foreground">La TVA sera recalculée à l’envers.</span>
                  </span>
                </label>
              </div>

              <FormField
                label="Conditions de paiement par défaut"
                htmlFor="defaultPaymentTerms"
                hint="Reprises automatiquement dans chaque nouveau devis."
              >
                <Textarea
                  id="defaultPaymentTerms"
                  name="defaultPaymentTerms"
                  rows={3}
                  defaultValue={data.settings.defaultPaymentTerms ?? 'Acompte de 40 % à la commande, solde à la livraison.'}
                />
              </FormField>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" aria-hidden /> Retour
                </Button>
                <Button type="submit" size="lg" loading={settingsPending} loadingText="Enregistrement…">
                  Continuer
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6" key="step-branding">
              <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex size-36 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo de l’entreprise" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                        <ImageIcon className="size-6" aria-hidden />
                        Aucun logo
                      </span>
                    )}
                  </div>
                </div>

                <form action={logoAction} className="space-y-3">
                  {logoState && !logoState.success ? <Alert variant="warning">{logoState.message}</Alert> : null}
                  <FormField
                    label="Logo de l’entreprise"
                    htmlFor="logo"
                    hint="PNG, JPG ou SVG — 2 Mo maximum. Le SVG est nettoyé avant enregistrement."
                  >
                    <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
                  </FormField>
                  <Button type="submit" variant="outline" loading={logoPending} loadingText="Téléversement…">
                    Téléverser le logo
                  </Button>
                </form>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preview-primary">Couleur principale</Label>
                  <div className="flex items-center gap-3">
                    <span className="size-10 rounded-xl border border-border" style={{ backgroundColor: data.settings.brandColor }} aria-hidden />
                    <div className="text-sm">
                      <p className="font-medium">Couleur de vos documents</p>
                      <p className="text-xs text-muted-foreground">
                        Utilisée dans le modèle « {QUOTATION_TEMPLATES.find((t) => t.key === data.settings.defaultTemplateKey)?.name} ».
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Couleur secondaire</Label>
                  <div className="flex items-center gap-3">
                    <span
                      className="size-10 rounded-xl border border-border"
                      style={{ backgroundColor: data.settings.brandColorSecondary }}
                      aria-hidden
                    />
                    <p className="text-xs text-muted-foreground">
                      Couleur des titres et des blocs d’en-tête. Personnalisable plus finement dans « Mon entreprise ».
                    </p>
                  </div>
                </div>
              </div>

              <Alert variant="info" title="Et ensuite ?">
                Vous pourrez modifier le logo, les couleurs, les modèles et les mentions légales à tout moment depuis
                « Mon entreprise » et « Modèles de devis ».
              </Alert>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" aria-hidden /> Retour
                </Button>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    loading={finishing}
                    onClick={() => {
                      setFinishing(true);
                      void completeOnboardingAction();
                    }}
                  >
                    Plus tard
                  </Button>
                  <Button
                    type="button"
                    variant="gradient"
                    size="lg"
                    loading={finishing}
                    loadingText="Préparation…"
                    onClick={() => {
                      setFinishing(true);
                      void completeOnboardingAction();
                    }}
                  >
                    <Rocket className="size-4" aria-hidden />
                    Accéder à mon tableau de bord
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Astuce : vous pouvez quitter cet assistant à tout moment, vos réponses déjà enregistrées sont conservées.
      </p>
    </div>
  );
}
