'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  archiveInvoiceAction,
  changeInvoiceStatusAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  sendInvoiceAction,
} from '@/app/actions/invoices';
import { Button, ButtonGroup } from '@/components/ui/button';
import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { ALLOWED_INVOICE_TRANSITIONS, INVOICE_STATUSES } from '@/lib/constants';
import type { InvoiceStatus } from '@/db/schema';

/**
 * Actions d'une facture : envoi, changement de statut, duplication, exports,
 * archivage et suppression. Toutes les actions passent par des actions serveur
 * (autorisations et journal d'audit côté serveur).
 */
export function InvoiceActions({
  invoiceId,
  invoiceNumber,
  status,
  hasCustomerEmail,
  canExportDocx,
  canExportXlsx,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  hasCustomerEmail: boolean;
  canExportDocx: boolean;
  canExportXlsx: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<'delete' | 'cancel' | null>(null);

  const nextStatuses = (ALLOWED_INVOICE_TRANSITIONS[status] ?? []).filter((value) => value !== 'CANCELLED');

  const run = async (key: string, action: () => Promise<{ success: boolean; message?: string }>, onSuccess?: () => void) => {
    setPending(key);
    try {
      const result = await action();
      if (result.success) {
        toast.success(result.message ?? 'Action effectuée.');
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(result.message ?? 'Action impossible.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        loading={pending === 'send'}
        onClick={() =>
          run('send', () => sendInvoiceAction(invoiceId), () => router.refresh())
        }
      >
        <Send className="size-4" aria-hidden />
        {hasCustomerEmail ? 'Envoyer au client' : 'Envoi (e-mail manquant)'}
      </Button>

      <ButtonGroup>
        <Button variant="outline" asChild>
          <a href={`/api/factures/${invoiceId}/export?format=pdf`} target="_blank" rel="noreferrer">
            <FileText className="size-4" aria-hidden />
            PDF
          </a>
        </Button>
        <Button variant="outline" asChild disabled={!canExportDocx}>
          <a
            href={canExportDocx ? `/api/factures/${invoiceId}/export?format=docx&download=1` : '/abonnement'}
            title={canExportDocx ? 'Télécharger la version Word éditable' : 'Disponible à partir du plan Pro'}
          >
            <Download className="size-4" aria-hidden />
            Word
          </a>
        </Button>
        <Button variant="outline" asChild disabled={!canExportXlsx}>
          <a
            href={canExportXlsx ? `/api/factures/${invoiceId}/export?format=xlsx&download=1` : '/abonnement'}
            title={canExportXlsx ? 'Télécharger le classeur Excel avec formules' : 'Disponible à partir du plan Pro'}
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel
          </a>
        </Button>
      </ButtonGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Autres actions">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Changer le statut</DropdownMenuLabel>
          {nextStatuses.map((target) => (
            <DropdownMenuItem
              key={target}
              onSelect={() => void run(`status-${target}`, () => changeInvoiceStatusAction(invoiceId, target))}
            >
              <CreditCard className="size-4" aria-hidden />
              Marquer « {INVOICE_STATUSES[target].label} »
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirm('cancel')}>
            <XCircle className="size-4" aria-hidden />
            Demander confirmation d’annulation
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              void run('duplicate', async () => {
                const result = await duplicateInvoiceAction(invoiceId);
                if (result.success && result.data) router.push(`/factures/${result.data.id}`);
                return result;
              })
            }
          >
            <Copy className="size-4" aria-hidden />
            Dupliquer en brouillon
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void run('archive', () => archiveInvoiceAction(invoiceId, true), () => router.push('/factures'))
            }
          >
            <Archive className="size-4" aria-hidden />
            Archiver
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run('unarchive', () => archiveInvoiceAction(invoiceId, false))}>
            <ArchiveRestore className="size-4" aria-hidden />
            Désarchiver
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirm('delete')}>
            <Trash2 className="size-4" aria-hidden />
            Supprimer la facture
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" asChild>
        <Link href={`/devis?q=${encodeURIComponent(invoiceNumber)}`}>Retrouver le devis</Link>
      </Button>

      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => setConfirm(open ? 'delete' : null)}
        title={`Supprimer la facture ${invoiceNumber} ?`}
        description="La facture sera placée en corbeille : elle disparaît des listes et des statistiques, mais reste récupérable dans la corbeille."
        confirmLabel="Supprimer"
        loading={pending === 'delete'}
        onConfirm={() =>
          run('delete', () => deleteInvoiceAction(invoiceId), () => {
            setConfirm(null);
            router.push('/factures');
          })
        }
      />

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(open) => setConfirm(open ? 'cancel' : null)}
        title={`Annuler la facture ${invoiceNumber} ?`}
        description="Une facture annulée reste visible pour l’historique mais ne compte plus dans le chiffre d’affaires facturé."
        confirmLabel="Annuler la facture"
        cancelLabel="Conserver"
        loading={pending === 'cancel'}
        onConfirm={() =>
          run('cancel', () => changeInvoiceStatusAction(invoiceId, 'CANCELLED', 'Annulation confirmée'), () => setConfirm(null))
        }
      />
    </div>
  );
}
