import type { QuotationStatus } from '@/db/schema';

/** Statuts de devis : libellés français, couleurs et transitions autorisées. */
export interface StatusDefinition {
  value: QuotationStatus;
  label: string;
  shortLabel: string;
  description: string;
  /** Classes Tailwind pour la pastille (badge). */
  badgeClass: string;
  /** Couleur de tracé pour les graphiques. */
  color: string;
  isFinal: boolean;
  countsAsWon: boolean;
  countsAsLost: boolean;
  countsAsPending: boolean;
}

export const QUOTATION_STATUSES: Record<QuotationStatus, StatusDefinition> = {
  DRAFT: {
    value: 'DRAFT',
    label: 'Brouillon',
    shortLabel: 'Brouillon',
    description: "Devis en cours de préparation, non transmis au client.",
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    color: '#94A3B8',
    isFinal: false,
    countsAsWon: false,
    countsAsLost: false,
    countsAsPending: false,
  },
  SENT: {
    value: 'SENT',
    label: 'Envoyé',
    shortLabel: 'Envoyé',
    description: 'Devis transmis au client, en attente de sa décision.',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
    color: '#2563EB',
    isFinal: false,
    countsAsWon: false,
    countsAsLost: false,
    countsAsPending: true,
  },
  PENDING: {
    value: 'PENDING',
    label: 'En attente',
    shortLabel: 'En attente',
    description: 'Devis en négociation ou en attente de validation interne.',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    color: '#F59E0B',
    isFinal: false,
    countsAsWon: false,
    countsAsLost: false,
    countsAsPending: true,
  },
  ACCEPTED: {
    value: 'ACCEPTED',
    label: 'Accepté',
    shortLabel: 'Accepté',
    description: 'Devis signé ou accepté par le client.',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
    color: '#10B981',
    isFinal: true,
    countsAsWon: true,
    countsAsLost: false,
    countsAsPending: false,
  },
  REJECTED: {
    value: 'REJECTED',
    label: 'Refusé',
    shortLabel: 'Refusé',
    description: 'Devis refusé par le client.',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900',
    color: '#F43F5E',
    isFinal: true,
    countsAsWon: false,
    countsAsLost: true,
    countsAsPending: false,
  },
  EXPIRED: {
    value: 'EXPIRED',
    label: 'Expiré',
    shortLabel: 'Expiré',
    description: "Date de validité dépassée sans décision du client.",
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900',
    color: '#FB923C',
    isFinal: true,
    countsAsWon: false,
    countsAsLost: true,
    countsAsPending: false,
  },
  CANCELLED: {
    value: 'CANCELLED',
    label: 'Annulé',
    shortLabel: 'Annulé',
    description: 'Devis annulé par l’entreprise (erreur, doublon, abandon).',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    color: '#CBD5E1',
    isFinal: true,
    countsAsWon: false,
    countsAsLost: false,
    countsAsPending: false,
  },
};

export const QUOTATION_STATUS_ORDER: QuotationStatus[] = [
  'DRAFT',
  'SENT',
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
];

/** Transitions manuelles autorisées depuis l'interface. */
export const ALLOWED_STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  SENT: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'DRAFT'],
  PENDING: ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['PENDING', 'CANCELLED'],
  REJECTED: ['PENDING', 'CANCELLED'],
  EXPIRED: ['PENDING', 'SENT', 'CANCELLED'],
  CANCELLED: ['DRAFT', 'PENDING'],
};

export function statusLabel(status: QuotationStatus | string | null | undefined): string {
  if (!status) return '—';
  return QUOTATION_STATUSES[status as QuotationStatus]?.label ?? String(status);
}

export function statusBadgeClass(status: QuotationStatus | string | null | undefined): string {
  if (!status) return QUOTATION_STATUSES.DRAFT.badgeClass;
  return QUOTATION_STATUSES[status as QuotationStatus]?.badgeClass ?? QUOTATION_STATUSES.DRAFT.badgeClass;
}

/** Unités de mesure proposées par défaut (personnalisables). */
export const DEFAULT_UNITS = [
  'unité',
  'jour',
  'heure',
  'forfait',
  'm²',
  'm³',
  'ml',
  'kg',
  'tonne',
  'lot',
  'mois',
  'session',
  'page',
  'km',
  'prestation',
];

export const PRODUCT_CATEGORIES_SUGGESTIONS = [
  'Prestation de services',
  'Fourniture de matériel',
  'Main d’œuvre',
  'Construction & BTP',
  'Conseil',
  'Maintenance',
  'Transport',
  'Formation',
  'Autre',
];

