'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, Ban, CheckCircle2, Clock, Send, XCircle } from 'lucide-react';
import { changeQuotationStatusAction } from '@/app/actions/quotations';
import { Button } from '@/components/ui/button';
import { ALLOWED_STATUS_TRANSITIONS, QUOTATION_STATUSES } from '@/lib/constants';
import type { QuotationStatus } from '@/db/schema';

const BUTTON_META: Partial<
  Record<QuotationStatus, { icon: React.ComponentType<{ className?: string }>; variant?: 'default' | 'outline' | 'success' | 'destructive' | 'secondary' }>
> = {
  DRAFT: { icon: Clock, variant: 'outline' },
  SENT: { icon: Send },
  PENDING: { icon: BadgeCheck, variant: 'outline' },
  ACCEPTED: { icon: CheckCircle2, variant: 'success' },
  REJECTED: { icon: XCircle, variant: 'outline' },
  EXPIRED: { icon: Ban, variant: 'outline' },
  CANCELLED: { icon: Ban, variant: 'destructive' },
};

/**
 * Boutons de transition de statut d'un devis.
 * Seules les transitions autorisées par le workflow sont proposées : le service
 * serveur revalide de toute façon chaque changement (et l'historise).
 */
export function QuotationStatusButtons({
  quotationId,
  status,
  size = 'sm',
}: {
  quotationId: string;
  status: QuotationStatus;
  size?: 'sm' | 'default';
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<QuotationStatus | null>(null);

  const transitions = ALLOWED_STATUS_TRANSITIONS[status] ?? [];

  if (transitions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune transition de statut disponible depuis « {QUOTATION_STATUSES[status].label} ».</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((target) => {
        const meta = BUTTON_META[target] ?? { icon: BadgeCheck, variant: 'outline' as const };
        const Icon = meta.icon;
        return (
          <Button
            key={target}
            size={size}
            variant={(meta.variant as 'outline' | 'success' | 'destructive' | 'default' | 'secondary' | undefined) ?? 'outline'}
            loading={pending === target}
            onClick={async () => {
              setPending(target);
              try {
                const result = await changeQuotationStatusAction(quotationId, target);
                if (result.success) {
                  toast.success(result.message ?? 'Statut mis à jour.');
                  router.refresh();
                } else {
                  toast.error(result.message ?? 'Changement de statut impossible.');
                }
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Changement de statut impossible.');
              } finally {
                setPending(null);
              }
            }}
          >
            <Icon className="size-4" aria-hidden />
            {QUOTATION_STATUSES[target].label}
          </Button>
        );
      })}
    </div>
  );
}
