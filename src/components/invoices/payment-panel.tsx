'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Coins, Trash2 } from 'lucide-react';
import { deleteInvoicePaymentAction, recordInvoicePaymentAction } from '@/app/actions/invoices';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, DefinitionList } from '@/components/ui/display';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlay';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { INVOICE_PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/utils';

export interface PaymentRow {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  note: string | null;
  paidAt: string;
}

/**
 * Suivi des règlements d'une facture : encaissements partiels, historique complet
 * et suppression (tracée dans le journal d'audit). Le statut de la facture est
 * recalculé côté serveur après chaque opération.
 */
export function PaymentPanel({
  invoiceId,
  invoiceNumber,
  currency,
  total,
  amountPaid,
  balance,
  status,
  payments,
  readOnly,
}: {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  total: number;
  amountPaid: number;
  balance: number;
  status: string;
  payments: PaymentRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = React.useState<PaymentRow | null>(null);
  const [state, formAction, isPending] = React.useActionState(recordInvoicePaymentAction, undefined);

  React.useEffect(() => {
    if (state?.success) {
      toast.success(state.message ?? 'Règlement enregistré.');
      setOpen(false);
      setErrors({});
      router.refresh();
    } else if (state && !state.success) {
      setErrors(state.errors ?? {});
      toast.error(state.message ?? 'Enregistrement impossible.');
    }
  }, [state, router]);

  const solded = balance <= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4" aria-hidden />
            Règlements
          </CardTitle>
          <CardDescription>
            {readOnly
              ? 'Facture annulée : les règlements restent consultables.'
              : solded
                ? 'Facture intégralement réglée.'
                : `Solde restant dû : ${formatCurrency(balance, currency, 'fr-FR')}.`}
          </CardDescription>
        </div>
        {!readOnly && !solded ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            Enregistrer un règlement
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <DefinitionList
          items={[
            { label: 'Total facturé', value: formatCurrency(total, currency, 'fr-FR') },
            { label: 'Déjà encaissé', value: formatCurrency(amountPaid, currency, 'fr-FR') },
            { label: 'Reste dû', value: formatCurrency(balance, currency, 'fr-FR') },
            { label: 'Statut', value: status },
          ]}
        />

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun règlement enregistré. Chaque encaissement (partiel ou total) peut être consigné ici avec son mode de paiement et sa
            référence.
          </p>
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {formatCurrency(Number(payment.amount), currency, 'fr-FR')} ·{' '}
                    {INVOICE_PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Encaissé le {formatDateShort(payment.paidAt)}
                    {payment.reference ? ` · réf. ${payment.reference}` : ''}
                  </p>
                  {payment.note ? <p className="text-xs text-muted-foreground">{payment.note}</p> : null}
                </div>
                {!readOnly ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Supprimer ce règlement"
                    onClick={() => setConfirmDelete(payment)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && !solded && payments.length > 0 ? (
          <Alert variant="info">
            Les encaissements partiels passent automatiquement la facture en « Paiement partiel » ; le solde est mis à jour dans les
            statistiques et les exports.
          </Alert>
        ) : null}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un règlement</DialogTitle>
            <DialogDescription>
              Facture {invoiceNumber} · solde restant {formatCurrency(balance, currency, 'fr-FR')}
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Montant encaissé</Label>
                <Input
                  id="payment-amount"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={balance > 0 ? String(balance) : ''}
                  required
                />
                <FieldError message={errors.amount} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-method">Mode de paiement</Label>
                <Select id="payment-method" name="method" defaultValue="BANK_TRANSFER">
                  {Object.entries(INVOICE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">Date d’encaissement</Label>
                <Input id="payment-date" name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-reference">Référence (n° de transaction…)</Label>
                <Input id="payment-reference" name="reference" placeholder="TRX-2026-00123" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="payment-note">Note interne</Label>
                <Textarea id="payment-note" name="note" rows={2} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={isPending || pending}>
                Enregistrer le règlement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(value) => setConfirmDelete(value ? confirmDelete : null)}
        title="Supprimer ce règlement ?"
        description="Le montant sera retiré du total encaissé et le statut de la facture recalculé. L’opération est enregistrée dans le journal d’audit."
        confirmLabel="Supprimer"
        loading={pending}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setPending(true);
          try {
            const result = await deleteInvoicePaymentAction(invoiceId, confirmDelete.id);
            if (result.success) {
              toast.success(result.message ?? 'Règlement supprimé.');
              setConfirmDelete(null);
              router.refresh();
            } else {
              toast.error(result.message ?? 'Suppression impossible.');
            }
          } finally {
            setPending(false);
          }
        }}
      />
    </Card>
  );
}
