import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { describeDatabaseError } from '@/lib/errors';

/**
 * Vérifie que PostgreSQL répond réellement (et non seulement que la variable
 * d'environnement est renseignée). Utilisé par la page de connexion pour
 * afficher une explication au lieu d'un formulaire qui échouerait en silence.
 */
export async function checkDatabaseAvailability(): Promise<{ available: boolean; reason: string | null }> {
  try {
    await db.execute(sql`select 1`);
    return { available: true, reason: null };
  } catch (error) {
    const reason =
      describeDatabaseError(error) ??
      (error instanceof Error ? error.message.split('\n')[0] : 'cause inconnue');
    return { available: false, reason };
  }
}
