'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarClock, Save, Send, UserPlus } from 'lucide-react';
import { createInvoiceAction, sendInvoiceAction } from '@/app/actions/invoices';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display';
import { FieldError, Input, Label, Select, SwitchRow, Textarea } from '@/components/ui/form';
import { Tabs, TabsList, TabsTrigger, Tooltip } from '@/components/ui/overlay';
import { ItemsEditor, computeEditorTotals, itemsToPayload, newEditorItem, type EditorItem, type EditorProduct } from '@/components/documents/items-editor';
import { DocumentPreview, type PreviewCompany, type PreviewCustomer } from '@/components/quotes/document-preview';
import { CURRENCIES } from '@/lib/currency';
import { QUOTATION_TEMPLATES, mergeTemplateStyle } from '@/lib/templates';
import { TERMS_PRESETS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface InvoiceBuilderCustomer extends PreviewCustomer {
  id: string;
}

export interface InvoiceBuilderQuotation {
  id: string;
  number: string;
  title: string;
  customerId: string | null;
  customerReference: string | null;
  currency: string;
  issueDate: string;
  validUntil: string | null;
  templateKey: string;
  pricesIncludeTax: boolean;
  globalDiscountType: '' | 'PERCENTAGE' | 'FIXED';
  globalDiscountValue: string;
  notes: string;
  terms: Record<string, string | null | undefined>;
}

/**
 * Formulaire de création de facture (saisie libre), avec aperçu temps réel.
 *
 * La conversion d'un devis accepté passe par `convertAndOpenInvoiceAction`
 * (le devis est copié côté serveur, avec ses propres totaux) ; ce formulaire
 * sert aux factures créées de zéro, par exemple un acompte ou une prestation
 * ponctuelle sans devis préalable.
 */
export function InvoiceBuilder({
  customers,
  products,
  company,
  settings,
  watermark,
  defaultQuotation,
}: {
  customers: InvoiceBuilderCustomer[];
  products: EditorProduct[];
  company: PreviewCompany | null;
  settings: {
    defaultCurrency: string;
    defaultTaxRate: number;
    defaultTemplateKey: string;
    defaultPaymentTerms: string | null;
    defaultTerms: string | null;
  };
  watermark: boolean;
  defaultQuotation?: InvoiceBuilderQuotation | null;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const defaultDue = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [customerId, setCustomerId] = React.useState(defaultQuotation?.customerId ?? '');
  const [title, setTitle] = React.useState(defaultQuotation?.title ?? 'Prestation de services');
  const [currency, setCurrency] = React.useState(defaultQuotation?.currency ?? settings.defaultCurrency);
  const [issueDate, setIssueDate] = React.useState(defaultQuotation?.issueDate?.slice(0, 10) ?? today);
  const [dueDate, setDueDate] = React.useState(defaultDue);
  const [customerReference, setCustomerReference] = React.useState(defaultQuotation?.customerReference ?? '');
  const [templateKey, setTemplateKey] = React.useState(defaultQuotation?.templateKey ?? settings.defaultTemplateKey);
  const [pricesIncludeTax, setPricesIncludeTax] = React.useState(defaultQuotation?.pricesIncludeTax ?? false);
  const [globalDiscountType, setGlobalDiscountType] = React.useState<'' | 'PERCENTAGE' | 'FIXED'>(
    defaultQuotation?.globalDiscountType ?? '',
  );
  const [globalDiscountValue, setGlobalDiscountValue] = React.useState(defaultQuotation?.globalDiscountValue ?? '');
  const [paymentTerms, setPaymentTerms] = React.useState(
    defaultQuotation?.terms?.paymentTerms ?? settings.defaultPaymentTerms ?? 'Paiement à 30 jours date de facture.',
  );
  const [paymentInstructions, setPaymentInstructions] = React.useState(defaultQuotation?.terms?.paymentInstructions ?? '');
  const [legalMentions, setLegalMentions] = React.useState(defaultQuotation?.terms?.legalMentions ?? settings.defaultTerms ?? '');
  const [notes, setNotes] = React.useState(defaultQuotation?.notes ?? '');
  const [items, setItems] = React.useState<EditorItem[]>(() => [newEditorItem({ name: 'Prestation', quantity: '1' })]);
  const [tab, setTab] = React.useState('lines');
  const [showPreview, setShowPreview] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<'draft' | 'send' | null>(null);

  const customer = customers.find((entry) => entry.id === customerId) ?? null;
  const totals = computeEditorTotals(items, { globalDiscountType, globalDiscountValue, pricesIncludeTax });
  const style = mergeTemplateStyle(templateKey, null);

  const buildFormData = (extra: Record<string, string> = {}) => {
    const formData = new FormData();
    formData.set('title', title.trim() || 'Facture');
    formData.set('customerId', customerId);
    formData.set('reference', '');
    formData.set('customerReference', customerReference);
    formData.set('currency', currency);
    formData.set('issueDate', issueDate);
    formData.set('dueDate', dueDate);
    formData.set('templateKey', templateKey);
    if (pricesIncludeTax) formData.set('pricesIncludeTax', 'on');
    formData.set('globalDiscountType', globalDiscountType);
    formData.set('globalDiscountValue', globalDiscountValue || '0');
    formData.set('notes', notes);
    formData.set('paymentTerms', paymentTerms);
    formData.set('paymentInstructions', paymentInstructions);
    formData.set('legalMentions', legalMentions);
    formData.set('items', JSON.stringify(itemsToPayload(items)));
    Object.entries(extra).forEach(([key, value]) => formData.set(key, value));
    return formData;
  };

  const submit = async (intent: 'draft' | 'send') => {
    if (items.every((item) => !item.name.trim())) {
      setTab('lines');
      toast.error('Ajoutez au moins une ligne à la facture.');
      return;
    }
    setPending(intent);
    setErrors({});
    try {
      const result = await createInvoiceAction(undefined, buildFormData());
      if (!result.success) {
        setErrors(result.errors ?? {});
        toast.error(result.message ?? 'Création impossible.');
        return;
      }
      const invoiceId = result.data?.id;
      if (!invoiceId) {
        toast.error('Facture créée mais identifiant introuvable. Consultez la liste des factures.');
        return;
      }
      if (intent === 'send') {
        const sent = await sendInvoiceAction(invoiceId);
        if (sent.success) {
          toast.success(sent.message ?? 'Facture enregistrée et transmise au client.');
        } else {
          toast.warning(sent.message ?? 'Facture enregistrée, mais l’envoi a échoué.');
        }
      } else {
        toast.success(result.message ?? 'Facture enregistrée.');
      }
      router.push(`/factures/${invoiceId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Nouvelle facture</h1>
          <p className="text-sm text-muted-foreground">
            Numéro attribué automatiquement à l’enregistrement · facture indépendante du devis d’origine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowPreview((value) => !value)}>
            {showPreview ? 'Masquer l’aperçu' : 'Voir l’aperçu'}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/factures">Annuler</Link>
          </Button>
          <Button variant="outline" loading={pending === 'draft'} onClick={() => void submit('draft')}>
            <Save className="size-4" aria-hidden />
            Enregistrer le brouillon
          </Button>
          <Button loading={pending === 'send'} onClick={() => void submit('send')} disabled={!customer?.email}>
            <Send className="size-4" aria-hidden />
            Enregistrer et envoyer
          </Button>
        </div>
      </div>

      {defaultQuotation ? (
        <Alert variant="info" title={`Pré-remplie depuis le devis ${defaultQuotation.number}`}>
          Les valeurs du devis ont été copiées dans ce formulaire. À l’enregistrement, la facture conserve ses propres données : les
          modifications ultérieures du devis ne l’affecteront pas.
        </Alert>
      ) : null}

      {!customer?.email ? (
        <Alert variant="warning">
          Sélectionnez un client disposant d’une adresse e-mail pour pouvoir envoyer la facture directement depuis MON DEVIS.
        </Alert>
      ) : null}

      {Object.keys(errors).length > 0 ? (
        <Alert variant="danger" title="Vérifiez le formulaire">
          <ul className="list-inside list-disc space-y-0.5 text-sm">
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className={cn('grid gap-6', showPreview ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_420px]')}>
        <div className={cn('space-y-6', showPreview && 'hidden')}>
          <Card>
            <CardHeader>
              <CardTitle>Client et informations générales</CardTitle>
              <CardDescription>Le client est obligatoire pour l’envoi et le suivi des règlements.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="customerId">Client</Label>
                <div className="flex gap-2">
                  <Select id="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                    <option value="">— Aucun client sélectionné —</option>
                    {customers.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.companyName ? `${entry.companyName} (${entry.name})` : entry.name}
                      </option>
                    ))}
                  </Select>
                  <Button variant="outline" asChild>
                    <Link href="/clients/nouveau">
                      <UserPlus className="size-4" aria-hidden />
                      Créer
                    </Link>
                  </Button>
                </div>
                {!customerId ? <p className="text-xs text-muted-foreground">Sans client, la facture reste un brouillon non partageable.</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title">Intitulé</Label>
                <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
                <FieldError message={errors.title} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerReference">Référence client (bon de commande…)</Label>
                <Input
                  id="customerReference"
                  value={customerReference}
                  onChange={(event) => setCustomerReference(event.target.value)}
                  placeholder="BC-2026-014"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issueDate">Date de facture</Label>
                <Input id="issueDate" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                <FieldError message={errors.issueDate} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Échéance</Label>
                <div className="flex items-center gap-2">
                  <Input id="dueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  <Tooltip content="Ajouter 30 jours à la date de facture">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Calculer l’échéance à 30 jours"
                      onClick={() => setDueDate(new Date(new Date(issueDate).getTime() + 30 * 86_400_000).toISOString().slice(0, 10))}
                    >
                      <CalendarClock className="size-4" aria-hidden />
                    </Button>
                  </Tooltip>
                </div>
                <FieldError message={errors.dueDate} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Devise</Label>
                <Select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {CURRENCIES.map((definition) => (
                    <option key={definition.code} value={definition.code}>
                      {definition.code} — {definition.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Modèle de document</Label>
                <Select value={templateKey} disabled>
                  <option value={templateKey}>{QUOTATION_TEMPLATES.find((entry) => entry.key === templateKey)?.name ?? templateKey}</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Le modèle de la facture suit le réglage de votre organisation.
                </p>
              </div>
              <div className="sm:col-span-2">
                <SwitchRow
                  label="Prix saisis taxes comprises"
                  description="Les prix unitaires incluent la TVA ; MON DEVIS reconstitue le HT et la TVA à l’enregistrement."
                  checked={pricesIncludeTax}
                  onCheckedChange={setPricesIncludeTax}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lignes de la facture</CardTitle>
              <CardDescription>
                Ajoutez vos prestations, produits du catalogue ou lignes libres. Totaux recalculés côté serveur.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ItemsEditor
                items={items}
                onChange={setItems}
                products={products}
                currency={currency}
                pricesIncludeTax={pricesIncludeTax}
                onPricesIncludeTaxChange={setPricesIncludeTax}
                globalDiscountType={globalDiscountType}
                globalDiscountValue={globalDiscountValue}
                onGlobalDiscountChange={(type, value) => {
                  setGlobalDiscountType(type);
                  setGlobalDiscountValue(value);
                }}
                defaultTaxRate={settings.defaultTaxRate}
                idPrefix="invoice"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Conditions et mentions</CardTitle>
                  <CardDescription>Reprises telles quelles dans le PDF, le Word et l’Excel.</CardDescription>
                </div>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList>
                    <TabsTrigger value="lines">Règlement</TabsTrigger>
                    <TabsTrigger value="legal">Mentions légales</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {tab === 'lines' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentTerms">Conditions de règlement</Label>
                    <Textarea
                      id="paymentTerms"
                      rows={3}
                      value={paymentTerms}
                      onChange={(event) => setPaymentTerms(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {TERMS_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setPaymentTerms(preset.content)}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentInstructions">Coordonnées bancaires / Mobile Money</Label>
                    <Textarea
                      id="paymentInstructions"
                      rows={3}
                      value={paymentInstructions}
                      onChange={(event) => setPaymentInstructions(event.target.value)}
                      placeholder="IBAN, RIB, Wave, Orange Money…"
                    />
                  </div>
                </>
              ) : null}

              {tab === 'legal' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="legalMentions">Mentions légales et pénalités de retard</Label>
                  <Textarea
                    id="legalMentions"
                    rows={5}
                    value={legalMentions}
                    onChange={(event) => setLegalMentions(event.target.value)}
                  />
                </div>
              ) : null}

              {tab === 'notes' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes visibles par le client</Label>
                  <Textarea id="notes" rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Aperçu */}
        <div className={cn('lg:sticky lg:top-6 lg:h-fit', showPreview ? 'block' : 'hidden lg:block')}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Aperçu temps réel</Badge>
              {watermark ? <Badge variant="warning">Filigrane formule gratuite</Badge> : null}
            </div>
            <span className="text-xs text-muted-foreground">Format A4</span>
          </div>
          <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-xl border border-border bg-slate-100 p-4 dark:bg-slate-900">
            <DocumentPreview
              kind="INVOICE"
              company={company}
              customer={customer}
              items={items.filter((item) => item.name.trim())}
              totals={totals}
              style={style}
              currency={currency}
              number={defaultQuotation ? 'FAC-…' : 'FAC-…'}
              title={title}
              statusLabel="Brouillon"
              issueDate={issueDate}
              validUntil={dueDate}
              validityLabel="Échéance"
              terms={{ paymentTerms, paymentInstructions, legalMentions }}
              notes={notes}
              watermark={watermark}
            />
          </div>
        </div>
      </div>

      {/* Barre d'actions collante */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:pl-[280px]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Total TTC <span className="font-semibold text-foreground">{totals.total.toFixed(0)} {currency}</span> · {items.filter((item) => item.name.trim()).length} ligne(s)
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/factures">Annuler</Link>
            </Button>
            <Button variant="outline" loading={pending === 'draft'} onClick={() => void submit('draft')}>
              Enregistrer le brouillon
            </Button>
            <Button loading={pending === 'send'} onClick={() => void submit('send')} disabled={!customer?.email}>
              Enregistrer et envoyer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
