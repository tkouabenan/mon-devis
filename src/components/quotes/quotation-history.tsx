'use client';

import * as React from 'react';
import { QUOTATION_STATUSES } from '@/lib/constants';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/utils';
import type { QuotationStatus } from '@/db/schema';

export interface QuotationHistoryEntry {
  id: string;
  fromStatus?: QuotationStatus | null;
  toStatus: QuotationStatus;
  source: string;
  note?: string | null;
  actorName?: string | null;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Action manuelle',
  CUSTOMER_LINK: 'Décision client (lien)',
  CUSTOMER_EMAIL: 'Réponse client (e-mail)',
  AUTOMATION: 'Automatisation MON DEVIS',
  SYSTEM: 'Système',
  IMPORT: 'Import',
};

/**
 * Chronologie des changements de statut d'un devis.
 * Aucun événement n'est inventé : seuls les mouvements réellement enregistrés
 * en base (action manuelle, décision client via lien sécurisé, automatisation)
 * apparaissent ici.
 */
export function QuotationHistory({ history }: { history: QuotationHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun changement de statut enregistré pour l’instant.</p>;
  }

  return (
    <ol className="space-y-4">
      {history.map((entry) => (
        <li key={entry.id} className="relative space-y-1.5 border-l-2 border-border pl-4">
          <span className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            {entry.fromStatus ? (
              <>
                <span className="text-xs text-muted-foreground">{QUOTATION_STATUSES[entry.fromStatus].label}</span>
                <span className="text-xs text-muted-foreground" aria-hidden>
                  →
                </span>
              </>
            ) : null}
            <StatusBadge status={entry.toStatus} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(entry.createdAt)} · {SOURCE_LABELS[entry.source] ?? entry.source}
            {entry.actorName ? ` · ${entry.actorName}` : ''}
          </p>
          {entry.note ? <p className="text-sm text-muted-foreground">« {entry.note} »</p> : null}
        </li>
      ))}
    </ol>
  );
}
