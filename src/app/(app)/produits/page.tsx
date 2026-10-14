import Link from 'next/link';
import type { Metadata } from 'next';
import { Download, Package, Search } from 'lucide-react';
import { requireOrganization } from '@/lib/auth/guards';
import { listProductCategories, listProducts } from '@/lib/services/products';
import { listOrganizationCurrencies } from '@/lib/services/analytics';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, Badge, EmptyState } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { Table, TableShell } from '@/components/ui/table';
import { ImportProductsDialog, ProductFormDialog } from '@/components/products/product-form';
import { ProductRowActions } from '@/components/products/product-actions';

export const metadata: Metadata = {
  title: 'Produits & Services',
  description: 'Catalogue réutilisable dans vos devis et factures.',
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; categorie?: string; devise?: string; tri?: string; page?: string }>;
}) {
  const context = await requireOrganization();
  const params = await searchParams;
  const organizationId = context.organization.id;

  const [currencies, categories] = await Promise.all([
    listOrganizationCurrencies(organizationId),
    listProductCategories(organizationId),
  ]);

  const status = params.statut === 'ACTIVE' || params.statut === 'ARCHIVED' ? params.statut : undefined;
  const list = await listProducts(organizationId, {
    search: params.q?.trim() || undefined,
    category: params.categorie || undefined,
    currency: currencies.includes(params.devise ?? '') ? params.devise : undefined,
    status,
    sort: (params.tri as 'recent' | 'name' | 'price_asc' | 'price_desc') ?? 'name',
    page: Number(params.page ?? 1) || 1,
    pageSize: 25,
  });

  const buildPageHref = (page: number) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.statut) search.set('statut', params.statut);
    if (params.categorie) search.set('categorie', params.categorie);
    if (params.devise) search.set('devise', params.devise);
    if (params.tri) search.set('tri', params.tri);
    if (page > 1) search.set('page', String(page));
    const value = search.toString();
    return `/produits${value ? `?${value}` : ''}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Produits & Services</h1>
          <p className="text-sm text-muted-foreground">
            {list.total.toLocaleString('fr-FR')} élément(s) au catalogue · prix, unités et TVA pré-remplis dans vos documents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/api/produits/export" download>
              <Download className="size-4" aria-hidden />
              Exporter (CSV)
            </a>
          </Button>
          <ImportProductsDialog />
          <ProductFormDialog currencies={currencies} categories={categories} />
        </div>
      </div>

      <Card>
        <CardContent>
          <form action="/produits" method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="q" className="label-caps block">
                Rechercher
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Nom, référence, catégorie…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="categorie" className="label-caps block">
                Catégorie
              </label>
              <Select id="categorie" name="categorie" defaultValue={params.categorie ?? ''} className="lg:w-48">
                <option value="">Toutes</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="statut" className="label-caps block">
                Statut
              </label>
              <Select id="statut" name="statut" defaultValue={params.statut ?? ''} className="lg:w-40">
                <option value="">Tous</option>
                <option value="ACTIVE">Actifs</option>
                <option value="ARCHIVED">Inactifs</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tri" className="label-caps block">
                Trier par
              </label>
              <Select id="tri" name="tri" defaultValue={params.tri ?? 'name'} className="lg:w-44">
                <option value="name">Nom (A → Z)</option>
                <option value="recent">Ajout récent</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="outline">
                Filtrer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/produits">Réinitialiser</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {list.rows.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" aria-hidden />}
          title={params.q || params.categorie ? 'Aucun élément ne correspond à ces filtres' : 'Votre catalogue est vide'}
          description="Ajoutez vos prestations et produits récurrents : ils seront proposés automatiquement lors de la création d’un devis."
          action={<ProductFormDialog currencies={currencies} categories={categories} />}
        />
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Référence</th>
                <th>Catégorie</th>
                <th>Unité</th>
                <th className="text-right">Prix HT</th>
                <th className="text-right">TVA</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((product) => (
                <tr key={product.id}>
                  <td>
                    <span className="font-medium">{product.name}</span>
                    {product.description ? (
                      <span className="block max-w-[260px] truncate text-xs text-muted-foreground">{product.description}</span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground">{product.code ?? '—'}</td>
                  <td className="text-muted-foreground">{product.category ?? '—'}</td>
                  <td className="text-muted-foreground">{product.unit}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {formatCurrency(Number(product.unitPrice), product.currency, 'fr-FR')}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">{Number(product.taxRate)} %</td>
                  <td>
                    <Badge variant={product.status === 'ACTIVE' ? 'success' : 'outline'}>
                      {product.status === 'ACTIVE' ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <ProductFormDialog
                        currencies={currencies.length > 0 ? currencies : [product.currency]}
                        categories={categories}
                        product={{
                          id: product.id,
                          name: product.name,
                          code: product.code,
                          description: product.description,
                          category: product.category,
                          unit: product.unit,
                          unitPrice: product.unitPrice,
                          currency: product.currency,
                          taxRate: product.taxRate,
                          status: product.status,
                        }}
                        trigger={
                          <Button variant="outline" size="sm">
                            Modifier
                          </Button>
                        }
                      />
                      <ProductRowActions productId={product.id} productName={product.name} status={product.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {list.page} sur {list.pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild={list.page > 1} disabled={list.page === 1}>
                  {list.page > 1 ? <Link href={buildPageHref(list.page - 1)}>Précédent</Link> : <span>Précédent</span>}
                </Button>
                <Button variant="outline" size="sm" asChild={list.page < list.pageCount} disabled={list.page >= list.pageCount}>
                  {list.page < list.pageCount ? <Link href={buildPageHref(list.page + 1)}>Suivant</Link> : <span>Suivant</span>}
                </Button>
              </div>
            </div>
          ) : null}
        </TableShell>
      )}
    </div>
  );
}
