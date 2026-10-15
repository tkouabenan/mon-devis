'use client';

import { ErrorPanel } from '@/components/system/error-panel';

/** Erreur dans l'espace connecté (tableau de bord, devis, statistiques…). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />;
}
