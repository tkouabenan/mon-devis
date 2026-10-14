'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, Upload } from 'lucide-react';
import { createProductAction, importProductsAction, updateProductAction } from '@/app/actions/products';
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
import { Checkbox, FieldError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/display';
import { DEFAULT_UNITS } from '@/lib/constants';

export interface ProductFormValues {
  id?: string;
  name: string;
  code: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  unitPrice: string;
  currency: string;
  taxRate: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

/** Formulaire produit / service (création et modification). */
export function ProductFormDialog({
  product,
  currencies,
  categories,
  trigger,
}: {
  product?: ProductFormValues;
  currencies: string[];
  categories: string[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const editing = Boolean(product?.id);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [active, setActive] = React.useState((product?.status ?? 'ACTIVE') === 'ACTIVE');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" aria-hidden />
            Nouveau produit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifier le produit' : 'Nouveau produit ou service'}</DialogTitle>
          <DialogDescription>
            Les éléments du catalogue s’ajoutent en un clic dans vos devis et factures, avec l’unité, le prix et la TVA pré-remplis.
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

        <form
          action={async (formData: FormData) => {
            setPending(true);
            setErrors({});
            try {
              const result = editing ? await updateProductAction(undefined, formData) : await createProductAction(undefined, formData);
              if (!result.success) {
                setErrors(result.errors ?? {});
                toast.error(result.message ?? 'Enregistrement impossible.');
                return;
              }
              toast.success(result.message ?? 'Produit enregistré.');
              setOpen(false);
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Enregistrement impossible.');
            } finally {
              setPending(false);
            }
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {product?.id ? <input type="hidden" name="id" value={product.id} /> : null}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="product-name">Nom du produit ou service</Label>
            <Input id="product-name" name="name" defaultValue={product?.name ?? ''} required maxLength={200} />
            <FieldError message={errors.name} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-code">Référence (SKU)</Label>
            <Input id="product-code" name="code" defaultValue={product?.code ?? ''} placeholder="SRV-001" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-category">Catégorie</Label>
            <Input
              id="product-category"
              name="category"
              defaultValue={product?.category ?? ''}
              list="product-categories"
              placeholder="Prestations, Matériaux…"
            />
            <datalist id="product-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-unit">Unité</Label>
            <Select id="product-unit" name="unit" defaultValue={product?.unit ?? 'unité'}>
              {DEFAULT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
            <FieldError message={errors.unit} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-price">Prix unitaire HT</Label>
              <Input
                id="product-price"
                name="unitPrice"
                inputMode="decimal"
                defaultValue={product?.unitPrice ?? ''}
                placeholder="25000"
              />
              <FieldError message={errors.unitPrice} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-currency">Devise</Label>
              <Select id="product-currency" name="currency" defaultValue={product?.currency ?? currencies[0]}>
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-tax">TVA (%)</Label>
            <Input id="product-tax" name="taxRate" inputMode="decimal" defaultValue={product?.taxRate ?? '18'} />
            <FieldError message={errors.taxRate} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="product-description">Description</Label>
            <Textarea id="product-description" name="description" rows={3} defaultValue={product?.description ?? ''} />
          </div>

          <div className="sm:col-span-2">
            <input type="hidden" name="status" value={active ? 'ACTIVE' : 'ARCHIVED'} />
            <label className="flex items-start gap-2.5 rounded-xl border border-border p-3">
              <Checkbox checked={active} onCheckedChange={(value) => setActive(Boolean(value))} className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-medium">Produit actif</span>
                <span className="block text-xs text-muted-foreground">
                  Les éléments inactifs restent dans l’historique mais ne sont plus proposés dans les nouveaux devis.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Enregistrer' : 'Créer le produit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditProductButton({
  product,
  currencies,
  categories,
}: {
  product: ProductFormValues;
  currencies: string[];
  categories: string[];
}) {
  return (
    <ProductFormDialog
      product={product}
      currencies={currencies}
      categories={categories}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-4" aria-hidden />
          Modifier
        </Button>
      }
    />
  );
}

/** Import CSV du catalogue (colonnes identiques à l'export). */
export function ImportProductsDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [summary, setSummary] = React.useState<{ created: number; updated: number; skipped: number; message?: string } | null>(null);

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
          <DialogTitle>Importer des produits (CSV)</DialogTitle>
          <DialogDescription>
            Réutilisez votre catalogue existant. Téléchargez le{' '}
            <a href="/api/produits/export?modele=1" className="text-primary underline underline-offset-4" download>
              modèle CSV
            </a>{' '}
            pour connaître les colonnes attendues.
          </DialogDescription>
        </DialogHeader>

        <form
          action={async (formData: FormData) => {
            setPending(true);
            setSummary(null);
            try {
              const result = await importProductsAction(undefined, formData);
              if (!result.success) {
                toast.error(result.message ?? 'Import impossible.');
                setSummary({ created: 0, updated: 0, skipped: 0, message: result.message });
                return;
              }
              setSummary({
                created: result.data?.created ?? 0,
                updated: result.data?.updated ?? 0,
                skipped: result.data?.skipped ?? 0,
              });
              toast.success(result.message ?? 'Import terminé.');
              router.refresh();
            } finally {
              setPending(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="product-file">Fichier CSV</Label>
            <Input id="product-file" name="file" type="file" accept=".csv,text/csv" required />
          </div>

          {summary ? (
            <Alert variant={summary.created + summary.updated > 0 ? 'success' : 'warning'}>
              {summary.created} créé(s), {summary.updated} mis à jour, {summary.skipped} ignoré(s).
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
