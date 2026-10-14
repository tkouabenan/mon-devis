'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Eye,
  Loader2,
  Lock,
  Save,
  Send,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  autosaveQuotationAction,
  saveQuotationAction,
  sendQuotationAction,
} from '@/app/actions/quotations';
import type { ActionResult } from '@/app/actions/auth';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, SwitchRow, Textarea } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from '@/components/ui/overlay';
import {
  ItemsEditor,
  computeEditorTotals,
  itemsToPayload,
  newEditorItem,
  payloadToItems,
  type EditorItem,
  type EditorProduct,
} from '@/components/documents/items-editor';
import { DocumentPreview, type PreviewCompany, type PreviewCustomer } from '@/components/quotes/document-preview';
import { getTemplate, mergeTemplateStyle, QUOTATION_TEMPLATES, type TemplateCustomization } from '@/lib/templates';
import { QUOTATION_STATUSES, TERMS_PRESETS } from '@/lib/constants';
import { CURRENCIES } from '@/lib/currency';
import { cn, daysUntil } from '@/lib/utils';

/**
 * Générateur de devis : formulaire à gauche, aperçu temps réel à droite.
 *
 * - les totaux affichés proviennent du moteur de calcul partagé,
 * - le brouillon est enregistré automatiquement (sauvegarde différée),
 * - la sortie de page avec des modifications non enregistrées déclenche une alerte.
 */

export interface BuilderCustomer {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string;
  taxId: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
}

export interface BuilderQuotation {
  id: string;
  number: string;
  status: string;
  title: string;
  customerId: string | null;
  reference: string | null;
  customerReference: string | null;
  currency: string;
  issueDate: string;
  validUntil: string | null;
  templateKey: string;
  customization: TemplateCustomization | null;
  pricesIncludeTax: boolean;
  globalDiscountType: '' | 'PERCENTAGE' | 'FIXED';
  globalDiscountValue: string;
  depositAmount: string;
  notes: string;
  internalNotes: string;
  terms: Record<string, string | null | undefined>;
  items: Parameters<typeof payloadToItems>[0];
}

