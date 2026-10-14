'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from 'lucide-react';
import { archiveCustomerAction, deleteCustomerAction } from '@/app/actions/customers';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay';

/**
 * Actions d'un client : archiver (masqué des sélecteurs, historique conservé)
 * ou supprimer définitivement (refusé si des devis y sont rattachés).
 */
export function CustomerRowActions({
  customerId,
  customerName,
  isArchived,
  quotationCount,
}: {
  customerId: string;
  customerName: string;
  isArchived: boolean;
  quotationCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const run = async (action: () => Promise<{ success: boolean; message?: string }>) => {
    setPending(true);
    try {
      const result = await action();
      if (result.success) {
        toast.success(result.message ?? 'Action effectuée.');
        router.refresh();
      } else {
        toast.error(result.message ?? 'Action impossible.');
      }
      return result.success;
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
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${customerName}`} loading={pending}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void run(() => archiveCustomerAction(customerId, !isArchived))}>
            {isArchived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
            {isArchived ? 'Réactiver' : 'Archiver'}
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            disabled={quotationCount > 0}
            onSelect={() => setConfirmDelete(true)}
            title={quotationCount > 0 ? 'Ce client est lié à des devis : archivez-le plutôt.' : undefined}
          >
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer ${customerName} ?`}
        description="Cette suppression est définitive. Elle est refusée si le client est rattaché à des devis ou factures."
        confirmLabel="Supprimer"
        loading={pending}
        onConfirm={() =>
          void run(() => deleteCustomerAction(customerId)).then((ok) => {
            if (ok) setConfirmDelete(false);
          })
        }
      />
    </>
  );
}
