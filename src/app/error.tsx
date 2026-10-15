'use client';

import { ErrorPanel } from '@/components/system/error-panel';

/** Erreur survenue hors de l'espace connecté (pages publiques, inscription…). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />;
}