export function QuotationBuilder({
  mode,
  quotation,
  customers,
  products,
  company,
  settings,
  nextNumberPreview,
  watermark,
  canUsePremiumTemplates,
  canShare,
  defaultCustomerId,
}: {
  mode: 'create' | 'edit';
  /** Client pré-sélectionné (ex. depuis la fiche client). */
  defaultCustomerId?: string | null;
  quotation?: BuilderQuotation;
  customers: BuilderCustomer[];
  products: EditorProduct[];
  company: PreviewCompany | null;
  settings: {
    defaultCurrency: string;
    defaultTaxRate: number;
    defaultValidityDays: number;
    defaultTemplateKey: string;
    defaultPaymentTerms: string | null;
    defaultTerms: string | null;
    defaultNotes: string | null;
  };
  nextNumberPreview: string;
  watermark: boolean;
  canUsePremiumTemplates: boolean;
  canShare: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<ActionResult<{ id: string }> | undefined, FormData>(
    saveQuotationAction,
    undefined,
  );

  const [quotationId, setQuotationId] = React.useState(quotation?.id ?? null);
  const [number, setNumber] = React.useState(quotation?.number ?? nextNumberPreview);
  const [status, setStatus] = React.useState(quotation?.status ?? 'DRAFT');
  const [title, setTitle] = React.useState(quotation?.title ?? '');
  const [customerId, setCustomerId] = React.useState(quotation?.customerId ?? defaultCustomerId ?? '');
  const [customerReference, setCustomerReference] = React.useState(quotation?.customerReference ?? '');
  const [reference, setReference] = React.useState(quotation?.reference ?? '');
  const [currency, setCurrency] = React.useState(quotation?.currency ?? settings.defaultCurrency);
  const [issueDate, setIssueDate] = React.useState(
    (quotation?.issueDate ?? new Date().toISOString()).slice(0, 10),
  );
  const [validUntil, setValidUntil] = React.useState(
    (quotation?.validUntil ?? new Date(Date.now() + settings.defaultValidityDays * 86400000).toISOString()).slice(0, 10),
  );
  const [templateKey, setTemplateKey] = React.useState(quotation?.templateKey ?? settings.defaultTemplateKey);
  const [pricesIncludeTax, setPricesIncludeTax] = React.useState(quotation?.pricesIncludeTax ?? false);
  const [globalDiscountType, setGlobalDiscountType] = React.useState<'' | 'PERCENTAGE' | 'FIXED'>(
    quotation?.globalDiscountType ?? '',
  );
  const [globalDiscountValue, setGlobalDiscountValue] = React.useState(
    quotation && Number(quotation.globalDiscountValue) > 0 ? String(quotation.globalDiscountValue) : '',
  );
  const [depositAmount, setDepositAmount] = React.useState(
    quotation && Number(quotation.depositAmount) > 0 ? String(quotation.depositAmount) : '',
  );
  const [notes, setNotes] = React.useState(quotation?.notes ?? settings.defaultNotes ?? '');
  const [internalNotes, setInternalNotes] = React.useState(quotation?.internalNotes ?? '');
  const [terms, setTerms] = React.useState<Record<string, string>>({
    validityPeriod:
      quotation?.terms?.validityPeriod ?? `Ce devis est valable ${settings.defaultValidityDays} jours à compter de sa date d’émission.`,
    paymentTerms: quotation?.terms?.paymentTerms ?? settings.defaultPaymentTerms ?? '',
    deliveryTime: quotation?.terms?.deliveryTime ?? '',
    warranty: quotation?.terms?.warranty ?? settings.defaultTerms ?? '',
    specialConditions: quotation?.terms?.specialConditions ?? '',
    paymentInstructions: quotation?.terms?.paymentInstructions ?? '',
    legalMentions: quotation?.terms?.legalMentions ?? '',
  });
  const [items, setItems] = React.useState<EditorItem[]>(
    quotation ? payloadToItems(quotation.items) : [newEditorItem({ taxRate: String(settings.defaultTaxRate) })],
  );
  const [dirty, setDirty] = React.useState(false);
  const [autosaving, setAutosaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [showPreviewMobile, setShowPreviewMobile] = React.useState(false);

  const customization = quotation?.customization ?? null;
  const style = React.useMemo(() => mergeTemplateStyle(templateKey, customization), [templateKey, customization]);
  const totals = React.useMemo(
    () => computeEditorTotals(items, { globalDiscountType, globalDiscountValue, pricesIncludeTax, depositAmount }),
    [items, globalDiscountType, globalDiscountValue, pricesIncludeTax, depositAmount],
  );

  const customer = customers.find((entry) => entry.id === customerId) ?? null;
  const previewCustomer: PreviewCustomer | null = customer
    ? {
        name: customer.name,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
        addressLine1: customer.addressLine1 ?? null,
        postalCode: customer.postalCode ?? null,
        city: customer.city,
        country: customer.country,
        taxId: customer.taxId,
      }
    : null;

  const markDirty = () => setDirty(true);

  /* --------------------------- Sauvegarde automatique --------------------------- */

  const buildFormData = React.useCallback(
    (extra: Record<string, string>) => {
      const data = new FormData();
      if (quotationId) data.set('id', quotationId);
      data.set('title', title || 'Devis');
      data.set('customerId', customerId);
      data.set('customerReference', customerReference);
      data.set('reference', reference);
      data.set('currency', currency);
      data.set('issueDate', issueDate);
      data.set('validUntil', validUntil);
      data.set('templateKey', templateKey);
      if (pricesIncludeTax) data.set('pricesIncludeTax', 'on');
      data.set('globalDiscountType', globalDiscountType);
      data.set('globalDiscountValue', globalDiscountValue || '0');
      data.set('depositAmount', depositAmount || '0');
      data.set('notes', notes);
      data.set('internalNotes', internalNotes);
      Object.entries(terms).forEach(([key, value]) => data.set(key, value ?? ''));
      data.set('items', JSON.stringify(itemsToPayload(items)));
      Object.entries(extra).forEach(([key, value]) => data.set(key, value));
      return data;
    },
    [
      quotationId,
      title,
      customerId,
      customerReference,
      reference,
      currency,
      issueDate,
      validUntil,
      templateKey,
      pricesIncludeTax,
      globalDiscountType,
      globalDiscountValue,
      depositAmount,
      notes,
      internalNotes,
      terms,
      items,
    ],
  );

  React.useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(async () => {
      setAutosaving(true);
      try {
        const result = await autosaveQuotationAction(undefined, buildFormData({ intent: 'draft' }));
        if (result.success && result.data) {
          setQuotationId(result.data.id);
          setLastSavedAt(new Date(result.data.savedAt));
          setDirty(false);
          if (!quotationId) {
            window.history.replaceState(null, '', `/devis/${result.data.id}/modifier`);
            router.refresh();
          }
        } else if (result.message && !result.errors) {
          toast.error(result.message);
        }
      } catch {
        // La sauvegarde manuelle reste disponible : on n'interrompt pas la saisie.
      } finally {
        setAutosaving(false);
      }
    }, 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, buildFormData]);

  React.useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  React.useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(state.message ?? 'Devis enregistré.');
      if (state.data?.id) {
        setQuotationId(state.data.id);
        setDirty(false);
        router.refresh();
      }
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, router]);

  const selectedTemplate = getTemplate(templateKey);
  const templateLocked = selectedTemplate.premium && !canUsePremiumTemplates;
  const validUntilDays = daysUntil(validUntil);
  const hasItems = items.some((item) => item.name.trim() && Number(item.unitPrice) > 0);

  const applyTermsPreset = (presetId: string) => {
    const preset = TERMS_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    if (preset.id.startsWith('validity')) {
      setTerms((current) => ({ ...current, validityPeriod: preset.content }));
    } else if (preset.id.startsWith('payment')) {
      setTerms((current) => ({ ...current, paymentTerms: preset.content }));
    } else if (preset.id.startsWith('delivery')) {
      setTerms((current) => ({ ...current, deliveryTime: preset.content }));
    } else if (preset.id.startsWith('warranty')) {
      setTerms((current) => ({ ...current, warranty: preset.content }));
    } else {
      setTerms((current) => ({ ...current, legalMentions: preset.content }));
    }
    markDirty();
    toast.success('Bloc de conditions ajouté.');
  };

  return (
    <div className="space-y-6">
      {/* Barre d'état */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {mode === 'create' ? 'Nouveau devis' : `Modifier le devis ${number}`}
          </h1>
          <Badge variant="outline">{QUOTATION_STATUSES[status as keyof typeof QUOTATION_STATUSES]?.label ?? status}</Badge>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {autosaving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Sauvegarde…
              </>
            ) : dirty ? (
              <>
                <CloudOff className="size-3.5" aria-hidden /> Modifications non enregistrées
              </>
            ) : lastSavedAt ? (
              <>
                <Cloud className="size-3.5" aria-hidden /> Brouillon enregistré à{' '}
                {lastSavedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : (
              <>
                <Cloud className="size-3.5" aria-hidden /> Sauvegarde automatique activée
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowPreviewMobile((open) => !open)}>
            <Eye className="size-4" aria-hidden />
            {showPreviewMobile ? 'Masquer l’aperçu' : 'Aperçu'}
          </Button>
          {quotationId ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/devis/${quotationId}`}>Voir la fiche</Link>
              </Button>
              {canShare ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (dirty) {
                      const saved = await autosaveQuotationAction(undefined, buildFormData({ intent: 'draft' }));
                      if (!saved.success) {
                        toast.error(saved.message ?? 'Enregistrez le devis avant de l’envoyer.');
                        return;
                      }
                      setDirty(false);
                    }
                    const result = await sendQuotationAction(quotationId);
                    if (result.success) toast.success(result.message ?? 'Devis envoyé.');
                    else toast.error(result.message ?? 'Envoi impossible.');
                    router.refresh();
                  }}
                >
                  <Send className="size-4" aria-hidden />
                  Envoyer
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {state?.message && !state.success ? (
        <Alert variant="danger" icon={<AlertCircle className="size-4" />}>
          {state.message}
        </Alert>
      ) : null}

      {templateLocked ? (
        <Alert variant="warning" icon={<Lock className="size-4" />} title="Modèle réservé aux formules payantes">
          Le modèle « {selectedTemplate.name} » est disponible à partir du plan Pro.{' '}
          <Link href="/abonnement" className="font-medium underline underline-offset-4">
            Comparer les formules
          </Link>
        </Alert>
      ) : null}

      <form action={formAction} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        {/* Champs cachés transmis au serveur (les lignes sont sérialisées en JSON). */}
        <input type="hidden" name="items" value={JSON.stringify(itemsToPayload(items))} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="globalDiscountType" value={globalDiscountType} />
        <input type="hidden" name="templateKey" value={templateKey} />
        <input type="hidden" name="intent" value="draft" />
        {quotationId ? <input type="hidden" name="id" value={quotationId} /> : null}

        {/* ------------------------------ Colonne formulaire ------------------------------ */}
        <div className={cn('space-y-6', showPreviewMobile ? 'hidden lg:block' : undefined)}>
          <Card>
            <CardHeader>
              <CardTitle>Informations du devis</CardTitle>
              <CardDescription>
                Numéro attribué automatiquement : <strong className="text-foreground">{number}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="title">Intitulé du projet *</Label>
                  <Input
                    id="title"
                    name="title"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      markDirty();
                    }}
                    placeholder="Rénovation complète villa duplex"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="customer">Client *</Label>
                  <Select
                    id="customer"
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value);
                      markDirty();
                    }}
                  >
                    <option value="">— Sélectionner un client —</option>
                    {customers.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.companyName ? `${entry.companyName} (${entry.name})` : entry.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Client absent ?{' '}
                    <Link href="/clients?nouveau=1" className="text-primary hover:underline">
                      Créer une fiche client
                    </Link>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="currency">Devise</Label>
                  <Select
                    id="currency"
                    value={currency}
                    onChange={(event) => {
                      setCurrency(event.target.value);
                      markDirty();
                    }}
                  >
                    {CURRENCIES.map((definition) => (
                      <option key={definition.code} value={definition.code}>
                        {definition.code} — {definition.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="issueDate">Date d’émission</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={issueDate}
                    onChange={(event) => {
                      setIssueDate(event.target.value);
                      markDirty();
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="validUntil">Date de validité</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(event) => {
                      setValidUntil(event.target.value);
                      markDirty();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {validUntilDays === null
                      ? ''
                      : validUntilDays >= 0
                        ? `Valable encore ${validUntilDays} jour(s).`
                        : `Date déjà dépassée (${Math.abs(validUntilDays)} jour(s)).`}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reference">Référence interne</Label>
                  <Input
                    id="reference"
                    value={reference}
                    onChange={(event) => {
                      setReference(event.target.value);
                      markDirty();
                    }}
                    placeholder="Chantier Cocody — phase 2"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="customerReference">Référence client</Label>
                  <Input
                    id="customerReference"
                    value={customerReference}
                    onChange={(event) => {
                      setCustomerReference(event.target.value);
                      markDirty();
                    }}
                    placeholder="Bon de commande n° 4471"
                  />
                </div>
              </div>

              <SwitchRow
                label="Mes prix sont saisis taxes comprises (TTC)"
                description="Les totaux HT, la TVA et le total TTC sont recalculés automatiquement dans ce mode."
                checked={pricesIncludeTax}
                onCheckedChange={(checked) => {
                  setPricesIncludeTax(checked);
                  markDirty();
                }}
              />
            </CardContent>
          </Card>

          {/* Lignes */}
          <Card>
            <CardContent className="pt-5">
              <ItemsEditor
                items={items}
                onChange={(next) => {
                  setItems(next);
                  markDirty();
                }}
                products={products}
                currency={currency}
                pricesIncludeTax={pricesIncludeTax}
                onPricesIncludeTaxChange={(value) => {
                  setPricesIncludeTax(value);
                  markDirty();
                }}
                globalDiscountType={globalDiscountType}
                globalDiscountValue={globalDiscountValue}
                onGlobalDiscountChange={(type, value) => {
                  setGlobalDiscountType(value ? type : '');
                  setGlobalDiscountValue(value);
                  markDirty();
                }}
                depositAmount={depositAmount}
                onDepositChange={(value) => {
                  setDepositAmount(value);
                  markDirty();
                }}
                showDeposit
                defaultTaxRate={settings.defaultTaxRate}
              />
            </CardContent>
          </Card>

          {/* Conditions et personnalisation */}
          <Card>
            <CardHeader>
              <CardTitle>Conditions, notes et présentation</CardTitle>
              <CardDescription>Ces mentions apparaissent sur le document et dans les exports.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="conditions">
                <TabsList>
                  <TabsTrigger value="conditions">Conditions</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="presentation">Présentation</TabsTrigger>
                </TabsList>

                <TabsContent value="conditions" className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {TERMS_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => applyTermsPreset(preset.id)}
                      >
                        <Wand2 className="size-3.5" aria-hidden />
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  {[
                    { key: 'validityPeriod', label: 'Validité du devis', rows: 2 },
                    { key: 'paymentTerms', label: 'Conditions de paiement', rows: 2 },
                    { key: 'deliveryTime', label: 'Délai de livraison / exécution', rows: 2 },
                    { key: 'warranty', label: 'Garantie', rows: 2 },
                    { key: 'specialConditions', label: 'Conditions particulières', rows: 3 },
                    { key: 'paymentInstructions', label: 'Modalités de règlement (RIB, mobile money…)', rows: 3 },
                    { key: 'legalMentions', label: 'Mentions légales', rows: 3 },
                  ].map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={field.key}>{field.label}</Label>
                      <Textarea
                        id={field.key}
                        rows={field.rows}
                        value={terms[field.key] ?? ''}
                        onChange={(event) => {
                          setTerms((current) => ({ ...current, [field.key]: event.target.value }));
                          markDirty();
                        }}
                      />
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="notes" className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Notes visibles par le client</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        markDirty();
                      }}
                      placeholder="Merci de nous retourner ce devis signé avec la mention « Bon pour accord »."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="internalNotes">Notes internes (jamais imprimées)</Label>
                    <Textarea
                      id="internalNotes"
                      rows={3}
                      value={internalNotes}
                      onChange={(event) => {
                        setInternalNotes(event.target.value);
                        markDirty();
                      }}
                      placeholder="Marge prévue : 18 %. Relancer le client si pas de réponse sous 10 jours."
                    />
                  </div>
                </TabsContent>

                <TabsContent value="presentation" className="space-y-4 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {QUOTATION_TEMPLATES.map((template) => {
                      const locked = template.premium && !canUsePremiumTemplates;
                      const active = template.key === templateKey;
                      return (
                        <button
                          key={template.key}
                          type="button"
                          onClick={() => {
                            if (locked) {
                              toast.error('Ce modèle est réservé aux formules Pro et Business.');
                              return;
                            }
                            setTemplateKey(template.key);
                            markDirty();
                          }}
                          className={cn(
                            'flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors',
                            active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40',
                            locked && 'opacity-70',
                          )}
                          aria-pressed={active}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{template.name}</span>
                            {locked ? (
                              <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                            ) : active ? (
                              <CheckCircle2 className="size-4 text-primary" aria-hidden />
                            ) : null}
                          </div>
                          <span className="flex gap-1" aria-hidden>
                            {[template.colors.primary, template.colors.secondary, template.colors.accent].map((color) => (
                              <span key={color} className="size-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                            ))}
                          </span>
                          <span className="text-xs text-muted-foreground">{template.description}</span>
                          <span className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Sparkles className="size-3" aria-hidden />
                            {template.category}
                            {template.badge ? ` · ${template.badge}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Les couleurs de marque et la typographie de votre entreprise sont appliquées automatiquement. Elles se règlent dans{' '}
                    <Link href="/parametres" className="text-primary hover:underline">
                      Paramètres → Identité visuelle
                    </Link>
                    .
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-elevated backdrop-blur">
            <Button
              type="submit"
              loading={pending}
              onClick={() => {
                setDirty(false);
              }}
            >
              <Save className="size-4" aria-hidden />
              {mode === 'create' ? 'Créer le devis' : 'Enregistrer'}
            </Button>
            <Tooltip content={canShare ? 'Enregistre puis envoie le devis au client' : 'Réservé aux formules payantes'}>
              <Button
                type="submit"
                variant="outline"
                name="intent"
                value="send"
                disabled={templateLocked || !customerId || !hasItems}
                onClick={() => setDirty(false)}
              >
                <Send className="size-4" aria-hidden />
                Enregistrer et envoyer
              </Button>
            </Tooltip>
            <Button type="button" variant="ghost" asChild>
              <Link href="/devis">Annuler</Link>
            </Button>
            <p className="ml-auto text-xs text-muted-foreground">
              {hasItems ? 'Tous les totaux sont recalculés côté serveur avant enregistrement.' : 'Ajoutez au moins une ligne chiffrée.'}
            </p>
          </div>
        </div>

        {/* ------------------------------ Colonne aperçu ------------------------------ */}
        <div className={cn('space-y-3', !showPreviewMobile && 'hidden xl:block')}>
          <div className="flex items-center justify-between">
            <p className="label-caps">Aperçu temps réel</p>
            <Badge variant="outline">{selectedTemplate.name}</Badge>
          </div>
          <div className="xl:sticky xl:top-24">
            <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-xl bg-muted/40 p-3">
              <DocumentPreview
                kind="QUOTATION"
                company={company}
                customer={previewCustomer}
                items={items}
                totals={totals}
                style={style}
                currency={currency}
                number={number}
                title={title}
                statusLabel={QUOTATION_STATUSES[status as keyof typeof QUOTATION_STATUSES]?.label ?? status}
                issueDate={issueDate}
                validUntil={validUntil}
                validityLabel="Valable jusqu’au"
                terms={terms}
                notes={notes}
                watermark={watermark}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Les exports PDF, Word et Excel reprennent exactement cette mise en page et ces montants.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
