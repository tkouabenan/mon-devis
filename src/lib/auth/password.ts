import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Jeton opaque (sessions, partages, vérifications) : seule l'empreinte est stockée. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Estimation de la robustesse d'un mot de passe (0-4) pour l'indicateur d'interface. */
export function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const normalized = Math.min(4, Math.max(0, score - 1));
  const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  return { score: normalized, label: labels[normalized] };
}

export const PASSWORD_MIN_LENGTH = 8;

/** Valide un mot de passe selon la politique de la plateforme. */
export function validatePasswordPolicy(password: string): { valid: boolean; message?: string } {
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
