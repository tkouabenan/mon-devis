'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Link2,
  MoreHorizontal,
  Receipt,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  archiveQuotationAction,
  changeQuotationStatusAction,
  createQuotationShareAction,
  deleteQuotationAction,
  duplicateQuotationAction,
  revokeQuotationShareAction,
  sendQuotationAction,
} from '@/app/actions/quotations';
import { convertQuotationToInvoiceAction } from '@/app/actions/invoices';
import { Button, ButtonGroup } from '@/components/ui/button';
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { Input, Label, Select } from '@/components/ui/form';
import { Alert } from '@/components/ui/display';
import { ALLOWED_STATUS_TRANSITIONS, QUOTATION_STATUSES } from '@/lib/constants';
import type { QuotationStatus } from '@/db/schema';

/**
 * Actions d'un devis : envoi, statut, partage sécurisé, conversion en facture,
 * exports et suppression. Les règles métier (transitions autorisées, quotas,
 * journal d'audit) sont appliquées côté serveur.
 */
export function QuotationActions({
  quotationId,
  quotationNumber,
  status,
  hasCustomerEmail,
  canShare,
  canExportDocx,
  canExportXlsx,
  canConvertToInvoice,
}: {
  quotationId: string;
  quotationNumber: string;
  status: QuotationStatus;
  hasCustomerEmail: boolean;
  canShare: boolean;
  canExportDocx: boolean;
  canExportXlsx: boolean;
  canConvertToInvoice: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<'delete' | 'convert' | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [shareDays, setShareDays] = React.useState('30');

  const run = async (
    key: string,
    action: () => Promise<{ success: boolean; message?: string }>,
    onSuccess?: () => void,
  ) => {
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

  const nextStatuses = (ALLOWED_STATUS_TRANSITIONS[status] ?? []).filter((value) => value !== 'CANCELLED');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        loading={pending === 'send'}
        onClick={() => run('send', () => sendQuotationAction(quotationId))}
        disabled={status === 'ACCEPTED' || status === 'CANCELLED'}
      >
        <Send className="size-4" aria-hidden />
        {hasCustomerEmail ? 'Envoyer au client' : 'Envoi au client'}
      </Button>

      <ButtonGroup>
        <Button variant="outline" asChild>
          <a href={`/api/devis/${quotationId}/export?format=pdf`} target="_blank" rel="noreferrer">
            <FileText className="size-4" aria-hidden />
            PDF
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={canExportDocx ? `/api/devis/${quotationId}/export?format=docx&download=1` : '/abonnement'}
            title={canExportDocx ? 'Télécharger la version Word éditable' : 'Disponible à partir du plan Pro'}
          >
            <Download className="size-4" aria-hidden />
            Word
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={canExportXlsx ? `/api/devis/${quotationId}/export?format=xlsx&download=1` : '/abonnement'}
            title={canExportXlsx ? 'Télécharger le classeur Excel avec formules' : 'Disponible à partir du plan Pro'}
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel
          </a>
        </Button>
      </ButtonGroup>

      {canConvertToInvoice ? (
        <Button
          variant="success"
          loading={pending === 'invoice'}
          onClick={() => setConfirm('convert')}
          disabled={status !== 'ACCEPTED'}
          title={status === 'ACCEPTED' ? 'Créer la facture correspondante' : 'Le devis doit être accepté'}
        >
          <Receipt className="size-4" aria-hidden />
          Convertir en facture
        </Button>
      ) : null}

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
              onSelect={() => void run(`status-${target}`, () => changeQuotationStatusAction(quotationId, target))}
            >
              <BadgeCheck className="size-4" aria-hidden />
              Marquer « {QUOTATION_STATUSES[target].label} »
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canShare} onSelect={() => setShareOpen(true)}>
            <Link2 className="size-4" aria-hidden />
            Générer un lien de partage
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void run('duplicate', async () => {
                const result = await duplicateQuotationAction(quotationId);
                if (result.success && result.data) router.push(`/devis/${result.data.id}/modifier`);
                return result;
              })
            }
          >
            <Copy className="size-4" aria-hidden />
            Dupliquer
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void run('archive', () => archiveQuotationAction(quotationId, true), () => router.push('/devis'))}
          >
            <Archive className="size-4" aria-hidden />
            Archiver
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run('unarchive', () => archiveQuotationAction(quotationId, false))}>
            <ArchiveRestore className="size-4" aria-hidden />
            Désarchiver
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={() => void run('cancel', () => changeQuotationStatusAction(quotationId, 'CANCELLED', 'Annulation manuelle'))}
          >
            <XCircle className="size-4" aria-hidden />
            Annuler le devis
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setConfirm('delete')}>
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" asChild>
        <Link href={`/devis/${quotationId}/modifier`}>Modifier</Link>
      </Button>

      {/* Lien de partage */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien de partage sécurisé</DialogTitle>
            <DialogDescription>
              Votre client peut consulter le devis en ligne, puis l’accepter ou le refuser. Le lien est révocable et expire
              automatiquement.
            </DialogDescription>
          </DialogHeader>

          {!canShare ? (
            <Alert variant="warning">
              Le partage en ligne est disponible à partir du plan Pro.{' '}
              <Link href="/abonnement" className="font-medium underline underline-offset-4">
                Comparer les formules
              </Link>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="share-days">Durée de validité du lien</Label>
                <Select id="share-days" value={shareDays} onChange={(event) => setShareDays(event.target.value)}>
                  <option value="7">7 jours</option>
                  <option value="15">15 jours</option>
                  <option value="30">30 jours</option>
                  <option value="60">60 jours</option>
                </Select>
              </div>

              {shareUrl ? (
                <div className="space-y-1.5">
                  <Label htmlFor="share-url">Lien à transmettre</Label>
                  <div className="flex gap-2">
                    <Input id="share-url" value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          toast.success('Lien copié dans le presse-papiers.');
                        } catch {
                          toast.error('Copie impossible : sélectionnez le lien manuellement.');
                        }
                      }}
                    >
                      Copier
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShareOpen(false)}>
              Fermer
            </Button>
            {canShare ? (
              <Button
                loading={pending === 'share'}
                onClick={() =>
                  run('share', async () => {
                    const result = await createQuotationShareAction(quotationId, { expiresInDays: Number(shareDays) });
                    if (result.success && result.data) {
                      setShareUrl(result.data.url);
                    }
                    return result;
                  })
                }
              >
                <Link2 className="size-4" aria-hidden />
                {shareUrl ? 'Créer un nouveau lien' : 'Créer le lien'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => setConfirm(open ? 'delete' : null)}
        title={`Supprimer le devis ${quotationNumber} ?`}
        description="Le devis part en corbeille : il disparaît des listes et des statistiques mais reste récupérable."
        confirmLabel="Supprimer"
        loading={pending === 'delete'}
        onConfirm={() =>
          run('delete', () => deleteQuotationAction(quotationId), () => {
            setConfirm(null);
            router.push('/devis');
          })
        }
      />

      <ConfirmDialog
        open={confirm === 'convert'}
        onOpenChange={(open) => setConfirm(open ? 'convert' : null)}
        title={`Convertir le devis ${quotationNumber} en facture ?`}
        description="La facture copie le devis (client, lignes, totaux, conditions) et conserve ses propres données : les modifications ultérieures du devis ne l’affecteront pas."
        confirmLabel="Créer la facture"
        destructive={false}
        loading={pending === 'invoice'}
        onConfirm={() =>
          run(
            'invoice',
            async () => {
              const result = await convertQuotationToInvoiceAction(quotationId);
              if (result.success && result.data) {
                router.push(`/factures/${result.data.id}`);
              }
              return result;
            },
            () => setConfirm(null),
          )
        }
      />
    </div>
  );
}
