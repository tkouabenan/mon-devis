'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, Upload } from 'lucide-react';
import { createCustomerAction, importCustomersAction, updateCustomerAction } from '@/app/actions/customers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/overlay';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/display';
import { COUNTRIES } from '@/lib/constants';

export interface CustomerFormValues {
  id?: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  countryCode: string;
  taxId: string | null;
  notes: string | null;
}

const EMPTY: CustomerFormValues = {
  type: 'COMPANY',
  name: '',
  companyName: null,
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  postalCode: null,
  city: null,
  country: "Côte d'Ivoire",
  countryCode: 'CI',
  taxId: null,
  notes: null,
};

/**
 * Formulaire client (création / modification) dans une fenêtre modale.
 * Validation Zod côté serveur ; les messages d'erreur sont affichés champ par champ.
 */
export function CustomerFormDialog({
  customer,
  trigger,
  defaultOpen = false,
}: {
  customer?: CustomerFormValues;
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(customer?.id);
  const [open, setOpen] = React.useState(defaultOpen);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [type, setType] = React.useState<'INDIVIDUAL' | 'COMPANY'>(customer?.type ?? 'COMPANY');
  const [countryCode, setCountryCode] = React.useState(customer?.countryCode ?? 'CI');

  const submit = async (formData: FormData) => {
    setPending(true);
    setErrors({});
    try {
      const result = editing
        ? await updateCustomerAction(undefined, formData)
        : await createCustomerAction(undefined, formData);
      if (!result.success) {
        setErrors(result.errors ?? {});
        toast.error(result.message ?? 'Enregistrement impossible.');
        return;
      }
      toast.success(result.message ?? 'Client enregistré.');
      setOpen(false);
      router.refresh();
      const id = (result.data as { id?: string } | undefined)?.id;
      if (!editing && id) router.push(`/clients/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" aria-hidden />
            Nouveau client
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
          <DialogDescription>
            Ces informations apparaissent sur les devis et factures. Seul le nom est obligatoire.
          </DialogDescription>
        </DialogHeader>

        {Object.keys(errors).length > 0 ? (
          <Alert variant="danger" title="Vérifiez le formulaire">
            <ul className="list-inside list-disc space-y-0.5 text-sm">
              {Object.entries(errors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          {customer?.id ? <input type="hidden" name="id" value={customer.id} /> : null}
          <input type="hidden" name="countryCode" value={countryCode} />
          <input type="hidden" name="country" value={COUNTRIES.find((country) => country.code === countryCode)?.name ?? "Côte d'Ivoire"} />

          <div className="space-y-1.5">
            <Label htmlFor="customer-type">Type de client</Label>
            <Select
              id="customer-type"
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value as 'INDIVIDUAL' | 'COMPANY')}
            >
              <option value="COMPANY">Entreprise</option>
              <option value="INDIVIDUAL">Particulier</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-name">{type === 'COMPANY' ? 'Nom du contact' : 'Nom complet'}</Label>
            <Input id="customer-name" name="name" defaultValue={customer?.name ?? ''} required maxLength={160} />
            <FieldError message={errors.name} />
          </div>

          {type === 'COMPANY' ? (
            <div className="space-y-1.5">
              <Label htmlFor="customer-company">Raison sociale</Label>
              <Input id="customer-company" name="companyName" defaultValue={customer?.companyName ?? ''} maxLength={160} />
              <FieldError message={errors.companyName} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="customer-email">E-mail</Label>
            <Input id="customer-email" name="email" type="email" defaultValue={customer?.email ?? ''} />
            <FieldError message={errors.email} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Téléphone</Label>
            <Input id="customer-phone" name="phone" defaultValue={customer?.phone ?? ''} placeholder="+225 07 00 00 00 00" />
            <FieldError message={errors.phone} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="customer-address">Adresse</Label>
            <Input id="customer-address" name="addressLine1" defaultValue={customer?.addressLine1 ?? ''} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-postal">Code postal</Label>
            <Input id="customer-postal" name="postalCode" defaultValue={customer?.postalCode ?? ''} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-city">Ville</Label>
            <Input id="customer-city" name="city" defaultValue={customer?.city ?? ''} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-country">Pays</Label>
            <Select
              id="customer-country"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
            >
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-tax">N° fiscal / RCCM</Label>
            <Input id="customer-tax" name="taxId" defaultValue={customer?.taxId ?? ''} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="customer-notes">Notes internes</Label>
            <Textarea id="customer-notes" name="notes" rows={3} defaultValue={customer?.notes ?? ''} />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Enregistrer' : 'Créer le client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton d'édition d'un client (ouvre la modale pré-remplie). */
export function EditCustomerButton({ customer }: { customer: CustomerFormValues }) {
  return (
    <CustomerFormDialog
      customer={customer}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-4" aria-hidden />
          Modifier
        </Button>
      }
    />
  );
}

/** Import CSV de clients (mêmes colonnes que l'export). */
export function ImportCustomersDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [summary, setSummary] = React.useState<{ created: number; skipped: number; message?: string } | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" aria-hidden />
          Importer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer des clients (CSV)</DialogTitle>
          <DialogDescription>
            Fichier UTF-8 séparé par des virgules ou des points-virgules. Colonnes reconnues : nom, société, e-mail,
            téléphone, adresse, ville, code postal, pays, n° fiscal, notes.
          </DialogDescription>
        </DialogHeader>

        <form
          action={async (formData: FormData) => {
            setPending(true);
            setSummary(null);
            try {
              const result = await importCustomersAction(undefined, formData);
              if (!result.success) {
                toast.error(result.message ?? 'Import impossible.');
                setSummary({ created: 0, skipped: 0, message: result.message });
                return;
              }
              setSummary({ created: result.data?.created ?? 0, skipped: result.data?.skipped ?? 0 });
              toast.success(result.message ?? 'Import terminé.');
              router.refresh();
            } finally {
              setPending(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="customer-file">Fichier CSV</Label>
            <Input id="customer-file" name="file" type="file" accept=".csv,text/csv" required />
          </div>

          {summary ? (
            <Alert variant={summary.created > 0 ? 'success' : 'warning'}>
              {summary.created} client(s) importé(s), {summary.skipped} ligne(s) ignorée(s).
              {summary.message ? ` ${summary.message}` : ''}
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button type="submit" loading={pending}>
              Lancer l’import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
