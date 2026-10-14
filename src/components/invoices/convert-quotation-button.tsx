'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { convertAndOpenInvoiceAction } from '@/app/actions/invoices';
import { Button } from '@/components/ui/button';

/**
 * Convertit un devis accepté en facture, puis ouvre la facture créée.
 * La création se fait entièrement côté serveur (transaction, numérotation,
 * contrôle des quotas) ; le bouton ne fait que déclencher l'action.
 */
export function ConvertQuotationButton({
  quotationId,
  quotationNumber,
  size = 'sm',
  variant = 'default',
  label,
}: {
  quotationId: string;
  quotationNumber: string;
  size?: 'sm' | 'default' | 'xs';
  variant?: 'default' | 'outline' | 'secondary' | 'success';
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      size={size}
      variant={variant}
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          const result = await convertAndOpenInvoiceAction(quotationId);
          if (result.success) {
            toast.success(result.message ?? `Facture créée depuis le devis ${quotationNumber}.`);
            router.refresh();
          } else {
            toast.error(result.message ?? 'Conversion impossible.');
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Conversion impossible.');
        } finally {
          setPending(false);
        }
      }}
    >
      <Receipt className="size-4" aria-hidden />
      {label ?? 'Facturer'}
    </Button>
  );
}