export interface CountryOption {
  code: string;
  name: string;
  phonePrefix: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'CI', name: "Côte d'Ivoire", phonePrefix: '+225' },
  { code: 'SN', name: 'Sénégal', phonePrefix: '+221' },
  { code: 'BF', name: 'Burkina Faso', phonePrefix: '+226' },
  { code: 'ML', name: 'Mali', phonePrefix: '+223' },
  { code: 'NE', name: 'Niger', phonePrefix: '+227' },
  { code: 'TG', name: 'Togo', phonePrefix: '+228' },
  { code: 'BJ', name: 'Bénin', phonePrefix: '+229' },
  { code: 'CM', name: 'Cameroun', phonePrefix: '+237' },
  { code: 'GA', name: 'Gabon', phonePrefix: '+241' },
  { code: 'CG', name: 'Congo', phonePrefix: '+242' },
  { code: 'CD', name: 'République démocratique du Congo', phonePrefix: '+243' },
  { code: 'FR', name: 'France', phonePrefix: '+33' },
  { code: 'BE', name: 'Belgique', phonePrefix: '+32' },
  { code: 'CH', name: 'Suisse', phonePrefix: '+41' },
  { code: 'CA', name: 'Canada', phonePrefix: '+1' },
  { code: 'US', name: 'États-Unis', phonePrefix: '+1' },
  { code: 'GB', name: 'Royaume-Uni', phonePrefix: '+44' },
  { code: 'MA', name: 'Maroc', phonePrefix: '+212' },
  { code: 'DZ', name: 'Algérie', phonePrefix: '+213' },
  { code: 'TN', name: 'Tunisie', phonePrefix: '+216' },
  { code: 'AE', name: 'Émirats arabes unis', phonePrefix: '+971' },
  { code: 'OTHER', name: 'Autre pays', phonePrefix: '+' },
];

export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  return COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

/** Taux de TVA usuels selon le pays par défaut. */
export const DEFAULT_TAX_RATES: Record<string, number> = {
  CI: 18,
  SN: 18,
  BF: 18,
  ML: 18,
  NE: 19,
  TG: 18,
  BJ: 18,
  CM: 19.25,
  GA: 18,
  CG: 18,
  CD: 16,
  FR: 20,
  BE: 21,
  CH: 8.1,
  CA: 5,
  MA: 20,
  DZ: 19,
  TN: 19,
  AE: 5,
  US: 0,
  GB: 20,
  OTHER: 0,
};

export function defaultTaxRateForCountry(countryCode: string | null | undefined): number {
  if (!countryCode) return 18;
  return DEFAULT_TAX_RATES[countryCode.toUpperCase()] ?? 0;
}

export const ORG_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
};

export const BILLING_INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: 'Mensuel',
  YEARLY: 'Annuel',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIALING: "Période d'essai",
  ACTIVE: 'Actif',
  PENDING_PAYMENT: 'Paiement en attente',
  PAST_DUE: 'Paiement en retard',
  CANCELED: 'Annulé',
  EXPIRED: 'Expiré',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  SUCCEEDED: 'Payé',
  FAILED: 'Échoué',
  REFUNDED: 'Remboursé',
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Basse',
  NORMAL: 'Normale',
  HIGH: 'Haute',
  URGENT: 'Urgente',
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  QUOTATION_CREATED: 'Devis créé',
  QUOTATION_SENT: 'Devis envoyé',
  QUOTATION_VIEWED: 'Devis consulté',
  QUOTATION_ACCEPTED: 'Devis accepté',
  QUOTATION_REJECTED: 'Devis refusé',
  QUOTATION_EXPIRING: 'Devis bientôt expiré',
  QUOTATION_EXPIRED: 'Devis expiré',
  EXPORT_READY: 'Export disponible',
  SUBSCRIPTION_UPDATE: 'Abonnement',
  ACCOUNT_EVENT: 'Compte',
  TEAM_INVITE: 'Invitation équipe',
  SUPPORT_REPLY: 'Support',
};

/** Blocs de conditions réutilisables (modèles de texte). */
export const TERMS_PRESETS = [
  {
    id: 'payment-30',
    label: 'Paiement à 30 jours',
    content:
      'Paiement à 30 jours date de facturation par virement bancaire ou mobile money. Tout retard de paiement pourra entraîner des pénalités conformément à la réglementation en vigueur.',
  },
  {
    id: 'payment-deposit',
    label: 'Acompte de 40 % à la commande',
    content:
      'Un acompte de 40 % du montant total est exigible à la commande. Le solde sera réglé à la livraison de la prestation.',
  },
  {
    id: 'delivery-2weeks',
    label: 'Délai d’exécution : 2 semaines',
    content:
      "Le délai d'exécution est estimé à 2 semaines à compter de la validation du devis et de la réception de l'acompte.",
  },
  {
    id: 'warranty-12',
    label: 'Garantie 12 mois',
    content:
      "Les prestations bénéficient d'une garantie de 12 mois à compter de la réception. Cette garantie couvre les défauts de mise en œuvre mais exclut l'usure normale et les dommages causés par un usage non conforme.",
  },
  {
    id: 'validity-30',
    label: 'Validité : 30 jours',
    content:
      'Le présent devis est valable 30 jours à compter de sa date d’émission. Passé ce délai, les prix et conditions pourront être révisés.',
  },
  {
    id: 'legal-ci',
    label: 'Mentions légales (Côte d’Ivoire)',
    content:
      "Entreprise immatriculée au Registre du Commerce et du Crédit Mobilier (RCCM) de Côte d'Ivoire. TVA appliquée conformément au Code général des impôts ivoirien. Tout litige relatif au présent devis relève de la compétence des tribunaux d'Abidjan.",
  },
];
