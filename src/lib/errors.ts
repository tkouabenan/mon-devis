/**
 * Diagnostic des erreurs de base de données.
 *
 * Objectif : quand la base n'est pas configurée (variable absente), pas encore
 * migrée ou injoignable — typiquement sur un déploiement où `DATABASE_URL` n'a
 * pas été définie — l'utilisateur doit voir une explication en français et un
 * moyen de vérifier, jamais une page d'erreur générique.
 */

const DATABASE_ERROR_CODES: Record<string, string> = {
  // Connexion
  ECONNREFUSED: 'aucun serveur PostgreSQL ne répond à cette adresse',
  ENOTFOUND: "l'hôte de la base est introuvable",
  ETIMEDOUT: 'le serveur PostgreSQL ne répond pas (délai dépassé)',
  ECONNRESET: 'la connexion à la base a été interrompue',
  // Authentification / existence
  '28P01': 'identifiants PostgreSQL refusés',
  '28000': 'authentification PostgreSQL refusée',
  '3D000': "la base de données indiquée n'existe pas",
  '42P01': "les tables sont absentes : les migrations n'ont pas été appliquées",
  '57P03': 'le serveur PostgreSQL est en cours de démarrage',
};

/** Renvoie la cause lisible d'une erreur de base, ou `null` si ce n'en est pas une. */
export function describeDatabaseError(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: string; message?: string; cause?: unknown };

    if (typeof candidate.code === 'string' && DATABASE_ERROR_CODES[candidate.code]) {
      return DATABASE_ERROR_CODES[candidate.code];
    }
    if (typeof candidate.message === 'string' && candidate.message.includes('DATABASE_URL est obligatoire')) {
      return "la variable DATABASE_URL n'est pas définie sur ce déploiement";
    }
    current = candidate.cause;
  }

  return null;
}

/**
 * Message affiché à l'utilisateur lorsqu'une opération échoue à cause de la base.
 * `null` lorsque l'erreur n'a rien à voir avec la base (à traiter autrement).
 */
export function databaseErrorMessage(error: unknown): string | null {
  const reason = describeDatabaseError(error);
  if (!reason) return null;

  const isProduction = process.env.NODE_ENV === 'production';
  const hint = isProduction
    ? "Vérifiez la variable DATABASE_URL du déploiement puis l'état du service sur /api/health."
    : 'Base locale : lancez `npm run setup` (ou `npm run db:start`), puis `npm run db:migrate`.';

  return `Service momentanément indisponible : ${reason}. ${hint}`;
}
