'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, FileText, Mail, Receipt, Trash2 } from 'lucide-react';
import {
  archiveInvoiceAction,
  changeInvoiceStatusAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  sendInvoiceAction,
} from '@/app/actions/invoices';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlay';
import { ALLOWED_INVOICE_TRANSITIONS, INVOICE_STATUSES } from '@/lib/constants';
import type { InvoiceStatus } from '@/db/schema';

/**
 * Menu d'actions d'une facture (liste et détail).
 * Toutes les actions sont exécutées côté serveur avec contrôle des droits ;
 * les transitions de statut impossibles ne sont pas proposées.
 */
export function InvoiceActionMenu({
  invoiceId,
  invoiceNumber,
  status,
  canSend,
  onDeleted,
  compact = true,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  canSend: boolean;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const run = async (
    action: () => Promise<{ success: boolean; message?: string }>,
    options: { refresh?: boolean; redirectTo?: string } = {},
  ) => {
    setPending(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.message ?? 'Action impossible.');
        return;
      }
      toast.success(result.message ?? 'Action effectuée.');
      if (options.redirectTo) router.push(options.redirectTo);
      if (options.refresh !== false) router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setPending(false);
    }
  };

  const nextStatuses = (ALLOWED_INVOICE_TRANSITIONS[status] ?? []).filter(
    (target) => target !== 'OVERDUE' && target !== 'DRAFT',
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={compact ? 'icon-sm' : 'icon'} aria-label={`Actions pour la facture ${invoiceNumber}`} loading={pending}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/factures/${invoiceId}`}>
              <FileText className="size-4" aria-hidden />
              Ouvrir la facture
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canSend}
            onSelect={() => void run(() => sendInvoiceAction(invoiceId))}
            title={canSend ? undefined : 'Le client n’a pas d’adresse e-mail enregistrée.'}
          >
            <Mail className="size-4" aria-hidden />
            Envoyer au client
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void run(async () => {
                const result = await duplicateInvoiceAction(invoiceId);
                if (result.success && result.data) router.push(`/factures/${result.data.id}`);
                return result;
              }, { refresh: false })
            }
          >
            <Receipt className="size-4" aria-hidden />
            Dupliquer (brouillon)
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          {nextStatuses.map((target) => (
            <DropdownMenuItem key={target} onSelect={() => void run(() => changeInvoiceStatusAction(invoiceId, target))}>
              Marquer « {INVOICE_STATUSES[target].label} »
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void run(() => archiveInvoiceAction(invoiceId, true), { refresh: true })}>
            Archiver
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run(() => archiveInvoiceAction(invoiceId, false))}>Désarchiver</DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer la facture ${invoiceNumber} ?`}
        description="La facture part en corbeille : elle disparaît des listes et des statistiques, mais reste récupérable. Les règlements enregistrés sont conservés."
        confirmLabel="Supprimer"
        loading={pending}
        onConfirm={() =>
          void run(() => deleteInvoiceAction(invoiceId), { redirectTo: onDeleted ? undefined : '/factures' }).then(() => {
            setConfirmDelete(false);
            onDeleted?.();
          })
        }
      />
    </>
  );
}
