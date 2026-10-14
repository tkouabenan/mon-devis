/**
 * Politique de mot de passe — module pur, importable côté client.
 *
 * Ces règles sont volontairement isolées de `lib/auth/password.ts` (qui utilise
 * `node:crypto` et bcrypt) : les formulaires clients peuvent ainsi afficher les
 * mêmes contraintes que celles appliquées par le serveur.
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordPolicyResult {
  valid: boolean;
  message?: string;
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.` };
  }
  if (password.length > 200) {
    return { valid: false, message: 'Le mot de passe ne peut pas dépasser 200 caractères.' };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' };
  }
  return { valid: true };
}

/** Indicateur de robustesse (0 à 4) utilisé par les formulaires d'inscription. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}
