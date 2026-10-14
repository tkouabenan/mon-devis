'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Copy, Link2, MoreHorizontal, Pencil, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import {
  archiveQuotationAction,
  createQuotationShareAction,
  deleteQuotationAction,
  duplicateQuotationAction,
  restoreQuotationAction,
  revokeQuotationShareAction,
} from '@/app/actions/quotations';
import { convertAndOpenInvoiceAction } from '@/app/actions/invoices';
import { Button } from '@/components/ui/button';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { Input, Label, Select } from '@/components/ui/form';
import { Alert } from '@/components/ui/display';
import type { QuotationStatus } from '@/db/schema';

/**
 * Actions rapides sur un devis (liste et détail).
 * Le lien de partage est créé côté serveur (jeton aléatoire haché, expiration) :
 * il n'est affiché qu'une seule fois, puis seul son préfixe reste consultable.
 */
export function QuotationActionMenu({
  quotationId,
  quotationNumber,
  status,
  canShare,
  canConvert,
  canRestore,
  compact = true,
  onDeleted,
}: {
  quotationId: string;
  quotationNumber: string;
  status: QuotationStatus;
  canShare: boolean;
  canConvert: boolean;
  canRestore?: boolean;
  compact?: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = React.useState('30');

  const run = async (
    key: string,
    action: () => Promise<{ success: boolean; message?: string }>,
    options: { refresh?: boolean; redirectTo?: string } = {},
  ) => {
    setPending(key);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.message ?? 'Action impossible.');
        return false;
      }
      toast.success(result.message ?? 'Action effectuée.');
      if (options.redirectTo) router.push(options.redirectTo);
      else if (options.refresh !== false) router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible.');
      return false;
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={compact ? 'icon-sm' : 'icon'} aria-label={`Actions pour le devis ${quotationNumber}`} loading={Boolean(pending)}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/devis/${quotationId}`}>Ouvrir le devis</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/devis/${quotationId}/modifier`}>
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void run('duplicate', async () => {
                const result = await duplicateQuotationAction(quotationId);
                if (result.success && result.data) router.push(`/devis/${result.data.id}/modifier`);
                return result;
              }, { refresh: false })
            }
          >
            <Copy className="size-4" aria-hidden />
            Dupliquer
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canShare} onSelect={() => setShareOpen(true)}>
            <Link2 className="size-4" aria-hidden />
            Lien de partage
          </DropdownMenuItem>
          {canConvert && status === 'ACCEPTED' ? (
            <DropdownMenuItem onSelect={() => void run('convert', () => convertAndOpenInvoiceAction(quotationId), { refresh: false })}>
              <Receipt className="size-4" aria-hidden />
              Convertir en facture
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          {canRestore ? (
            <DropdownMenuItem onSelect={() => void run('restore', () => restoreQuotationAction(quotationId))}>
              <RotateCcw className="size-4" aria-hidden />
              Restaurer
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => void run('archive', () => archiveQuotationAction(quotationId, true))}>
                <Archive className="size-4" aria-hidden />
                Archiver
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void run('unarchive', () => archiveQuotationAction(quotationId, false))}>
                <ArchiveRestore className="size-4" aria-hidden />
                Désarchiver
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Création d'un lien de partage */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien de partage sécurisé</DialogTitle>
            <DialogDescription>
              Votre client peut consulter le devis en ligne, puis l’accepter ou le refuser. Le jeton est aléatoire, haché en base et
              expire automatiquement.
            </DialogDescription>
          </DialogHeader>

          {!canShare ? (
            <Alert variant="warning">
              Le partage en ligne est inclus à partir de la formule Pro.{' '}
              <Link href="/abonnement" className="font-medium underline underline-offset-4">
                Comparer les formules
              </Link>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="share-expiry">Durée de validité</Label>
                <Select id="share-expiry" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
                  <option value="7">7 jours</option>
                  <option value="15">15 jours</option>
                  <option value="30">30 jours</option>
                  <option value="60">60 jours</option>
                </Select>
              </div>

              {shareUrl ? (
                <div className="space-y-1.5">
                  <Label htmlFor="share-url">Lien à transmettre au client</Label>
                  <div className="flex gap-2">
                    <Input id="share-url" value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          toast.success('Lien copié.');
                        } catch {
                          toast.error('Copie impossible : sélectionnez le lien puis copiez-le.');
                        }
                      }}
                    >
                      Copier
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ce lien n’est affiché qu’une seule fois. Vous serez notifié dès que le client le consultera.
                  </p>
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
                onClick={async () => {
                  setPending('share');
                  try {
                    const result = await createQuotationShareAction(quotationId, { expiresInDays: Number(expiresInDays) });
                    if (!result.success) {
                      toast.error(result.message ?? 'Création du lien impossible.');
                      return;
                    }
                    setShareUrl(result.data?.url ?? null);
                    toast.success(result.message ?? 'Lien créé.');
                    router.refresh();
                  } finally {
                    setPending(null);
                  }
                }}
              >
                <Link2 className="size-4" aria-hidden />
                {shareUrl ? 'Créer un nouveau lien' : 'Créer le lien'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer le devis ${quotationNumber} ?`}
        description="Le devis part en corbeille : il disparaît des listes et des statistiques, mais reste restaurable. Les liens de partage sont révoqués."
        confirmLabel="Supprimer"
        loading={pending === 'delete'}
        onConfirm={() =>
          void run('delete', () => deleteQuotationAction(quotationId), { redirectTo: onDeleted ? undefined : '/devis' }).then(() => {
            setConfirmDelete(false);
            onDeleted?.();
          })
        }
      />
    </>
  );
}

/** Bouton de révocation d'un lien de partage existant. */
export function RevokeShareButton({ shareId, quotationId }: { shareId: string; quotationId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      variant="ghost"
      size="xs"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          const result = await revokeQuotationShareAction(shareId, quotationId);
          if (result.success) {
            toast.success(result.message ?? 'Lien révoqué.');
            router.refresh();
          } else {
            toast.error(result.message ?? 'Révocation impossible.');
          }
        } finally {
          setPending(false);
        }
      }}
    >
      Révoquer
    </Button>
  );
}
