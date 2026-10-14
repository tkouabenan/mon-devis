/**
 * Plans d'abonnement et contrôle des accès (feature gating).
 *
 * Les plans sont stockés en base (`subscription_plans`) et modifiables depuis
 * l'administration : tarifs, limites et fonctionnalités. Les valeurs ci-dessous
 * constituent le jeu de données initial et le repli si la base est indisponible.
 *
 * Aucun prix « réel » n'est inventé : les tarifs par défaut sont à 0 et doivent
 * être configurés dans l'administration (Administration → Tarifs).
 */

export interface PlanLimits {
  /** Nombre de devis créés par mois (null = illimité). */
  quotationsPerMonth: number | null;
  customers: number | null;
  products: number | null;
  members: number | null;
  /** Nombre de profils d'entreprise (multi-sociétés). */
  companies: number | null;
  exports: { pdf: boolean; docx: boolean; xlsx: boolean };
  customBranding: boolean;
  customTemplates: boolean;
  advancedAnalytics: boolean;
  advancedReporting: boolean;
  shareLinks: boolean;
  emailSharing: boolean;
  prioritySupport: boolean;
}

export interface PlanDefinition {
  code: string;
  name: string;
  tagline: string;
  description: string;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  limits: PlanLimits;
  isDefault: boolean;
  sortOrder: number;
}

export const PLAN_LIMITS_UNLIMITED = null;

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    code: 'free',
    name: 'Gratuit',
    tagline: 'Pour découvrir MON DEVIS',
    description: 'Créez vos premiers devis professionnels sans engagement.',
    currency: 'EUR',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      "Jusqu'à 5 devis par mois",
      '10 clients enregistrés',
      '20 produits et services',
      'Modèles de base',
      'Calcul automatique des totaux et taxes',
      'Export PDF avec filigrane',
      'Aperçu du devis en temps réel',
    ],
    limits: {
      quotationsPerMonth: 5,
      customers: 10,
      products: 20,
      members: 1,
      companies: 1,
      exports: { pdf: true, docx: false, xlsx: false },
      customBranding: false,
      customTemplates: false,
      advancedAnalytics: false,
      advancedReporting: false,
      shareLinks: false,
      emailSharing: false,
      prioritySupport: false,
    },
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'pro',
    name: 'Pro',
    tagline: 'Pour les indépendants et artisans',
    description: 'Devis illimités, personnalisation complète et tous les exports.',
    currency: 'EUR',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Devis illimités',
      'Clients et produits illimités',
      'Personnalisation de votre image (logo, couleurs, typographie)',
      'Exports PDF, Word (.docx) et Excel (.xlsx)',
      'Modèles premium',
      'Statistiques avancées',
      'Liens de partage et validation client en ligne',
      'Envoi des devis par e-mail',
      'Suppression du filigrane',
    ],
    limits: {
      quotationsPerMonth: null,
      customers: null,
      products: null,
      members: 1,
      companies: 1,
      exports: { pdf: true, docx: true, xlsx: true },
      customBranding: true,
      customTemplates: true,
      advancedAnalytics: true,
      advancedReporting: false,
      shareLinks: true,
      emailSharing: true,
      prioritySupport: false,
    },
    isDefault: false,
    sortOrder: 2,
  },
  {
    code: 'business',
    name: 'Business',
    tagline: 'Pour les agences et PME',
    description: 'Travail en équipe, plusieurs sociétés et rapports avancés.',
    currency: 'EUR',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Tout le plan Pro',
      'Jusqu’à 10 utilisateurs',
      'Plusieurs profils d’entreprise',
      'Rapports commerciaux avancés',
      'Exports des rapports PDF et Excel',
      'Journal d’activité complet',
      'Support prioritaire',
    ],
    limits: {
      quotationsPerMonth: null,
      customers: null,
      products: null,
      members: 10,
      companies: 5,
      exports: { pdf: true, docx: true, xlsx: true },
      customBranding: true,
      customTemplates: true,
      advancedAnalytics: true,
      advancedReporting: true,
      shareLinks: true,
      emailSharing: true,
      prioritySupport: true,
    },
    isDefault: false,
    sortOrder: 3,
  },
];

export function findDefaultPlan(): PlanDefinition {
  return DEFAULT_PLANS.find((plan) => plan.isDefault) ?? DEFAULT_PLANS[0];
}

export function findPlan(code: string): PlanDefinition | undefined {
  return DEFAULT_PLANS.find((plan) => plan.code === code);
}

/** Limites par défaut si le plan n'est pas résolu (repli prudent : plan gratuit). */
export function limitsForPlan(planCode: string | null | undefined): PlanLimits {
  return findPlan(planCode ?? 'free')?.limits ?? findDefaultPlan().limits;
}

export function isUnlimited(limit: number | null): limit is null {
  return limit === null;
}

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  message?: string;
}

/** Vérifie un quota d'usage (ex. devis créés ce mois-ci). */
export function checkQuota(used: number, limit: number | null, label: string): QuotaCheckResult {
  if (limit === null) return { allowed: true, used, limit };
  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      message: `Vous avez atteint la limite de votre plan (${limit} ${label}). Passez à un plan supérieur pour continuer.`,
    };
  }
  return { allowed: true, used, limit };
}

export const QUOTA_MESSAGES = {
  quotations: (limit: number) =>
    `Votre plan autorise ${limit} devis par mois. Passez au plan Pro pour créer des devis illimités.`,
  customers: (limit: number) =>
    `Votre plan autorise ${limit} clients enregistrés. Passez au plan Pro pour une gestion client illimitée.`,
  products: (limit: number) =>
    `Votre plan autorise ${limit} produits et services. Passez au plan Pro pour un catalogue illimité.`,
  members: (limit: number) =>
    `Votre plan autorise ${limit} utilisateur${limit > 1 ? 's' : ''}. Passez au plan Business pour travailler en équipe.`,
  companies: (limit: number) =>
    `Votre plan autorise ${limit} profil${limit > 1 ? 's' : ''} d’entreprise. Passez au plan Business pour gérer plusieurs sociétés.`,
  docx: 'L’export Word est disponible à partir du plan Pro.',
  xlsx: 'L’export Excel est disponible à partir du plan Pro.',
  pdfWatermark: 'Le filigrane est supprimé à partir du plan Pro.',
  sharing: 'Le partage en ligne et la validation client sont disponibles à partir du plan Pro.',
  template: 'Ce modèle est réservé aux plans Pro et Business.',
  analytics: 'Les statistiques avancées sont disponibles à partir du plan Pro.',
  reporting: 'Les rapports commerciaux avancés sont disponibles avec le plan Business.',
} as const;
