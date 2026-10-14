'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from 'lucide-react';
import { deleteProductAction, setProductStatusAction } from '@/app/actions/products';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay';

/** Actions du catalogue : activer / archiver / supprimer un produit ou service. */
export function ProductRowActions({
  productId,
  productName,
  status,
}: {
  productId: string;
  productName: string;
  status: 'ACTIVE' | 'ARCHIVED';
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const run = async (action: () => Promise<{ success: boolean; message?: string }>) => {
    setPending(true);
    try {
      const result = await action();
      if (result.success) {
        toast.success(result.message ?? 'Catalogue mis à jour.');
        router.refresh();
        return true;
      }
      toast.error(result.message ?? 'Action impossible.');
      return false;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible.');
      return false;
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${productName}`} loading={pending}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void run(() => setProductStatusAction(productId, status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE'))}>
            {status === 'ACTIVE' ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
            {status === 'ACTIVE' ? 'Désactiver' : 'Réactiver'}
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer ${productName} ?`}
        description="Cette suppression est définitive. Les devis déjà émis conservent leurs lignes telles qu’elles ont été enregistrées."
        confirmLabel="Supprimer"
        loading={pending}
        onConfirm={() =>
          void run(() => deleteProductAction(productId)).then((ok) => {
            if (ok) setConfirmDelete(false);
          })
        }
      />
    </>
  );
}
