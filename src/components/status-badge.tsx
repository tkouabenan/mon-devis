import { cn } from '@/lib/utils';
import { INVOICE_STATUSES, QUOTATION_STATUSES } from '@/lib/constants';

/** Pastille de statut de devis (libellé français + couleur cohérente dans toute l'app). */
export function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: string | null | undefined;
  className?: string;
  showDot?: boolean;
}) {
  const definition = QUOTATION_STATUSES[(status as keyof typeof QUOTATION_STATUSES) ?? 'DRAFT'] ?? QUOTATION_STATUSES.DRAFT;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        definition.badgeClass,
        className,
      )}
    >
      {showDot ? <span className="size-1.5 rounded-full" style={{ backgroundColor: definition.color }} aria-hidden /> : null}
      {definition.label}
    </span>
  );
}

/** Pastille de statut de facture (statuts et couleurs propres à la facturation). */
export function InvoiceStatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: string | null | undefined;
  className?: string;
  showDot?: boolean;
}) {
  const definition = INVOICE_STATUSES[(status as keyof typeof INVOICE_STATUSES) ?? 'DRAFT'] ?? INVOICE_STATUSES.DRAFT;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        definition.badgeClass,
        className,
      )}
    >
      {showDot ? <span className="size-1.5 rounded-full" style={{ backgroundColor: definition.color }} aria-hidden /> : null}
      {definition.label}
    </span>
  );
}
